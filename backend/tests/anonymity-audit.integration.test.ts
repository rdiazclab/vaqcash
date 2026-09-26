import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app';
import { prisma } from '../src/infrastructure/persistence/prisma/client';
import { createBox, registerOrganizer, resetDb, type DashboardBody } from './helpers';

const app = createApp();

/** Nombre irrepetible: si aparece en cualquier respuesta, es una fuga real. */
const REAL_NAME = 'Carlos Ignacio Perdomo';
const AMOUNT = 1500000;
const GUEST_IP = '203.0.113.77';
const GUEST_UA = 'Mozilla/5.0 (SobresTest AnonRunner)';

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Aporta como anónimo declarando el nombre real, con IP y user-agent conocidos. */
function contributeAnonymously(uuid: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post(`/api/caja/${uuid}/contributions`)
    // `trust proxy` está activo, así que X-Forwarded-For es lo que acaba en req.ip.
    .set('x-forwarded-for', GUEST_IP)
    .set('user-agent', GUEST_UA)
    .send({ amountCents: AMOUNT, displayName: REAL_NAME, isAnonymous: true, method: 'QR', ...overrides });
}

describe('anonimato con auditoría', () => {
  it('Contribution guarda "Anónimo"; AuditLog guarda el nombre REAL, la IP y el user-agent', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita anónima' });

    await contributeAnonymously(box.uuid).expect(201);

    const contribution = await prisma.contribution.findFirstOrThrow();
    expect(contribution.isAnonymous).toBe(true);
    expect(contribution.displayName).toBe('Anónimo');
    // La identidad real NO está en la tabla de aportes, en ninguna columna.
    expect(JSON.stringify(contribution)).not.toContain(REAL_NAME);

    const created = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'CONTRIBUTION_CREATED', contributionId: contribution.id },
    });
    expect(created.realSenderName).toBe(REAL_NAME);
    expect(created.ipAddress).toBe(GUEST_IP);
    expect(created.userAgent).toBe(GUEST_UA);
    expect(created.metadata).toMatchObject({ amountCents: AMOUNT, method: 'QR', isAnonymous: true });
  });

  it('el rastro de auditoría cubre el aporte y su liquidación', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita anónima' });
    await contributeAnonymously(box.uuid).expect(201);

    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual(['CONTRIBUTION_CREATED', 'PAYMENT_SETTLED']);
    // Los dos registros conservan la identidad real y la IP.
    for (const log of logs) {
      expect(log.realSenderName).toBe(REAL_NAME);
      expect(log.ipAddress).toBe(GUEST_IP);
    }
  });

  it('el dashboard REVELADO no contiene el nombre real en NINGUNA parte del payload', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita anónima' });
    await contributeAnonymously(box.uuid).expect(201);

    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    const body = revealed.body as DashboardBody;

    // El total sí se ve: lo que no se ve es quién.
    expect(body.totalCents).toBe(AMOUNT);
    expect(body.envelopes).toHaveLength(1);
    expect(body.envelopes[0].isAnonymous).toBe(true);
    expect(body.envelopes[0].displayName).toBe('Anónimo');

    // Aserción sobre el TEXTO serializado: ni el nombre, ni un trozo, ni la IP.
    expect(revealed.text).not.toContain(REAL_NAME);
    expect(revealed.text).not.toContain('Carlos');
    expect(revealed.text).not.toContain('Perdomo');
    expect(revealed.text).not.toContain(GUEST_IP);
    expect(revealed.text).not.toContain(GUEST_UA);

    // Y tampoco al releer el dashboard.
    const again = await org.auth(request(app).get(`/api/events/${box.id}/dashboard`)).expect(200);
    expect(again.text).not.toContain(REAL_NAME);
    expect(again.text).not.toContain('Perdomo');
  });

  it('SELLADA: los sobres son indistinguibles — ni monto, ni isAnonymous', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita anónima' });

    // Un sobre anónimo y uno con nombre, en ese orden conocido.
    await contributeAnonymously(box.uuid).expect(201);
    await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: 90000, displayName: 'Lucía Visible' })
      .expect(201);

    const sealed = await org.auth(request(app).get(`/api/events/${box.id}/dashboard`)).expect(200);
    const body = sealed.body as DashboardBody;

    expect(body.envelopes).toHaveLength(2);
    // Saber CUÁL de los dos es anónimo, cruzado con su hora de llegada, permitiría
    // deducir quién escribió qué. Así que el flag no viaja hasta abrir la cajita.
    for (const envelope of body.envelopes) {
      expect(Object.keys(envelope).sort()).toEqual(['createdAt', 'id']);
    }
    expect(sealed.text).not.toContain('isAnonymous');
    expect(sealed.text).not.toContain('Lucía Visible');
    expect(sealed.text).not.toContain(REAL_NAME);

    // Al abrir, isAnonymous vuelve: ahí ya no añade información nueva.
    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    const open = revealed.body as DashboardBody;
    expect(open.envelopes.map((e) => e.isAnonymous)).toEqual([true, false]);
    expect(open.envelopes.map((e) => e.displayName)).toEqual(['Anónimo', 'Lucía Visible']);
    expect(revealed.text).not.toContain(REAL_NAME);
  });

  it('el nombre real no sale por NINGUNA de las rutas de la API', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita anónima' });
    const receipt = await contributeAnonymously(box.uuid).expect(201);

    // El propio recibo del aportante tampoco devuelve su nombre.
    expect(receipt.text).not.toContain(REAL_NAME);

    await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);

    const responses = await Promise.all([
      request(app).get(`/api/caja/${box.uuid}`).expect(200),
      org.auth(request(app).get('/api/events')).expect(200),
      org.auth(request(app).get(`/api/events/${box.id}/dashboard`)).expect(200),
      org.auth(request(app).get(`/api/events/${box.id}/qr`)).expect(200),
      org.auth(request(app).get('/api/wallet')).expect(200),
      org.auth(request(app).get('/api/me')).expect(200),
    ]);

    for (const res of responses) {
      expect(res.text).not.toContain(REAL_NAME);
      expect(res.text).not.toContain('Perdomo');
      expect(res.text).not.toContain(GUEST_IP);
    }
  });

  it('no existe ninguna ruta que devuelva la auditoría', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita anónima' });
    await contributeAnonymously(box.uuid).expect(201);
    expect(await prisma.auditLog.count()).toBeGreaterThan(0);

    for (const route of [
      '/api/audit',
      '/api/audit-logs',
      '/api/auditoria',
      `/api/events/${box.id}/audit`,
      `/api/events/${box.id}/audit-logs`,
      `/api/caja/${box.uuid}/audit`,
    ]) {
      const res = await org.auth(request(app).get(route));
      expect(res.status).toBe(404);
      expect(res.text).not.toContain(REAL_NAME);
    }
  });

  it('un aporte anónimo SIN nombre deja realSenderName null, pero sigue auditando IP', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita anónima' });

    await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .set('x-forwarded-for', GUEST_IP)
      .send({ amountCents: AMOUNT, isAnonymous: true })
      .expect(201);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'CONTRIBUTION_CREATED' } });
    expect(log.realSenderName).toBeNull();
    expect(log.ipAddress).toBe(GUEST_IP);
    expect((await prisma.contribution.findFirstOrThrow()).displayName).toBe('Anónimo');
  });

  it('un aporte NO anónimo audita el mismo nombre que muestra', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita pública' });

    await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .set('x-forwarded-for', GUEST_IP)
      .send({ amountCents: AMOUNT, displayName: 'Lucía Visible', isAnonymous: false })
      .expect(201);

    const contribution = await prisma.contribution.findFirstOrThrow();
    expect(contribution.displayName).toBe('Lucía Visible');

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'CONTRIBUTION_CREATED' } });
    expect(log.realSenderName).toBe('Lucía Visible');
    expect(log.ipAddress).toBe(GUEST_IP);
  });

  it('revelar deja EVENT_REVEALED y WALLET_CREDITED en la auditoría', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita anónima' });
    await contributeAnonymously(box.uuid).expect(201);
    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);

    const logs = await prisma.auditLog.findMany({
      where: { action: { in: ['EVENT_REVEALED', 'WALLET_CREDITED'] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual(['EVENT_REVEALED', 'WALLET_CREDITED']);
    expect(logs[0].metadata).toMatchObject({ settledTotalCents: AMOUNT });
    expect(logs[1].metadata).toMatchObject({
      amountCents: AMOUNT,
      idempotencyKey: `reveal:${box.id}`,
      transactionId: (revealed.body as DashboardBody).walletCredit!.transactionId,
    });
  });

  it('AuditLog es append-only: nadie lo reescribe entre estados', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita anónima' });
    await contributeAnonymously(box.uuid).expect(201);

    const before = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
    await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    const after = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });

    // Las filas anteriores siguen siendo byte a byte las mismas; sólo se añaden.
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.length).toBeGreaterThan(before.length);
  });
});
