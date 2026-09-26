import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaContributionRepository } from '../src/infrastructure/persistence/prisma/contribution.repository';
import { prisma } from '../src/infrastructure/persistence/prisma/client';
import { createApp } from '../src/interfaces/http/app';
import { createBox, registerOrganizer, resetDb, type DashboardBody } from './helpers';

const app = createApp();
const contributions = new PrismaContributionRepository(prisma);

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('listByStatus — filtrado por estado', () => {
  it('cuenta sólo SUCCEEDED: PENDING, FAILED y VOIDED quedan fuera', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita de orden' });
    const base = { eventId: box.id, isAnonymous: false, displayName: 'X' };

    await prisma.contribution.createMany({
      data: [
        { ...base, amountCents: 1_000, status: 'SUCCEEDED' },
        { ...base, amountCents: 2_000, status: 'SUCCEEDED' },
        { ...base, amountCents: 400_000, status: 'PENDING' },
        { ...base, amountCents: 500_000, status: 'FAILED' },
        { ...base, amountCents: 600_000, status: 'VOIDED' },
      ],
    });

    const list = await contributions.listByStatus(box.id, 'SUCCEEDED');
    expect(list.map((c) => c.amountCents).sort((a, b) => a - b)).toEqual([1_000, 2_000]);
    expect(await contributions.sumByStatus(box.id, 'SUCCEEDED')).toBe(3_000);
    expect(await contributions.countByStatus(box.id, 'VOIDED')).toBe(1);
  });

  it('sumByStatus de una cajita sin sobres es 0, no null', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org);
    expect(await contributions.sumByStatus(box.id, 'SUCCEEDED')).toBe(0);
  });

  it('el dashboard revelado suma sólo las filas SUCCEEDED', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita de orden' });
    const base = { eventId: box.id, isAnonymous: false };
    await prisma.contribution.createMany({
      data: [
        { ...base, amountCents: 1_000, status: 'SUCCEEDED', displayName: 'Buena' },
        { ...base, amountCents: 400_000, status: 'PENDING', displayName: 'EnVuelo' },
        { ...base, amountCents: 500_000, status: 'FAILED', displayName: 'Rechazada' },
        { ...base, amountCents: 600_000, status: 'VOIDED', displayName: 'Anulada' },
      ],
    });

    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    const body = revealed.body as DashboardBody;

    expect(body.totalCents).toBe(1_000);
    expect(body.settledTotalCents).toBe(1_000);
    expect(body.walletBalanceCents).toBe(1_000);
    expect(body.envelopeCount).toBe(1);
    expect(body.pendingRefundCount).toBe(1);
    for (const leaked of ['400000', '500000', '600000', 'EnVuelo', 'Rechazada', 'Anulada']) {
      expect(revealed.text).not.toContain(leaked);
    }
  });
});

describe('orden determinista de los sobres', () => {
  it('filas con el MISMO milisegundo vuelven siempre en el mismo orden', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita de orden' });
    // Forcing the tie explicitly is the only reliable way to exercise the id
    // tiebreak: relying on real inserts landing in the same millisecond would be
    // a coin flip, and a coin-flip test proves nothing.
    const sameInstant = new Date('2026-09-26T12:00:00.000Z');
    await prisma.contribution.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        eventId: box.id,
        amountCents: (i + 1) * 1_000,
        displayName: `Sender ${i}`,
        isAnonymous: false,
        status: 'SUCCEEDED' as const,
        createdAt: sameInstant,
      })),
    });

    const stored = await prisma.contribution.findMany({ where: { eventId: box.id } });
    expect(new Set(stored.map((c) => c.createdAt.getTime())).size).toBe(1); // the tie is real

    const runs: string[][] = [];
    for (let i = 0; i < 10; i += 1) {
      runs.push((await contributions.listByStatus(box.id, 'SUCCEEDED')).map((c) => c.id));
    }

    // Every run identical...
    for (const run of runs) expect(run).toEqual(runs[0]);
    // ...and identical specifically because of the id tiebreak.
    expect(runs[0]).toEqual([...runs[0]].sort());
    expect(runs[0]).toHaveLength(6);
  });

  it('los sobres secuenciales vuelven en orden de inserción, repetidamente', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita de orden' });
    const amounts = [1_100, 2_200, 3_300, 4_400];
    for (const amountCents of amounts) {
      await request(app)
        .post(`/api/caja/${box.uuid}/contributions`)
        .send({ amountCents, displayName: `S${amountCents}` })
        .expect(201);
    }
    await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);

    for (let i = 0; i < 5; i += 1) {
      const dash = await org.auth(request(app).get(`/api/events/${box.id}/dashboard`)).expect(200);
      expect((dash.body as DashboardBody).envelopes.map((e) => e.amountCents)).toEqual(amounts);
    }
  });
});

describe('revealAt con zonas horarias', () => {
  it('acepta un offset como -05:00 y guarda el instante UTC correcto', async () => {
    const org = await registerOrganizer(app);
    const res = await org
      .auth(request(app).post('/api/events'))
      .send({ title: 'Navidad en Bogota', revealAt: '2026-12-25T00:00:00-05:00' })
      .expect(201);

    expect(res.body.event.revealAt).toBe('2026-12-25T05:00:00.000Z');
    const stored = await prisma.event.findUnique({ where: { id: res.body.event.id } });
    expect(stored?.revealAt?.toISOString()).toBe('2026-12-25T05:00:00.000Z');
  });

  it('acepta un offset positivo y la Z pelada igual', async () => {
    const org = await registerOrganizer(app);
    const plus = await org
      .auth(request(app).post('/api/events'))
      .send({ title: 'Cajita en Madrid', revealAt: '2026-12-25T02:00:00.000+02:00' })
      .expect(201);
    expect(plus.body.event.revealAt).toBe('2026-12-25T00:00:00.000Z');

    const zulu = await org
      .auth(request(app).post('/api/events'))
      .send({ title: 'Cajita en UTC', revealAt: '2026-12-25T00:00:00.000Z' })
      .expect(201);
    expect(zulu.body.event.revealAt).toBe('2026-12-25T00:00:00.000Z');
  });

  it('un offset en el pasado abre el cofre ya, igual que una fecha en Z', async () => {
    const org = await registerOrganizer(app);
    // Same instant expressed in a -05:00 offset, one minute ago.
    const pastUtc = new Date(Date.now() - 60_000);
    const offsetForm = new Date(pastUtc.getTime() - 5 * 60 * 60 * 1000)
      .toISOString()
      .replace('Z', '-05:00');

    const res = await org
      .auth(request(app).post('/api/events'))
      .send({ title: 'Ya vencida con offset', revealAt: offsetForm })
      .expect(201);
    expect(res.body.event.isRevealed).toBe(true);
    const stored = await prisma.event.findUnique({ where: { id: res.body.event.id } });
    expect(stored?.revealAt?.toISOString()).toBe(pastUtc.toISOString());
  });

  it.each([
    ['a naive datetime with no zone at all', '2026-12-25T00:00:00'],
    ['a date with no time', '2026-12-25'],
    ['a non-ISO string', '25/12/2026 00:00'],
  ])('sigue rechazando %s -> 422', async (_label, revealAt) => {
    const org = await registerOrganizer(app);
    const res = await org
      .auth(request(app).post('/api/events'))
      .send({ title: 'Cajita valida', revealAt })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.event.count()).toBe(0);
  });
});

describe('uuid público vs id interno', () => {
  it('el uuid es un uuid v4, distinto del id, y único por cajita', async () => {
    const org = await registerOrganizer(app);
    const one = await createBox(app, org, { title: 'Cajita uno' });
    const two = await createBox(app, org, { title: 'Cajita dos' });

    expect(one.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(one.uuid).not.toBe(one.id);
    expect(one.uuid).not.toBe(two.uuid);
  });

  it('el slug interno existe en la base pero no sale por la API', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Boda de Ana' });

    const stored = await prisma.event.findUniqueOrThrow({ where: { id: box.id } });
    expect(stored.slug).toMatch(/^boda-de-ana-[0-9a-f]{6}$/);

    const dash = await org.auth(request(app).get(`/api/events/${box.id}/dashboard`)).expect(200);
    expect(dash.text).not.toContain(stored.slug);
    const pub = await request(app).get(`/api/caja/${box.uuid}`).expect(200);
    expect(pub.text).not.toContain(stored.slug);
  });
});
