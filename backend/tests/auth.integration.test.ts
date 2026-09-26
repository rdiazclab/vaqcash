import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app';
import { prisma } from '../src/infrastructure/persistence/prisma/client';
import { registerOrganizer, resetDb } from './helpers';

const app = createApp();

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const CREDS = { email: 'ana@sobres.test', password: 'contrasena-larga-1', displayName: 'Ana' };

describe('POST /api/auth/register', () => {
  it('crea el usuario, su wallet en la misma transacción, y devuelve token', async () => {
    const res = await request(app).post('/api/auth/register').send(CREDS).expect(201);

    expect(res.body.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/); // JWT
    expect(res.body.user).toEqual({
      id: expect.any(String),
      email: 'ana@sobres.test',
      displayName: 'Ana',
    });

    const wallet = await prisma.wallet.findUnique({ where: { userId: res.body.user.id } });
    expect(wallet).not.toBeNull();
    expect(wallet?.balanceCents).toBe(0);
    expect(wallet?.currency).toBe('COP');
  });

  it('nunca devuelve el passwordHash, y lo guardado no es la contraseña', async () => {
    const res = await request(app).post('/api/auth/register').send(CREDS).expect(201);

    expect(res.text).not.toContain('passwordHash');
    expect(res.text).not.toContain(CREDS.password);

    const stored = await prisma.user.findUnique({ where: { email: CREDS.email } });
    expect(stored?.passwordHash).not.toBe(CREDS.password);
    expect(stored?.passwordHash).toMatch(/^\$argon2/);
  });

  it('email duplicado -> 409 EMAIL_TAKEN y no se crea una segunda wallet', async () => {
    await request(app).post('/api/auth/register').send(CREDS).expect(201);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...CREDS, displayName: 'Otra Ana' })
      .expect(409);

    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.wallet.count()).toBe(1);
  });

  it('el email se normaliza a minúsculas, así que MAYÚSCULAS también choca', async () => {
    await request(app).post('/api/auth/register').send(CREDS).expect(201);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...CREDS, email: 'ANA@SOBRES.TEST' })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it.each([
    ['un email inválido', { ...CREDS, email: 'no-soy-un-email' }],
    ['una contraseña corta', { ...CREDS, password: 'corta' }],
    ['sin displayName', { email: CREDS.email, password: CREDS.password }],
    ['un cuerpo vacío', {}],
  ])('%s -> 422 y ningún usuario creado', async (_label, payload) => {
    const res = await request(app).post('/api/auth/register').send(payload).expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.user.count()).toBe(0);
  });
});

describe('POST /api/auth/login', () => {
  it('con credenciales buenas devuelve 200 y un token usable', async () => {
    await request(app).post('/api/auth/register').send(CREDS).expect(201);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: CREDS.email, password: CREDS.password })
      .expect(200);

    expect(res.body.user.email).toBe(CREDS.email);
    await request(app).get('/api/me').set('authorization', `Bearer ${res.body.token}`).expect(200);
  });

  it('contraseña incorrecta -> 401 UNAUTHORIZED', async () => {
    await request(app).post('/api/auth/register').send(CREDS).expect(201);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: CREDS.email, password: 'contrasena-equivocada' })
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('email inexistente -> 401 con el MISMO mensaje: no confirmamos qué emails existen', async () => {
    await request(app).post('/api/auth/register').send(CREDS).expect(201);

    const badPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: CREDS.email, password: 'contrasena-equivocada' })
      .expect(401);
    const noSuchUser = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nadie@sobres.test', password: CREDS.password })
      .expect(401);

    expect(noSuchUser.body.error.message).toBe(badPassword.body.error.message);
  });
});

describe('rutas protegidas', () => {
  it.each([
    ['GET', '/api/me'],
    ['GET', '/api/wallet'],
    ['GET', '/api/events'],
    ['POST', '/api/events'],
    ['GET', '/api/events/evt-inexistente/dashboard'],
    ['GET', '/api/events/evt-inexistente/qr'],
    ['POST', '/api/events/evt-inexistente/reveal'],
  ])('%s %s sin token -> 401', async (method, route) => {
    const res = await (method === 'GET' ? request(app).get(route) : request(app).post(route).send({}));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('un token con firma falsa -> 401', async () => {
    const org = await registerOrganizer(app);
    const tampered = `${org.token.slice(0, -4)}AAAA`;
    const res = await request(app).get('/api/me').set('authorization', `Bearer ${tampered}`).expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it.each([
    ['sin el esquema Bearer', 'soloeltoken'],
    ['con un esquema equivocado', 'Basic abc'],
    ['vacío', ''],
  ])('un header Authorization %s -> 401', async (_label, value) => {
    await registerOrganizer(app);
    await request(app).get('/api/me').set('authorization', value).expect(401);
  });
});

describe('GET /api/me', () => {
  it('devuelve el usuario y el saldo, nunca el hash', async () => {
    const org = await registerOrganizer(app, 'Ana');
    const res = await org.auth(request(app).get('/api/me')).expect(200);

    expect(res.body.user).toEqual({ id: org.userId, email: org.email, displayName: 'Ana' });
    expect(res.body.wallet).toEqual({ balanceCents: 0, currency: 'COP' });
    expect(res.text).not.toContain('passwordHash');
  });
});
