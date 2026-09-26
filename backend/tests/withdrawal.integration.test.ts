import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/infrastructure/persistence/prisma/client';
import { createApp } from '../src/interfaces/http/app';
import { createBox, registerOrganizer, resetDb, type Organizer, type WalletBody } from './helpers';

const app = createApp();

/** Saldo de partida: divisible en trozos limpios para las pruebas de concurrencia. */
const FUNDED = 100_000;

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Deja al organizador con FUNDED en el monedero, por el camino real: aportar y revelar. */
async function fundedOrganizer(amount = FUNDED): Promise<Organizer> {
  const org = await registerOrganizer(app);
  const box = await createBox(app, org, { title: 'Cajita que financia' });
  await request(app)
    .post(`/api/caja/${box.uuid}/contributions`)
    .send({ amountCents: amount, displayName: 'Pedro' })
    .expect(201);
  await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
  return org;
}

function withdraw(org: Organizer, amountCents: unknown) {
  return org.auth(request(app).post('/api/wallet/withdrawals')).send({ amountCents });
}

/** La invariante contable: la suma del ledger es exactamente el balance. */
async function expectLedgerMatchesBalance(userId: string) {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  const sum = await prisma.walletTransaction.aggregate({
    where: { walletId: wallet.id },
    _sum: { amountCents: true },
  });
  expect(sum._sum.amountCents ?? 0).toBe(wallet.balanceCents);
  return wallet;
}

describe('POST /api/wallet/withdrawals', () => {
  it('retira, baja el saldo y deja el asiento en NEGATIVO', async () => {
    const org = await fundedOrganizer();

    const res = await withdraw(org, 30_000).expect(201);
    expect(res.body).toEqual({
      transactionId: expect.any(String),
      amountCents: 30_000, // lo pedido, en positivo
      balanceCents: 70_000,
    });

    const ledgerRow = await prisma.walletTransaction.findUniqueOrThrow({
      where: { id: res.body.transactionId },
    });
    expect(ledgerRow.type).toBe('WITHDRAWAL');
    // EL ASIENTO ES NEGATIVO: es lo que hace que la suma del ledger siga cuadrando.
    expect(ledgerRow.amountCents).toBe(-30_000);

    const wallet = await expectLedgerMatchesBalance(org.userId);
    expect(wallet.balanceCents).toBe(70_000);
  });

  it('INVARIANTE: la suma del ledger es el balance tras varios retiros', async () => {
    const org = await fundedOrganizer();

    for (const amount of [10_000, 25_000, 1, 4_999]) {
      await withdraw(org, amount).expect(201);
      await expectLedgerMatchesBalance(org.userId);
    }

    const wallet = await expectLedgerMatchesBalance(org.userId);
    expect(wallet.balanceCents).toBe(FUNDED - (10_000 + 25_000 + 1 + 4_999));

    const rows = await prisma.walletTransaction.findMany({ where: { walletId: wallet.id } });
    expect(rows.filter((r) => r.type === 'REVEAL_PAYOUT')).toHaveLength(1);
    expect(rows.filter((r) => r.type === 'WITHDRAWAL')).toHaveLength(4);
    expect(rows.filter((r) => r.type === 'WITHDRAWAL').every((r) => r.amountCents < 0)).toBe(true);
  });

  it('retirar el saldo entero lo deja en cero, no en negativo', async () => {
    const org = await fundedOrganizer();
    const res = await withdraw(org, FUNDED).expect(201);
    expect(res.body.balanceCents).toBe(0);
    expect((await expectLedgerMatchesBalance(org.userId)).balanceCents).toBe(0);
  });

  it('saldo insuficiente -> 409 INSUFFICIENT_FUNDS con details.balanceCents', async () => {
    const org = await fundedOrganizer();

    const res = await withdraw(org, FUNDED + 1).expect(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(res.body.error.details.balanceCents).toBe(FUNDED);

    // Nada se movió: ni saldo, ni asiento.
    const wallet = await expectLedgerMatchesBalance(org.userId);
    expect(wallet.balanceCents).toBe(FUNDED);
    expect(await prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL' } })).toBe(0);
  });

  it('un monedero vacío no puede retirar nada', async () => {
    const org = await registerOrganizer(app);
    const res = await withdraw(org, 1).expect(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(res.body.error.details.balanceCents).toBe(0);
  });

  it.each([
    ['cero', 0],
    ['negativo', -1],
    ['muy negativo', -50_000],
    ['decimal', 1_000.5],
    ['texto', '5000'],
    ['ausente', undefined],
  ])('monto %s -> 422 y ningún asiento', async (_label, amountCents) => {
    const org = await fundedOrganizer();
    const res = await withdraw(org, amountCents).expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL' } })).toBe(0);
    expect((await expectLedgerMatchesBalance(org.userId)).balanceCents).toBe(FUNDED);
  });

  it('sin token -> 401', async () => {
    const res = await request(app).post('/api/wallet/withdrawals').send({ amountCents: 1_000 }).expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('el retiro queda auditado como simulado, y no se expone por la API', async () => {
    const org = await fundedOrganizer();
    const res = await withdraw(org, 30_000).expect(201);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'WALLET_WITHDRAWN' } });
    expect(log.metadata).toMatchObject({
      amountCents: 30_000,
      ledgerAmountCents: -30_000,
      balanceAfterCents: 70_000,
      currency: 'COP',
      simulated: true,
    });

    // La respuesta no filtra la auditoría ni el id del monedero.
    expect(res.text).not.toContain('walletId');
    expect(res.text).not.toContain('simulated');
  });

  it('un organizador NO puede retirar del monedero de otro', async () => {
    const alice = await fundedOrganizer();
    const beto = await registerOrganizer(app);

    // Beto pide un retiro con SU token: el saldo que se mira es el suyo, vacío.
    const res = await withdraw(beto, 10_000).expect(409);
    expect(res.body.error.details.balanceCents).toBe(0);

    expect((await expectLedgerMatchesBalance(alice.userId)).balanceCents).toBe(FUNDED);
  });

  it('el ledger de /api/wallet muestra el retiro en negativo', async () => {
    const org = await fundedOrganizer();
    await withdraw(org, 30_000).expect(201);

    const res = await org.auth(request(app).get('/api/wallet')).expect(200);
    const body = res.body as WalletBody;
    expect(body.balanceCents).toBe(70_000);
    expect(body.transactions).toHaveLength(2);

    const withdrawal = body.transactions.find((t) => t.type === 'WITHDRAWAL');
    expect(withdrawal?.amountCents).toBe(-30_000);
    expect(withdrawal?.eventTitle).toBeNull(); // un retiro no pertenece a ninguna cajita
    expect(body.transactions.reduce((sum, t) => sum + t.amountCents, 0)).toBe(body.balanceCents);
  });
});

describe('DOBLE GASTO: retiros concurrentes contra un saldo que no alcanza', () => {
  it('cuatro retiros de 30.000 contra 100.000: sólo caben tres, el saldo nunca queda negativo', async () => {
    const org = await fundedOrganizer(); // 100_000
    const CHUNK = 30_000;

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => withdraw(org, CHUNK).then((r) => r)),
    );

    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 0));
    const ok = statuses.filter((s) => s === 201).length;
    const rejected = statuses.filter((s) => s === 409).length;

    // Sin el lock, los cuatro leerían 100.000 y los cuatro pasarían.
    expect(ok).toBe(3);
    expect(rejected).toBe(1);
    expect(ok + rejected).toBe(4);

    const wallet = await expectLedgerMatchesBalance(org.userId);
    expect(wallet.balanceCents).toBe(FUNDED - 3 * CHUNK);
    expect(wallet.balanceCents).toBeGreaterThanOrEqual(0);
    expect(await prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL' } })).toBe(3);

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.status === 409) {
        expect(r.value.body.error.code).toBe('INSUFFICIENT_FUNDS');
      }
    }
  });

  it('diez retiros que suman el doble del saldo: el balance acaba en 0 y el ledger cuadra', async () => {
    const org = await fundedOrganizer(); // 100_000
    const CHUNK = 20_000; // 10 x 20.000 = 200.000, el doble del saldo

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => withdraw(org, CHUNK).then((r) => r)),
    );

    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 0));
    // Nada de 500: cada intento acaba en 201 o en 409.
    for (const s of statuses) expect([201, 409]).toContain(s);

    const ok = statuses.filter((s) => s === 201).length;
    expect(ok).toBe(5);

    const wallet = await expectLedgerMatchesBalance(org.userId);
    expect(wallet.balanceCents).toBe(0);
    expect(wallet.balanceCents).not.toBeLessThan(0);
    expect(await prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL' } })).toBe(5);
  });

  it('montos desiguales en paralelo: se retira como mucho el saldo, jamás más', async () => {
    const org = await fundedOrganizer(); // 100_000
    const amounts = [70_000, 50_000, 40_000, 30_000, 10_000];

    const results = await Promise.allSettled(amounts.map((a) => withdraw(org, a).then((r) => r)));

    const accepted = results
      .map((r, i) => (r.status === 'fulfilled' && r.value.status === 201 ? amounts[i] : 0))
      .reduce((a, b) => a + b, 0);

    expect(accepted).toBeGreaterThan(0);
    expect(accepted).toBeLessThanOrEqual(FUNDED);

    const wallet = await expectLedgerMatchesBalance(org.userId);
    expect(wallet.balanceCents).toBe(FUNDED - accepted);
    expect(wallet.balanceCents).toBeGreaterThanOrEqual(0);
  });

  it('retirar y revelar otra cajita a la vez no pierde ni duplica dinero', async () => {
    const org = await fundedOrganizer(); // 100_000
    const second = await createBox(app, org, { title: 'Segunda cajita' });
    await request(app)
      .post(`/api/caja/${second.uuid}/contributions`)
      .send({ amountCents: 55_000, displayName: 'Lucía' })
      .expect(201);

    const [reveal, withdrawal] = await Promise.all([
      org.auth(request(app).post(`/api/events/${second.id}/reveal`)).then((r) => r),
      withdraw(org, 40_000).then((r) => r),
    ]);

    expect(reveal.status).toBe(200);
    expect([201, 409]).toContain(withdrawal.status);

    const wallet = await expectLedgerMatchesBalance(org.userId);
    const withdrew = withdrawal.status === 201 ? 40_000 : 0;
    expect(wallet.balanceCents).toBe(FUNDED + 55_000 - withdrew);
  });
});
