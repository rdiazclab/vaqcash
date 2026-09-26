import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app';
import { prisma } from '../src/infrastructure/persistence/prisma/client';
import {
  collectNumbers,
  createBox,
  registerOrganizer,
  resetDb,
  type DashboardBody,
  type WalletBody,
} from './helpers';

const app = createApp();

/** Distinctive amounts: unlikely to collide with a timestamp or id substring. */
const A = 1234500;
const B = 987600;
const C = 45000;
const TOTAL = A + B + C;

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ciclo completo: registro -> cajita -> aportes -> sellada -> revelar -> wallet', () => {
  it('walks the real flow end to end', async () => {
    const org = await registerOrganizer(app, 'Ana');

    // --- crear la cajita ----------------------------------------------------
    const created = await org
      .auth(request(app).post('/api/events'))
      .send({ title: 'Boda de Ana', description: 'Sobres para la luna de miel' })
      .expect(201);

    const { id, uuid } = created.body.event as DashboardBody;
    expect(created.body.event.currency).toBe('COP'); // el default del producto
    expect(created.body.event.totalCents).toBeNull();
    expect(created.body.shareUrl).toBe(`http://localhost:5175/caja/${uuid}`);
    expect(created.body.event.shareUrl).toBe(created.body.shareUrl);
    expect(created.body.qrDataUrl).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    expect(JSON.stringify(created.body.event)).not.toContain('userId');

    // El QR se puede volver a pedir y apunta al mismo sitio.
    const qr = await org.auth(request(app).get(`/api/events/${id}/qr`)).expect(200);
    expect(qr.body.shareUrl).toBe(created.body.shareUrl);
    expect(qr.body.qrDataUrl).toBe(created.body.qrDataUrl);

    // --- tres aportes, uno anónimo -----------------------------------------
    const r1 = await request(app)
      .post(`/api/caja/${uuid}/contributions`)
      .send({ amountCents: A, displayName: 'Pedro', message: 'Felicidades', method: 'CARD' })
      .expect(201);
    expect(r1.body.status).toBe('SUCCEEDED');
    expect(r1.body.amountCents).toBe(A); // su propio recibo: permitido
    expect(r1.body.currency).toBe('COP');
    expect(r1.body.boxTitle).toBe('Boda de Ana');
    expect(r1.body.paymentRef).toMatch(/^sim_/);

    await request(app)
      .post(`/api/caja/${uuid}/contributions`)
      .send({ amountCents: B, isAnonymous: true, displayName: 'Nombre Secreto', method: 'QR' })
      .expect(201);

    await request(app)
      .post(`/api/caja/${uuid}/contributions`)
      .send({ amountCents: C, displayName: 'Lucía', method: 'LINK' })
      .expect(201);

    // El sobre anónimo guarda "Anónimo" en Contribution, no el nombre real.
    const anon = await prisma.contribution.findFirst({ where: { isAnonymous: true } });
    expect(anon?.displayName).toBe('Anónimo');

    // --- vista del invitado -------------------------------------------------
    const pub = await request(app).get(`/api/caja/${uuid}`).expect(200);
    expect(pub.body.envelopeCount).toBe(3);
    expect(pub.body.isRevealed).toBe(false);
    expect(pub.body.uuid).toBe(uuid);
    expect(pub.body).not.toHaveProperty('totalCents');
    expect(pub.body).not.toHaveProperty('id');
    expect(JSON.stringify(pub.body)).not.toContain(String(A));

    // --- dashboard sellado --------------------------------------------------
    const sealed = await org.auth(request(app).get(`/api/events/${id}/dashboard`)).expect(200);
    const sealedBody = sealed.body as DashboardBody;

    expect(sealedBody.isRevealed).toBe(false);
    expect(sealedBody.envelopeCount).toBe(3);
    expect(sealedBody.totalCents).toBeNull();
    expect(sealedBody.envelopes).toHaveLength(3);
    for (const envelope of sealedBody.envelopes) {
      // Los sobres sellados son INDISTINGUIBLES: ni monto ni isAnonymous.
      expect(Object.keys(envelope).sort()).toEqual(['createdAt', 'id']);
    }
    expect(sealed.text).not.toContain('amountCents');
    // isAnonymous + hora de llegada desanonimiza por deducción: no viaja sellado.
    expect(sealed.text).not.toContain('isAnonymous');
    for (const amount of [A, B, C, TOTAL]) {
      expect(sealed.text).not.toContain(String(amount));
    }
    expect(collectNumbers(sealedBody)).not.toContain(TOTAL);

    // --- revelar ------------------------------------------------------------
    const revealed = await org.auth(request(app).post(`/api/events/${id}/reveal`)).expect(200);
    const openBody = revealed.body as DashboardBody;

    expect(openBody.isRevealed).toBe(true);
    expect(openBody.revealedAt).toBeTruthy();
    expect(openBody.envelopeCount).toBe(3);
    expect(openBody.totalCents).toBe(TOTAL);
    expect(openBody.settledTotalCents).toBe(TOTAL);
    expect(openBody.walletBalanceCents).toBe(TOTAL);
    expect(openBody.pendingRefundCount).toBe(0);
    expect(openBody.walletCredit).toEqual({ amountCents: TOTAL, transactionId: expect.any(String) });
    // Ordering is [createdAt asc, id asc], so insertion order is deterministic
    // even if two inserts land in the same millisecond. Assert the exact sequence.
    expect(openBody.envelopes.map((e) => e.amountCents)).toEqual([A, B, C]);
    expect(openBody.envelopes.map((e) => e.displayName)).toEqual(['Pedro', 'Anónimo', 'Lucía']);
    expect(openBody.envelopes[0].message).toBe('Felicidades');
    expect(openBody.envelopes[1].isAnonymous).toBe(true);
    expect(openBody.envelopes[1].message).toBeNull();

    // --- el dashboard sigue abierto al releer, pero sin walletCredit --------
    const again = await org.auth(request(app).get(`/api/events/${id}/dashboard`)).expect(200);
    expect((again.body as DashboardBody).totalCents).toBe(TOTAL);
    expect((again.body as DashboardBody).isRevealed).toBe(true);
    expect(again.body).not.toHaveProperty('walletCredit');

    // --- el dinero está en el monedero -------------------------------------
    const wallet = await org.auth(request(app).get('/api/wallet')).expect(200);
    const walletBody = wallet.body as WalletBody;
    expect(walletBody.balanceCents).toBe(TOTAL);
    expect(walletBody.currency).toBe('COP');
    expect(walletBody.transactions).toHaveLength(1);
    expect(walletBody.transactions[0]).toMatchObject({
      amountCents: TOTAL,
      type: 'REVEAL_PAYOUT',
      eventTitle: 'Boda de Ana',
    });

    const me = await org.auth(request(app).get('/api/me')).expect(200);
    expect(me.body.wallet.balanceCents).toBe(TOTAL);

    // --- el invitado ve la bandera, nunca el dinero ------------------------
    const pubAfter = await request(app).get(`/api/caja/${uuid}`).expect(200);
    expect(pubAfter.body.isRevealed).toBe(true);
    expect(pubAfter.text).not.toContain(String(TOTAL));
  });

  it('GET /api/events lista las cajitas del organizador sin ninguna cifra de dinero', async () => {
    const org = await registerOrganizer(app);
    const first = await createBox(app, org, { title: 'Cajita uno' });
    await createBox(app, org, { title: 'Cajita dos' });

    await request(app)
      .post(`/api/caja/${first.uuid}/contributions`)
      .send({ amountCents: A, displayName: 'Pedro' })
      .expect(201);

    const res = await org.auth(request(app).get('/api/events')).expect(200);
    expect(res.body).toHaveLength(2);
    expect(Object.keys(res.body[0]).sort()).toEqual([
      'createdAt',
      'envelopeCount',
      'id',
      'isRevealed',
      'title',
      'uuid',
    ]);
    const byTitle = new Map(res.body.map((e: { title: string }) => [e.title, e]));
    expect(byTitle.get('Cajita uno')).toMatchObject({ envelopeCount: 1, isRevealed: false });
    expect(byTitle.get('Cajita dos')).toMatchObject({ envelopeCount: 0 });
    expect(res.text).not.toContain(String(A));
    expect(res.text).not.toContain('totalCents');
  });

  it('un revealAt vencido abre el dashboard sin revelación manual', async () => {
    const org = await registerOrganizer(app);
    const past = new Date(Date.now() - 60_000).toISOString();
    const box = await createBox(app, org, { title: 'Cajita ya vencida', revealAt: past });

    const dash = await org.auth(request(app).get(`/api/events/${box.id}/dashboard`)).expect(200);
    expect((dash.body as DashboardBody).isRevealed).toBe(true);
    expect((dash.body as DashboardBody).totalCents).toBe(0);
    // Nadie liquidó nada: no hay total liquidado ni movimiento en el monedero.
    expect((dash.body as DashboardBody).settledTotalCents).toBeNull();
    expect(await prisma.walletTransaction.count()).toBe(0);
  });

  it('un revealAt futuro mantiene el dashboard sellado', async () => {
    const org = await registerOrganizer(app);
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const box = await createBox(app, org, { title: 'Cajita futura', revealAt: future });

    await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: A, displayName: 'Pedro' })
      .expect(201);

    const dash = await org.auth(request(app).get(`/api/events/${box.id}/dashboard`)).expect(200);
    expect((dash.body as DashboardBody).isRevealed).toBe(false);
    expect((dash.body as DashboardBody).totalCents).toBeNull();
    expect(dash.text).not.toContain(String(A));
  });

  it('dos cajitas del mismo organizador no se mezclan', async () => {
    const org = await registerOrganizer(app);
    const one = await createBox(app, org, { title: 'Cajita uno' });
    const two = await createBox(app, org, { title: 'Cajita dos' });

    await request(app)
      .post(`/api/caja/${one.uuid}/contributions`)
      .send({ amountCents: A, displayName: 'Pedro' })
      .expect(201);

    const dashTwo = await org.auth(request(app).get(`/api/events/${two.id}/dashboard`)).expect(200);
    expect((dashTwo.body as DashboardBody).envelopeCount).toBe(0);
  });

  it('/health answers without touching the database', async () => {
    await request(app).get('/health').expect(200, { ok: true });
  });
});
