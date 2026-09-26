import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildContainer } from '../src/container';
import type { ChargeRequest, ChargeResult, PaymentGateway } from '../src/domain/ports/payment-gateway';
import { prisma } from '../src/infrastructure/persistence/prisma/client';
import { createApp } from '../src/interfaces/http/app';
import { createBox, registerOrganizer, resetDb } from './helpers';

const AMOUNT = 777_700;

/**
 * Pasarela coordinada por el test: avisa cuando empieza a cobrar y no termina
 * hasta que se le da permiso. Con ella la carrera entre "reservar" y "liquidar"
 * deja de ser una cuestión de milisegundos y pasa a ser determinista, que es lo
 * único que hace honesto un test de contención de lock.
 */
class CoordinatedGateway implements PaymentGateway {
  private started!: () => void;
  /** Se resuelve cuando la reserva ya está confirmada y el cobro está en curso. */
  readonly chargeStarted = new Promise<void>((resolve) => {
    this.started = resolve;
  });

  private release!: () => void;
  private readonly permission = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  finishCharge() {
    this.release();
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    this.started();
    await this.permission;
    return { ok: true, providerRef: `sim_${req.reference.slice(0, 8)}_coordinated` };
  }
}

/** Retiene la fila del evento con FOR UPDATE; `acquired` dice cuándo la tiene de verdad. */
function holdEventLock(eventId: string) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acquired: () => void = () => {};
  const isAcquired = new Promise<void>((resolve) => {
    acquired = resolve;
  });

  const held = prisma.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe('SELECT id FROM "Event" WHERE id = $1 FOR UPDATE', eventId);
      acquired();
      await gate;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  return { isAcquired, release: () => release(), held };
}

const app = createApp();

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('contención del lock -> 503, nunca 500', () => {
  it('la liquidación que no consigue el lock devuelve 503 SETTLEMENT_BUSY con la referencia del cobro', async () => {
    const gateway = new CoordinatedGateway();
    const coordinated = createApp(buildContainer({ payments: gateway }));

    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita con lock ocupado' });

    const contribution = request(coordinated)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: AMOUNT, displayName: 'Pedro' })
      .then((r) => r);

    // La pasarela ya está cobrando, luego la reserva se confirmó y soltó el lock.
    await gateway.chargeStarted;
    expect(await prisma.contribution.count({ where: { status: 'PENDING' } })).toBe(1);

    // Robamos la fila ANTES de dejar que el cobro termine: cuando la liquidación
    // vaya a por el lock, ya no estará libre. Sin ventanas de tiempo que fallar.
    const lock = holdEventLock(box.id);
    await lock.isAcquired;
    gateway.finishCharge();

    const res = await contribution; // agota los 3s de lock_timeout y responde
    lock.release();
    await lock.held;

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SETTLEMENT_BUSY');
    expect(res.body.error.message).toContain('referencia');

    // LA GARANTÍA: el cobro ocurrió y su rastro se guardó ANTES de pelear por el
    // lock, así que el dinero cobrado es localizable aunque la liquidación falle.
    const paymentRef = res.body.error.details.paymentRef;
    expect(paymentRef).toMatch(/^sim_/);
    const row = await prisma.contribution.findFirstOrThrow();
    expect(row.paymentRef).toBe(paymentRef);
    expect(res.body.error.details.contributionId).toBe(row.id);
    expect(row.status).toBe('PENDING'); // reconciliable, no perdido
  });

  it('la reserva que no consigue el lock devuelve 503 LOCK_BUSY y no cobra nada', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita con lock ocupado' });

    const lock = holdEventLock(box.id);
    await lock.isAcquired;
    const res = await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: AMOUNT, displayName: 'Pedro' });
    lock.release();
    await lock.held;

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('LOCK_BUSY');
    // Rechazado antes de tocar la pasarela: ni fila, ni cobro, ni referencia.
    expect(res.body.error.details).toBeUndefined();
    expect(await prisma.contribution.count()).toBe(0);
  });

  it('la revelación que no consigue el lock devuelve 503 y deja la cajita sellada', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita con lock ocupado' });

    const lock = holdEventLock(box.id);
    await lock.isAcquired;
    const res = await org.auth(request(app).post(`/api/events/${box.id}/reveal`));
    lock.release();
    await lock.held;

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('LOCK_BUSY');

    const stored = await prisma.event.findUniqueOrThrow({ where: { id: box.id } });
    expect(stored.isRevealed).toBe(false);
    expect(stored.settledTotalCents).toBeNull();
    expect(await prisma.walletTransaction.count()).toBe(0);
  });

  it('un retiro que no consigue el lock del monedero devuelve 503, no un saldo negativo', async () => {
    const org = await registerOrganizer(app);

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let acquired: () => void = () => {};
    const isAcquired = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const held = prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe('SELECT id FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', org.userId);
        acquired();
        await gate;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
    await isAcquired;

    const res = await org.auth(request(app).post('/api/wallet/withdrawals')).send({ amountCents: 1_000 });
    release();
    await held;

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('LOCK_BUSY');
    expect(await prisma.walletTransaction.count()).toBe(0);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: org.userId } })).balanceCents).toBe(0);
  });
});
