import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app';
import { prisma } from '../src/infrastructure/persistence/prisma/client';
import { createBox, registerOrganizer, resetDb, type DashboardBody } from './helpers';

const app = createApp();

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('conflictos al revelar', () => {
  it('una segunda revelación -> 409 ALREADY_REVEALED', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org);
    await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);

    const res = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(409);
    expect(res.body.error.code).toBe('ALREADY_REVEALED');
    // Y no añadió un segundo asiento al ledger.
    expect(await prisma.walletTransaction.count()).toBe(1);
  });

  it('una cajita ya abierta por horario no se puede revelar a mano -> 409', async () => {
    const org = await registerOrganizer(app);
    const past = new Date(Date.now() - 60_000).toISOString();
    const box = await createBox(app, org, { title: 'Ya vencida', revealAt: past });

    const res = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(409);
    expect(res.body.error.code).toBe('ALREADY_REVEALED');
    expect(await prisma.walletTransaction.count()).toBe(0);
  });

  it('revealedAt no se sobreescribe con el segundo intento fallido', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org);
    const first = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    const revealedAt = (first.body as DashboardBody).revealedAt;

    await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(409);
    const event = await prisma.event.findUnique({ where: { id: box.id } });
    expect(event?.revealedAt?.toISOString()).toBe(revealedAt);
  });
});

describe('reglas del aporte', () => {
  it('aportar después de revelar -> 409 EVENT_CLOSED y no se persiste nada', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org);
    await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);

    const res = await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: 50000, displayName: 'Tarde' })
      .expect(409);
    expect(res.body.error.code).toBe('EVENT_CLOSED');
    expect(await prisma.contribution.count()).toBe(0);
    // Si no hubo aporte, tampoco hay rastro de aporte que auditar.
    expect(await prisma.auditLog.count({ where: { action: 'CONTRIBUTION_CREATED' } })).toBe(0);
  });

  it('aportar a una cajita ya abierta por horario -> 409 EVENT_CLOSED', async () => {
    const org = await registerOrganizer(app);
    const past = new Date(Date.now() - 60_000).toISOString();
    const box = await createBox(app, org, { title: 'Ya vencida', revealAt: past });

    const res = await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: 50000, displayName: 'Tarde' })
      .expect(409);
    expect(res.body.error.code).toBe('EVENT_CLOSED');
  });

  it('un aporte no anónimo sin displayName -> 422', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org);

    const res = await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: 50000 })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fieldErrors.displayName).toBeTruthy();
    expect(await prisma.contribution.count()).toBe(0);
  });

  it('un aporte no anónimo con displayName explícitamente null -> 422', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org);
    await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: 50000, displayName: null, isAnonymous: false })
      .expect(422);
  });

  it('un aporte anónimo no necesita displayName -> 201', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org);
    await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: 50000, isAnonymous: true })
      .expect(201);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['a big negative', -50000],
  ])('amountCents %s -> 422', async (_label, amountCents) => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org);
    const res = await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents, displayName: 'Pedro' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fieldErrors.amountCents).toBeTruthy();
    expect(await prisma.contribution.count()).toBe(0);
  });

  it.each([
    ['a non-integer amount', { amountCents: 1000.5, displayName: 'Pedro' }],
    ['an amount over the cap', { amountCents: 100_000_001, displayName: 'Pedro' }],
    ['a string amount', { amountCents: '5000', displayName: 'Pedro' }],
    ['a missing amount', { displayName: 'Pedro' }],
    ['a one-character name', { amountCents: 5000, displayName: 'P' }],
    ['an unknown payment method', { amountCents: 5000, displayName: 'Pedro', method: 'CRYPTO' }],
  ])('%s -> 422', async (_label, payload) => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org);
    await request(app).post(`/api/caja/${box.uuid}/contributions`).send(payload).expect(422);
    expect(await prisma.contribution.count()).toBe(0);
  });
});

describe('not found', () => {
  it('aportar a un uuid inexistente -> 404', async () => {
    const res = await request(app)
      .post('/api/caja/no-existe-jamas/contributions')
      .send({ amountCents: 50000, displayName: 'Pedro' })
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(await prisma.contribution.count()).toBe(0);
  });

  it('leer un uuid público inexistente -> 404', async () => {
    const res = await request(app).get('/api/caja/no-existe-jamas').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('dashboard de una cajita inexistente -> 404', async () => {
    const org = await registerOrganizer(app);
    const res = await org.auth(request(app).get('/api/events/clzzzzzzzzzzzzzzzzzzzzzzz/dashboard')).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('revelar una cajita inexistente -> 404', async () => {
    const org = await registerOrganizer(app);
    await org.auth(request(app).post('/api/events/clzzzzzzzzzzzzzzzzzzzzzzz/reveal')).expect(404);
    expect(await prisma.walletTransaction.count()).toBe(0);
  });
});

describe('validación al crear la cajita', () => {
  it.each([
    ['a title that is too short', { title: 'ab' }],
    ['a missing title', {}],
    ['a 4-letter currency', { title: 'Cajita valida', currency: 'USDD' }],
    ['an empty currency', { title: 'Cajita valida', currency: '' }],
    ['a non-ISO revealAt', { title: 'Cajita valida', revealAt: '26/09/2026' }],
  ])('%s -> 422', async (_label, payload) => {
    const org = await registerOrganizer(app);
    const res = await org.auth(request(app).post('/api/events')).send(payload).expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.event.count()).toBe(0);
  });
});
