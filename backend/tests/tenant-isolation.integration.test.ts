import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app';
import { prisma } from '../src/infrastructure/persistence/prisma/client';
import { createBox, registerOrganizer, resetDb, type DashboardBody } from './helpers';

const app = createApp();

/** Todo lo de B es reconocible en un texto: si aparece, es una fuga. */
const B_TITLE = 'Cajita Privadisima De Beto';
const B_AMOUNT = 8765400;
const B_SENDER = 'AportanteDeBeto';
const B_MESSAGE = 'MensajePrivadoDeBeto';

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Monta dos organizadores; B tiene una cajita con un aporte identificable. */
async function twoOrganizers() {
  const alice = await registerOrganizer(app, 'Alice');
  const beto = await registerOrganizer(app, 'Beto');
  const betoBox = await createBox(app, beto, { title: B_TITLE });

  await request(app)
    .post(`/api/caja/${betoBox.uuid}/contributions`)
    .send({ amountCents: B_AMOUNT, displayName: B_SENDER, message: B_MESSAGE })
    .expect(201);

  return { alice, beto, betoBox };
}

/** Ninguna respuesta a Alice puede contener un dato de Beto. */
function expectNoLeak(text: string) {
  for (const secret of [B_TITLE, B_SENDER, B_MESSAGE, String(B_AMOUNT)]) {
    expect(text).not.toContain(secret);
  }
}

describe('aislamiento multi-cliente', () => {
  it('el dashboard de una cajita ajena responde 404, no 403, y no filtra nada', async () => {
    const { alice, betoBox } = await twoOrganizers();

    const res = await alice.auth(request(app).get(`/api/events/${betoBox.id}/dashboard`)).expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body).not.toHaveProperty('envelopes');
    expectNoLeak(res.text);
  });

  it('una cajita ajena y una inexistente son INDISTINGUIBLES', async () => {
    const { alice, betoBox } = await twoOrganizers();

    const foreign = await alice.auth(request(app).get(`/api/events/${betoBox.id}/dashboard`)).expect(404);
    const missing = await alice.auth(request(app).get('/api/events/clzzzzzzzzzzzzzzzzzzzzzzz/dashboard')).expect(404);

    expect(foreign.body).toEqual(missing.body);
  });

  it('revelar una cajita ajena -> 404 y la cajita de B sigue sellada', async () => {
    const { alice, beto, betoBox } = await twoOrganizers();

    const res = await alice.auth(request(app).post(`/api/events/${betoBox.id}/reveal`)).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expectNoLeak(res.text);

    // Nada se movió: ni la cajita, ni ledger, ni saldos.
    const stored = await prisma.event.findUnique({ where: { id: betoBox.id } });
    expect(stored?.isRevealed).toBe(false);
    expect(stored?.settledTotalCents).toBeNull();
    expect(await prisma.walletTransaction.count()).toBe(0);

    const aliceWallet = await alice.auth(request(app).get('/api/wallet')).expect(200);
    expect(aliceWallet.body.balanceCents).toBe(0);
    const betoWallet = await beto.auth(request(app).get('/api/wallet')).expect(200);
    expect(betoWallet.body.balanceCents).toBe(0);

    // Y B sigue pudiendo revelar la suya.
    const revealed = await beto.auth(request(app).post(`/api/events/${betoBox.id}/reveal`)).expect(200);
    expect((revealed.body as DashboardBody).totalCents).toBe(B_AMOUNT);
  });

  it('el QR de una cajita ajena -> 404', async () => {
    const { alice, betoBox } = await twoOrganizers();
    const res = await alice.auth(request(app).get(`/api/events/${betoBox.id}/qr`)).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.text).not.toContain(betoBox.uuid);
  });

  it('GET /api/events sólo lista las cajitas propias', async () => {
    const { alice, betoBox } = await twoOrganizers();
    await createBox(app, alice, { title: 'Cajita de Alice' });

    const res = await alice.auth(request(app).get('/api/events')).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Cajita de Alice');
    expect(res.body[0].id).not.toBe(betoBox.id);
    expectNoLeak(res.text);
  });

  it('el monedero de A no ve ni un centavo de la cajita revelada de B', async () => {
    const { alice, beto, betoBox } = await twoOrganizers();
    await beto.auth(request(app).post(`/api/events/${betoBox.id}/reveal`)).expect(200);

    const aliceWallet = await alice.auth(request(app).get('/api/wallet')).expect(200);
    expect(aliceWallet.body.balanceCents).toBe(0);
    expect(aliceWallet.body.transactions).toEqual([]);
    expectNoLeak(aliceWallet.text);

    const betoWallet = await beto.auth(request(app).get('/api/wallet')).expect(200);
    expect(betoWallet.body.balanceCents).toBe(B_AMOUNT);
  });

  it('el link público sí es público: el uuid de B funciona sin token, pero sin montos', async () => {
    const { betoBox } = await twoOrganizers();
    const res = await request(app).get(`/api/caja/${betoBox.uuid}`).expect(200);

    expect(res.body.title).toBe(B_TITLE); // el invitado necesita saber a qué aporta
    expect(res.body.envelopeCount).toBe(1);
    expect(res.body).not.toHaveProperty('totalCents');
    expect(res.text).not.toContain(String(B_AMOUNT));
    expect(res.text).not.toContain(B_SENDER);
    expect(res.text).not.toContain(B_MESSAGE);
  });

  it('el id interno de una cajita no sirve como link público', async () => {
    const { betoBox } = await twoOrganizers();
    const res = await request(app).get(`/api/caja/${betoBox.id}`).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expectNoLeak(res.text);
  });
});
