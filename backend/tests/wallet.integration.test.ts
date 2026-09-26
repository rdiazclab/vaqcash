import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildContainer } from '../src/container';
import type { EventLocker, WalletRepository } from '../src/domain/ports/repositories';
import { prisma } from '../src/infrastructure/persistence/prisma/client';
import { createApp } from '../src/interfaces/http/app';
import { createBox, registerOrganizer, resetDb, type DashboardBody, type WalletBody } from './helpers';

const app = createApp();

const A = 1234500;
const B = 987600;
const TOTAL = A + B;

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function boxWithTwoEnvelopes(title = 'Cajita con dinero') {
  const org = await registerOrganizer(app);
  const box = await createBox(app, org, { title });
  for (const [amountCents, displayName] of [
    [A, 'Pedro'],
    [B, 'Lucía'],
  ] as const) {
    await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents, displayName })
      .expect(201);
  }
  return { org, box };
}

describe('revelar acredita el monedero', () => {
  it('tras revelar, el saldo es EXACTAMENTE el total y el ledger tiene una sola fila REVEAL_PAYOUT', async () => {
    const { org, box } = await boxWithTwoEnvelopes();

    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    expect((revealed.body as DashboardBody).totalCents).toBe(TOTAL);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: org.userId } });
    expect(wallet.balanceCents).toBe(TOTAL);

    const ledger = await prisma.walletTransaction.findMany();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      walletId: wallet.id,
      eventId: box.id,
      amountCents: TOTAL,
      type: 'REVEAL_PAYOUT',
      idempotencyKey: `reveal:${box.id}`,
    });
    expect(await prisma.walletTransaction.count({ where: { type: 'REVEAL_PAYOUT' } })).toBe(1);

    // El saldo cacheado coincide con la suma del ledger: no hay deriva contable.
    const sum = await prisma.walletTransaction.aggregate({ _sum: { amountCents: true } });
    expect(wallet.balanceCents).toBe(sum._sum.amountCents);
  });

  it('settledTotalCents queda escrito en la cajita y coincide con el crédito', async () => {
    const { org, box } = await boxWithTwoEnvelopes();
    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);

    const stored = await prisma.event.findUniqueOrThrow({ where: { id: box.id } });
    expect(stored.settledTotalCents).toBe(TOTAL);
    expect((revealed.body as DashboardBody).walletCredit!.amountCents).toBe(TOTAL);
  });

  it('dos cajitas del mismo organizador acumulan en el mismo monedero, con dos asientos', async () => {
    const org = await registerOrganizer(app);
    const one = await createBox(app, org, { title: 'Cajita uno' });
    const two = await createBox(app, org, { title: 'Cajita dos' });
    await request(app).post(`/api/caja/${one.uuid}/contributions`).send({ amountCents: A, displayName: 'Pedro' }).expect(201);
    await request(app).post(`/api/caja/${two.uuid}/contributions`).send({ amountCents: B, displayName: 'Lucia' }).expect(201);

    await org.auth(request(app).post(`/api/events/${one.id}/reveal`)).expect(200);
    await org.auth(request(app).post(`/api/events/${two.id}/reveal`)).expect(200);

    const res = await org.auth(request(app).get('/api/wallet')).expect(200);
    const body = res.body as WalletBody;
    expect(body.balanceCents).toBe(TOTAL);
    expect(body.transactions).toHaveLength(2);
    expect(new Set(body.transactions.map((t) => t.eventTitle))).toEqual(new Set(['Cajita uno', 'Cajita dos']));
  });

  it('una cajita vacía acredita 0 pero DEJA el asiento: el ledger no tiene huecos', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita vacía' });

    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    expect((revealed.body as DashboardBody).walletCredit).toEqual({
      amountCents: 0,
      transactionId: expect.any(String),
    });
    expect(await prisma.walletTransaction.count()).toBe(1);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: org.userId } })).balanceCents).toBe(0);
  });

  it('los sobres FAILED y VOIDED no entran en el crédito', async () => {
    const { org, box } = await boxWithTwoEnvelopes();
    await prisma.contribution.createMany({
      data: [
        { eventId: box.id, amountCents: 500_000, displayName: 'Rechazado', isAnonymous: false, status: 'FAILED' },
        { eventId: box.id, amountCents: 600_000, displayName: 'Anulado', isAnonymous: false, status: 'VOIDED' },
        { eventId: box.id, amountCents: 700_000, displayName: 'EnVuelo', isAnonymous: false, status: 'PENDING' },
      ],
    });

    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    const body = revealed.body as DashboardBody;

    expect(body.totalCents).toBe(TOTAL);
    expect(body.settledTotalCents).toBe(TOTAL);
    expect(body.walletBalanceCents).toBe(TOTAL);
    expect(body.pendingRefundCount).toBe(1);
    // El CONTEO de anulados se publica; su monto, jamás.
    expect(revealed.text).not.toContain('600000');
    expect(revealed.text).not.toContain('Anulado');

    const ledger = await prisma.walletTransaction.findMany();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amountCents).toBe(TOTAL);
  });
});

describe('IDEMPOTENCIA DEL PAGO: dos revelaciones en paralelo', () => {
  it('exactamente un 200 y un 409, UN SOLO WalletTransaction, y el saldo acreditado UNA vez', async () => {
    const { org, box } = await boxWithTwoEnvelopes();

    const fire = () => org.auth(request(app).post(`/api/events/${box.id}/reveal`)).then((r) => r);
    const results = await Promise.allSettled([fire(), fire()]);

    const statuses = results
      .map((r) => (r.status === 'fulfilled' ? r.value.status : 0))
      .sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const conflict = results.find((r) => r.status === 'fulfilled' && r.value.status === 409);
    expect(conflict?.status).toBe('fulfilled');
    if (conflict?.status === 'fulfilled') {
      expect(conflict.value.body.error.code).toBe('ALREADY_REVEALED');
    }

    // LO QUE IMPORTA: un único asiento y un único crédito.
    const ledger = await prisma.walletTransaction.findMany();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].idempotencyKey).toBe(`reveal:${box.id}`);
    expect(ledger[0].amountCents).toBe(TOTAL);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: org.userId } });
    expect(wallet.balanceCents).toBe(TOTAL);
    expect(wallet.balanceCents).not.toBe(TOTAL * 2);

    // Y el ganador es el que devolvió el transactionId que existe.
    const winner = results.find((r) => r.status === 'fulfilled' && r.value.status === 200);
    if (winner?.status === 'fulfilled') {
      expect((winner.value.body as DashboardBody).walletCredit!.transactionId).toBe(ledger[0].id);
    }
  });

  it('cinco revelaciones en paralelo: sigue habiendo un solo 200 y un solo asiento', async () => {
    const { org, box } = await boxWithTwoEnvelopes();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => org.auth(request(app).post(`/api/events/${box.id}/reveal`)).then((r) => r)),
    );

    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.status === 200);
    const conflicts = results.filter((r) => r.status === 'fulfilled' && r.value.status === 409);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(4);
    for (const c of conflicts) {
      if (c.status === 'fulfilled') expect(c.value.body.error.code).toBe('ALREADY_REVEALED');
    }

    expect(await prisma.walletTransaction.count()).toBe(1);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: org.userId } })).balanceCents).toBe(TOTAL);
  });

  it('la clave de idempotencia es por cajita: el UNIQUE no bloquea otras cajitas', async () => {
    const org = await registerOrganizer(app);
    const one = await createBox(app, org, { title: 'Cajita uno' });
    const two = await createBox(app, org, { title: 'Cajita dos' });

    await Promise.all([
      org.auth(request(app).post(`/api/events/${one.id}/reveal`)).expect(200),
      org.auth(request(app).post(`/api/events/${two.id}/reveal`)).expect(200),
    ]);

    const keys = (await prisma.walletTransaction.findMany()).map((t) => t.idempotencyKey).sort();
    expect(keys).toEqual([`reveal:${one.id}`, `reveal:${two.id}`].sort());
  });

  it('el UNIQUE es la red de seguridad: insertar la clave a mano hace fallar la revelación SIN revelarla', async () => {
    // Simula "alguien ya pagó esto" salvando el lock por completo: el asiento
    // existe antes de que la revelación llegue a pedirlo.
    const { org, box } = await boxWithTwoEnvelopes();
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: org.userId } });
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        eventId: box.id,
        amountCents: TOTAL,
        type: 'REVEAL_PAYOUT',
        idempotencyKey: `reveal:${box.id}`,
      },
    });

    const res = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(409);
    expect(res.body.error.code).toBe('ALREADY_REVEALED');

    // Ni doble asiento, ni doble saldo, ni revelación a medias.
    expect(await prisma.walletTransaction.count()).toBe(1);
    const stored = await prisma.event.findUniqueOrThrow({ where: { id: box.id } });
    expect(stored.isRevealed).toBe(false);
    expect(stored.revealedAt).toBeNull();
    expect(stored.settledTotalCents).toBeNull();
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balanceCents).toBe(0);
  });
});

describe('ATOMICIDAD revelar -> wallet', () => {
  /**
   * Inyecta un WalletRepository que revienta justo en el crédito, decorando el
   * locker real: la transacción y el lock son los de producción, lo único
   * cambiado es que `creditReveal` lanza. Si la revelación sobrevive a eso, el
   * "todo o nada" era mentira.
   */
  function appWithFailingCredit(message = 'fallo simulado al acreditar la wallet') {
    const decorateLocker = (real: EventLocker): EventLocker => ({
      withEventLock: (eventId, fn) =>
        real.withEventLock(eventId, (locked, repos) => {
          const wallets: WalletRepository = {
            ...repos.wallets,
            findByUserId: repos.wallets.findByUserId.bind(repos.wallets),
            listTransactions: repos.wallets.listTransactions.bind(repos.wallets),
            withdraw: repos.wallets.withdraw.bind(repos.wallets),
            sumLedger: repos.wallets.sumLedger.bind(repos.wallets),
            creditReveal: () => Promise.reject(new Error(message)),
          };
          return fn(locked, { ...repos, wallets });
        }),
    });
    return createApp(buildContainer({ decorateLocker }));
  }

  it('si el crédito a la wallet falla, la cajita NO queda revelada y no hay asiento', async () => {
    const { org, box } = await boxWithTwoEnvelopes();
    const broken = appWithFailingCredit();

    const res = await org.auth(request(broken).post(`/api/events/${box.id}/reveal`)).expect(500);
    expect(res.body.error.code).toBe('INTERNAL');

    const stored = await prisma.event.findUniqueOrThrow({ where: { id: box.id } });
    expect(stored.isRevealed).toBe(false);
    expect(stored.revealedAt).toBeNull();
    expect(stored.settledTotalCents).toBeNull();

    expect(await prisma.walletTransaction.count()).toBe(0);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: org.userId } })).balanceCents).toBe(0);
    // Tampoco quedó auditoría de un pago que no ocurrió.
    expect(await prisma.auditLog.count({ where: { action: { in: ['EVENT_REVEALED', 'WALLET_CREDITED'] } } })).toBe(0);
  });

  it('el dashboard sigue SELLADO después del fallo: no se filtró ningún importe', async () => {
    const { org, box } = await boxWithTwoEnvelopes();
    const broken = appWithFailingCredit();
    await org.auth(request(broken).post(`/api/events/${box.id}/reveal`)).expect(500);

    const dash = await org.auth(request(app).get(`/api/events/${box.id}/dashboard`)).expect(200);
    const body = dash.body as DashboardBody;
    expect(body.isRevealed).toBe(false);
    expect(body.totalCents).toBeNull();
    for (const amount of [A, B, TOTAL]) expect(dash.text).not.toContain(String(amount));
  });

  it('y una vez arreglado el fallo, la revelación funciona con el total intacto', async () => {
    const { org, box } = await boxWithTwoEnvelopes();
    const broken = appWithFailingCredit();
    await org.auth(request(broken).post(`/api/events/${box.id}/reveal`)).expect(500);

    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    expect((revealed.body as DashboardBody).totalCents).toBe(TOTAL);
    expect(await prisma.walletTransaction.count()).toBe(1);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: org.userId } })).balanceCents).toBe(TOTAL);
  });
});

describe('GET /api/wallet', () => {
  it('un monedero recién creado está a cero y sin movimientos', async () => {
    const org = await registerOrganizer(app);
    const res = await org.auth(request(app).get('/api/wallet')).expect(200);
    expect(res.body).toEqual({ balanceCents: 0, currency: 'COP', transactions: [] });
  });

  it('no expone walletId ni idempotencyKey en el ledger', async () => {
    const { org, box } = await boxWithTwoEnvelopes();
    await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);

    const res = await org.auth(request(app).get('/api/wallet')).expect(200);
    expect(res.text).not.toContain('idempotencyKey');
    expect(res.text).not.toContain('walletId');
    expect(Object.keys((res.body as WalletBody).transactions[0]).sort()).toEqual([
      'amountCents',
      'createdAt',
      'eventTitle',
      'id',
      'type',
    ]);
  });
});
