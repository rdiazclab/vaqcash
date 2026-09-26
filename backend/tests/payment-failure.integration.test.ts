// This file drives the gateway into permanent failure. The rate is read when
// src/config/env.ts is first evaluated, so it must be set BEFORE the app is
// imported — hence the dynamic imports below. Vitest isolates the module
// registry per file, so no other test file sees this value.
process.env.PAYMENT_FAILURE_RATE = '1';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createBox, registerOrganizer, resetDb, type DashboardBody } from './helpers';

const { createApp } = await import('../src/interfaces/http/app');
const { buildContainer } = await import('../src/container');
const { prisma } = await import('../src/infrastructure/persistence/prisma/client');
const { FakePaymentGateway } = await import('../src/infrastructure/payments/fake-payment-gateway');

const app = createApp();

/** Una segunda app cuya pasarela siempre acepta, para mezclar un sobre bueno. */
const happyApp = createApp(buildContainer({ payments: new FakePaymentGateway(0, 0) }));

const FAILED_AMOUNT = 5_000_000;
const GOOD_AMOUNT = 123_400;

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  process.env.PAYMENT_FAILURE_RATE = '0';
  await prisma.$disconnect();
});

async function boxFor() {
  const org = await registerOrganizer(app);
  return { org, box: await createBox(app, org, { title: 'Cajita con pagos caidos' }) };
}

function contributeHappily(uuid: string, payload: Record<string, unknown>) {
  return request(happyApp).post(`/api/caja/${uuid}/contributions`).send(payload);
}

describe('PAYMENT_FAILURE_RATE=1', () => {
  it('responde 402 PAYMENT_DECLINED y deja el aporte en FAILED', async () => {
    const { box } = await boxFor();

    const res = await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: FAILED_AMOUNT, displayName: 'Pedro' })
      .expect(402);

    expect(res.body.error.code).toBe('PAYMENT_DECLINED');
    expect(res.body.error.message).toContain('insufficient_funds');

    const rows = await prisma.contribution.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('FAILED');
    expect(rows[0].amountCents).toBe(FAILED_AMOUNT);
    expect(rows[0].paymentRef).toMatch(/^sim_/); // the decline is traceable
  });

  it('el rechazo queda auditado con la referencia del cobro y el motivo', async () => {
    const { box } = await boxFor();
    await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .set('x-forwarded-for', '198.51.100.9')
      .send({ amountCents: FAILED_AMOUNT, displayName: 'Pedro Rechazado', isAnonymous: true })
      .expect(402);

    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual(['CONTRIBUTION_CREATED', 'PAYMENT_DECLINED']);

    const declined = logs[1];
    expect(declined.realSenderName).toBe('Pedro Rechazado');
    expect(declined.ipAddress).toBe('198.51.100.9');
    expect(declined.metadata).toMatchObject({ declineReason: 'insufficient_funds' });
    // Aunque fuera anónimo, la fila del aporte nunca guardó el nombre real.
    expect((await prisma.contribution.findFirstOrThrow()).displayName).toBe('Anónimo');
  });

  it('un aporte FAILED es invisible mientras está sellada', async () => {
    const { org, box } = await boxFor();
    await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: FAILED_AMOUNT, displayName: 'Pedro' })
      .expect(402);

    const dash = await org.auth(request(app).get(`/api/events/${box.id}/dashboard`)).expect(200);
    expect((dash.body as DashboardBody).envelopeCount).toBe(0);
    expect((dash.body as DashboardBody).totalCents).toBeNull();

    const pub = await request(app).get(`/api/caja/${box.uuid}`).expect(200);
    expect(pub.body.envelopeCount).toBe(0);
  });

  it('un aporte FAILED NO suma al total tras revelar, ni al monedero', async () => {
    const { org, box } = await boxFor();

    // Un sobre rechazado por la API caída...
    await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: FAILED_AMOUNT, displayName: 'Moroso' })
      .expect(402);

    // ...y uno que sí se liquida, por la app con pasarela sana.
    const receipt = await contributeHappily(box.uuid, { amountCents: GOOD_AMOUNT, displayName: 'Lucía' }).expect(201);
    expect(receipt.body.status).toBe('SUCCEEDED');

    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    const body = revealed.body as DashboardBody;

    expect(body.envelopeCount).toBe(1);
    expect(body.totalCents).toBe(GOOD_AMOUNT);
    expect(body.totalCents).not.toBe(GOOD_AMOUNT + FAILED_AMOUNT);
    expect(body.walletBalanceCents).toBe(GOOD_AMOUNT);
    expect(body.envelopes.map((e) => e.displayName)).toEqual(['Lucía']);
    expect(revealed.text).not.toContain(String(FAILED_AMOUNT));
    expect(revealed.text).not.toContain('Moroso');

    const ledger = await prisma.walletTransaction.findMany();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amountCents).toBe(GOOD_AMOUNT);
  });

  it('un intento rechazado no cierra la cajita: un sobre bueno posterior funciona', async () => {
    const { box } = await boxFor();
    await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: FAILED_AMOUNT, displayName: 'Moroso' })
      .expect(402);

    const receipt = await contributeHappily(box.uuid, { amountCents: GOOD_AMOUNT, isAnonymous: true }).expect(201);
    expect(receipt.body.status).toBe('SUCCEEDED');
    expect(await prisma.contribution.count({ where: { status: 'SUCCEEDED' } })).toBe(1);
    expect(await prisma.contribution.count({ where: { status: 'FAILED' } })).toBe(1);
  });

  it('ningún aporte se queda atascado en PENDING', async () => {
    const { box } = await boxFor();
    await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: FAILED_AMOUNT, displayName: 'Pedro' })
      .expect(402);
    await contributeHappily(box.uuid, { amountCents: GOOD_AMOUNT, displayName: 'Lucía' }).expect(201);

    expect(await prisma.contribution.count({ where: { status: 'PENDING' } })).toBe(0);
  });
});
