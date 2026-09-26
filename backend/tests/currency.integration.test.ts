import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { SUPPORTED_CURRENCIES } from '../src/domain/money';
import { prisma } from '../src/infrastructure/persistence/prisma/client';
import { createApp } from '../src/interfaces/http/app';
import { createBox, registerOrganizer, resetDb, type DashboardBody } from './helpers';

const app = createApp();

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('moneda al crear la cajita', () => {
  it('sin currency, la cajita nace en COP', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita sin moneda' });

    expect((box.body.event as DashboardBody).currency).toBe('COP');
    expect((await prisma.event.findUniqueOrThrow({ where: { id: box.id } })).currency).toBe('COP');
  });

  it.each(SUPPORTED_CURRENCIES)('acepta %s y la propaga al recibo y al dashboard', async (currency) => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: `Cajita en ${currency}`, currency });

    expect((box.body.event as DashboardBody).currency).toBe(currency);

    const pub = await request(app).get(`/api/caja/${box.uuid}`).expect(200);
    expect(pub.body.currency).toBe(currency);

    const receipt = await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: 150_000, displayName: 'Pedro' })
      .expect(201);
    expect(receipt.body.currency).toBe(currency);

    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    expect((revealed.body as DashboardBody).currency).toBe(currency);
  });

  it('acepta minúsculas y las normaliza', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita en cop', currency: 'cop' });
    expect((box.body.event as DashboardBody).currency).toBe('COP');
  });

  it.each([['BRL'], ['GBP'], ['BTC'], ['XXX']])(
    'una moneda fuera de la tabla (%s) -> 422 UNSUPPORTED_CURRENCY y ninguna cajita',
    async (currency) => {
      const org = await registerOrganizer(app);
      const res = await org
        .auth(request(app).post('/api/events'))
        .send({ title: 'Cajita en moneda rara', currency })
        .expect(422);

      expect(res.body.error.code).toBe('UNSUPPORTED_CURRENCY');
      expect(res.body.error.details.currency).toBe(currency);
      expect(await prisma.event.count()).toBe(0);
    },
  );

  it('la moneda es INMUTABLE: ninguna ruta la cambia', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita en USD', currency: 'USD' });

    // No hay endpoint de edición; y los que existen no aceptan currency.
    await org.auth(request(app).post(`/api/events/${box.id}`)).send({ currency: 'COP' }).expect(404);
    await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: 1_000, displayName: 'Pedro', currency: 'EUR' })
      .expect(201);

    expect((await prisma.event.findUniqueOrThrow({ where: { id: box.id } })).currency).toBe('USD');
  });
});

describe('EL BUG A EVITAR: amountCents es unidad menor de SU moneda', () => {
  it('en COP, 150000 entra y sale como 150000 — sin dividir ni multiplicar por 100', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita COP', currency: 'COP' });

    const receipt = await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: 150_000, displayName: 'Pedro' })
      .expect(201);
    expect(receipt.body.amountCents).toBe(150_000);

    const revealed = await org.auth(request(app).post(`/api/events/${box.id}/reveal`)).expect(200);
    const body = revealed.body as DashboardBody;

    expect(body.totalCents).toBe(150_000);
    expect(body.settledTotalCents).toBe(150_000);
    expect(body.walletBalanceCents).toBe(150_000);
    // Los dos errores clásicos, aseverados explícitamente.
    expect(body.totalCents).not.toBe(1_500);
    expect(body.totalCents).not.toBe(15_000_000);
    expect(await prisma.contribution.count({ where: { amountCents: 150_000 } })).toBe(1);
  });

  it('el mismo entero en cajitas de COP y de USD produce el mismo entero: el backend no convierte', async () => {
    const org = await registerOrganizer(app);
    const cop = await createBox(app, org, { title: 'Cajita COP', currency: 'COP' });
    const usd = await createBox(app, org, { title: 'Cajita USD', currency: 'USD' });

    for (const box of [cop, usd]) {
      await request(app)
        .post(`/api/caja/${box.uuid}/contributions`)
        .send({ amountCents: 150_000, displayName: 'Pedro' })
        .expect(201);
    }

    const copView = await org.auth(request(app).post(`/api/events/${cop.id}/reveal`)).expect(200);
    const usdView = await org.auth(request(app).post(`/api/events/${usd.id}/reveal`)).expect(200);

    // El entero es idéntico; lo que cambia es sólo la etiqueta de moneda, que es
    // la que el front usará para decidir los decimales.
    expect((copView.body as DashboardBody).totalCents).toBe(150_000);
    expect((usdView.body as DashboardBody).totalCents).toBe(150_000);
    expect((copView.body as DashboardBody).currency).toBe('COP');
    expect((usdView.body as DashboardBody).currency).toBe('USD');

    // Y el monedero suma enteros, sin conversión mágica entre monedas.
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: org.userId } });
    expect(wallet.balanceCents).toBe(300_000);
  });

  it('un monto de 1 unidad menor es válido en COP (1 peso)', async () => {
    const org = await registerOrganizer(app);
    const box = await createBox(app, org, { title: 'Cajita COP', currency: 'COP' });
    const receipt = await request(app)
      .post(`/api/caja/${box.uuid}/contributions`)
      .send({ amountCents: 1, displayName: 'Pedro' })
      .expect(201);
    expect(receipt.body.amountCents).toBe(1);
  });
});
