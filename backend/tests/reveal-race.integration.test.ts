// The whole point of this file is a payment that is still in flight when the
// organizer opens the chest. PAYMENT_LATENCY_MS is read once, when
// src/config/env.ts is first evaluated, so it must be set BEFORE the app is
// imported — hence the dynamic imports. Vitest isolates the module registry per
// file, so no other test file inherits this latency. 400ms is ~40x the time it
// takes the PENDING row to appear, so the race window is wide open without
// making the suite crawl.
process.env.PAYMENT_LATENCY_MS = '400';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createBox, registerOrganizer, resetDb, waitFor, type DashboardBody, type Organizer } from './helpers';

const { createApp } = await import('../src/interfaces/http/app');
const { prisma } = await import('../src/infrastructure/persistence/prisma/client');

const app = createApp();

/** The amounts from the coordinator's real-world reproduction of the bug. */
const GOOD = 10_000;
const RACING = 99_999;

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  process.env.PAYMENT_LATENCY_MS = '0';
  await prisma.$disconnect();
});

function fireContribution(uuid: string, body: Record<string, unknown>) {
  // Superagent is lazy: touching .then() is what actually puts the request on the wire.
  return request(app).post(`/api/caja/${uuid}/contributions`).send(body).then((r) => r);
}

function fireReveal(org: Organizer, id: string) {
  return org.auth(request(app).post(`/api/events/${id}/reveal`)).then((r) => r);
}

const pendingCount = () => prisma.contribution.count({ where: { status: 'PENDING' } });

describe('REGRESSION: revelar mientras un pago está en vuelo', () => {
  it('el total anunciado nunca cambia, y el sobre tardío queda VOIDED', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita con carrera' });

    // One envelope that settles cleanly before anything happens.
    const good = await fireContribution(box.uuid, { amountCents: GOOD, displayName: 'Puntual' });
    expect(good.status).toBe(201);

    // Now an envelope whose charge is still running when the chest opens.
    const racing = fireContribution(box.uuid, { amountCents: RACING, displayName: 'Tardon' });

    // Wait for the real precondition: the PENDING reservation exists, so the
    // gateway is mid-charge. No blind sleep.
    await waitFor('the racing contribution to reach PENDING', async () => (await pendingCount()) === 1);

    // The organizer opens the chest right in the middle of that charge.
    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    const announced = revealed.body as DashboardBody;

    // The in-flight payment must be rejected, not silently absorbed.
    const racingRes = await racing;
    expect(racingRes.status).toBe(409);
    expect(racingRes.body.error.code).toBe('EVENT_CLOSED_MID_PAYMENT');
    expect(racingRes.body.error.details.paymentRef).toMatch(/^sim_/);
    expect(racingRes.body.error.message).toContain('reembolsado');

    // It really was charged, so the refund has to be traceable.
    const racingRow = await prisma.contribution.findFirst({ where: { amountCents: RACING } });
    expect(racingRow?.status).toBe('VOIDED');
    expect(racingRow?.paymentRef).toMatch(/^sim_/);

    // Y el cobro anulado queda auditado para que alguien pueda devolverlo.
    const voidedLog = await prisma.auditLog.findFirstOrThrow({ where: { action: 'PAYMENT_VOIDED' } });
    expect(voidedLog.metadata).toMatchObject({ amountCents: RACING, reason: 'event_closed_mid_payment' });

    // THE HEART OF THE TEST: what was announced is what stays announced.
    const after = await org.auth(request(app).get(`/api/events/${box.id}/dashboard`)).expect(200);
    const later = after.body as DashboardBody;

    expect(announced.totalCents).toBe(GOOD);
    expect(announced.settledTotalCents).toBe(GOOD);
    expect(announced.walletBalanceCents).toBe(GOOD);
    expect(later.totalCents).toBe(announced.totalCents);
    expect(later.envelopeCount).toBe(announced.envelopeCount);
    expect(later.envelopeCount).toBe(1);
    // The exact shape of the original bug report: 10000 announced, 109999 later.
    expect(later.totalCents).not.toBe(GOOD + RACING);

    // El monedero cobró lo anunciado, ni un centavo del sobre anulado.
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: org.userId } });
    expect(wallet.balanceCents).toBe(GOOD);
    expect(later.pendingRefundCount).toBe(1);
  });

  it('un sobre VOIDED nunca suma al total ni aparece en el payload', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita con carrera' });

    await fireContribution(box.uuid, { amountCents: GOOD, displayName: 'Puntual' });
    const racing = fireContribution(box.uuid, { amountCents: RACING, displayName: 'Tardon' });
    await waitFor('the racing contribution to reach PENDING', async () => (await pendingCount()) === 1);

    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    await racing;

    const body = revealed.body as DashboardBody;
    expect(body.totalCents).toBe(GOOD);
    expect(body.envelopeCount).toBe(1);
    expect(body.envelopes.map((e) => e.displayName)).toEqual(['Puntual']);
    expect(revealed.text).not.toContain(String(RACING));
    expect(revealed.text).not.toContain('Tardon');

    // And the row is still there, waiting for its refund — not deleted, not SUCCEEDED.
    expect(await prisma.contribution.count({ where: { status: 'VOIDED' } })).toBe(1);
  });

  it('un aporte que empieza DESPUÉS de revelar se rechaza antes, con EVENT_CLOSED', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita con carrera' });
    await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);

    const res = await fireContribution(box.uuid, { amountCents: RACING, displayName: 'Tardon' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EVENT_CLOSED');
    // Rejected at reservation time: nothing was charged, so no row at all.
    expect(await prisma.contribution.count()).toBe(0);
  });
});

describe('REGRESSION: dos revelaciones compitiendo', () => {
  it('exactamente una gana con 200, la otra recibe 409 ALREADY_REVEALED', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org);

    const results = await Promise.allSettled([fireReveal(org, box.id), fireReveal(org, box.id)]);
    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 0)).sort();

    expect(statuses).toEqual([200, 409]);

    const conflict = results.find((r) => r.status === 'fulfilled' && r.value.status === 409);
    expect(conflict?.status).toBe('fulfilled');
    if (conflict?.status === 'fulfilled') {
      expect(conflict.value.body.error.code).toBe('ALREADY_REVEALED');
    }
    expect(await prisma.walletTransaction.count()).toBe(1);
  });

  it('revealedAt acaba con un único valor, y coincide con la respuesta ganadora', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org);

    const results = await Promise.allSettled([
      fireReveal(org, box.id),
      fireReveal(org, box.id),
      fireReveal(org, box.id),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.status === 200);
    expect(ok).toHaveLength(1);

    const winner = ok[0] as PromiseFulfilledResult<{ body: DashboardBody }>;
    const event = await prisma.event.findUnique({ where: { id: box.id } });
    expect(event?.isRevealed).toBe(true);
    expect(event?.revealedAt?.toISOString()).toBe(winner.value.body.revealedAt);
  });
});

describe('REGRESSION: varios pagos en vuelo contra una revelación', () => {
  it('el total final es exactamente la suma de los sobres que respondieron 201', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org);

    // Two envelopes that are definitely in before the reveal.
    await fireContribution(box.uuid, { amountCents: 1_000, displayName: 'Uno' });
    await fireContribution(box.uuid, { amountCents: 2_000, displayName: 'Dos' });

    // Three more launched together; the reveal will land in the middle of them.
    const inFlight = [
      fireContribution(box.uuid, { amountCents: 4_000, displayName: 'Tres' }),
      fireContribution(box.uuid, { amountCents: 8_000, displayName: 'Cuatro' }),
      fireContribution(box.uuid, { amountCents: 16_000, isAnonymous: true }),
    ];
    await waitFor('all three concurrent contributions to be PENDING', async () => (await pendingCount()) === 3);

    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    const announced = revealed.body as DashboardBody;

    const settled = await Promise.all(inFlight);
    for (const res of settled) {
      // Either it made it, or it was cleanly rejected. Never a 500, never a silent pass.
      expect([201, 409]).toContain(res.status);
      if (res.status === 409) {
        expect(['EVENT_CLOSED', 'EVENT_CLOSED_MID_PAYMENT']).toContain(res.body.error.code);
      }
    }

    const accepted = [1_000, 2_000, ...settled.filter((r) => r.status === 201).map((r) => r.body.amountCents)];
    const expectedTotal = accepted.reduce((a, b) => a + b, 0);

    const after = await org.auth(request(app).get(`/api/events/${box.id}/dashboard`)).expect(200);
    const later = after.body as DashboardBody;

    expect(later.totalCents).toBe(expectedTotal);
    expect(later.envelopeCount).toBe(accepted.length);
    // The announced total is final: reading it again does not change it.
    expect(announced.totalCents).toBe(later.totalCents);
    expect(announced.envelopeCount).toBe(later.envelopeCount);
    // Y el monedero recibió exactamente lo anunciado.
    expect(announced.settledTotalCents).toBe(expectedTotal);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: org.userId } })).balanceCents).toBe(
      expectedTotal,
    );

    // Nothing stuck half-way, and every rejected envelope is accounted for.
    expect(await pendingCount()).toBe(0);
    const voided = await prisma.contribution.count({ where: { status: 'VOIDED' } });
    expect(voided).toBe(settled.filter((r) => r.status === 409).length);
  });
});

describe('REGRESSION: revelación programada mientras un pago está en vuelo', () => {
  it('un revealAt que vence mientras la liquidación espera el lock igual anula el sobre', async () => {
    // The manual reveal is serialized by the lock, but a scheduled revealAt is
    // just a timestamp: nobody takes the lock when it passes. This test widens
    // that window adversarially — it holds the event lock from the test itself so
    // the settle transaction has to wait, and lets revealAt pass while it waits.
    const org = await registerOrganizer(app);
    const revealAtMs = Date.now() + 700;
    const box = await createBox(app, org, {
      title: 'Cajita programada',
      revealAt: new Date(revealAtMs).toISOString(),
    });

    const racing = fireContribution(box.uuid, { amountCents: RACING, displayName: 'Tardon' });
    await waitFor('the racing contribution to reach PENDING', async () => (await pendingCount()) === 1);

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lockHolder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe('SELECT id FROM "Event" WHERE id = $1 FOR UPDATE', box.id);
        await gate;
      },
      { timeout: 20_000, maxWait: 5_000 },
    );

    await waitFor('revealAt to pass on the wall clock', async () => Date.now() > revealAtMs + 50);

    // The chest is open by schedule and the total is announced while the payment
    // is still stuck waiting for the lock.
    const announced = await org.auth(request(app).get(`/api/events/${box.id}/dashboard`)).expect(200);
    expect((announced.body as DashboardBody).isRevealed).toBe(true);
    expect((announced.body as DashboardBody).totalCents).toBe(0);

    release();
    await lockHolder;

    const racingRes = await racing;
    expect(racingRes.status).toBe(409);
    expect(racingRes.body.error.code).toBe('EVENT_CLOSED_MID_PAYMENT');

    const row = await prisma.contribution.findFirst();
    expect(row?.status).toBe('VOIDED');
    expect(row?.paymentRef).toMatch(/^sim_/);

    const later = await org.auth(request(app).get(`/api/events/${box.id}/dashboard`)).expect(200);
    expect((later.body as DashboardBody).totalCents).toBe((announced.body as DashboardBody).totalCents);
    expect((later.body as DashboardBody).envelopeCount).toBe((announced.body as DashboardBody).envelopeCount);
  });
});

describe('el lock resiste concurrencia real', () => {
  it('20 sobres contra una revelación: el total es la suma de los 201, y nada da 5xx', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita con carga' });

    const inFlight = Array.from({ length: 20 }, (_, i) =>
      fireContribution(box.uuid, { amountCents: 1_000 + i, displayName: `Sender ${i}` }),
    );
    await waitFor('at least one contribution to be PENDING', async () => (await pendingCount()) > 0);
    const revealPromise = fireReveal(org, box.id);

    const settled = await Promise.all(inFlight);
    const reveal = await revealPromise;

    expect(reveal.status).toBe(200);
    const codes = { accepted: 0, closedAtReserve: 0, voidedMidPayment: 0 };
    for (const res of settled) {
      expect(res.status).toBeLessThan(500);
      expect([201, 409]).toContain(res.status);
      if (res.status === 201) codes.accepted += 1;
      else if (res.body.error.code === 'EVENT_CLOSED') codes.closedAtReserve += 1;
      else if (res.body.error.code === 'EVENT_CLOSED_MID_PAYMENT') codes.voidedMidPayment += 1;
      else throw new Error(`unexpected error code: ${res.body.error.code}`);
    }
    // Every one of the 20 lands in exactly one bucket, whatever the interleaving.
    expect(codes.accepted + codes.closedAtReserve + codes.voidedMidPayment).toBe(20);

    const expectedTotal = settled
      .filter((r) => r.status === 201)
      .reduce((sum, r) => sum + r.body.amountCents, 0);
    const accepted = settled.filter((r) => r.status === 201).length;

    const after = await org.auth(request(app).get(`/api/events/${box.id}/dashboard`)).expect(200);
    const later = after.body as DashboardBody;

    expect(later.totalCents).toBe(expectedTotal);
    expect(later.envelopeCount).toBe(accepted);
    expect((reveal.body as DashboardBody).totalCents).toBe(later.totalCents);
    expect(await pendingCount()).toBe(0);

    // El monedero recibió exactamente el total anunciado, ni más ni menos.
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: org.userId } })).balanceCents).toBe(
      expectedTotal,
    );
    expect(await prisma.walletTransaction.count()).toBe(1);

    // Row accounting: a reservation rejected under the lock writes NO row at all,
    // so only the accepted and the mid-payment ones exist in the table.
    const voided = await prisma.contribution.count({ where: { status: 'VOIDED' } });
    expect(voided).toBe(codes.voidedMidPayment);
    expect(await prisma.contribution.count()).toBe(codes.accepted + codes.voidedMidPayment);
    expect(accepted).toBe(codes.accepted);
  });
});
