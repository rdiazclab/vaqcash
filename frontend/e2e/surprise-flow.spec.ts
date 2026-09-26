import { expect, test } from '@playwright/test';
import {
  assertNoAccentPainted,
  contribute,
  dashboardPayloads,
  recordDashboardPayloads,
  registerOrganizer,
  type Contribution,
} from './helpers';

/**
 * The product invariant, end to end: while a cajita is sealed, no amount may
 * reach the browser, not in the DOM and not in the payload. And the design
 * invariant with it: the sealed state paints no carmine at all. Once the
 * organizer opens the envelopes, both flip.
 *
 * Runs against the MSW mocks of the API (VITE_USE_MOCKS=true). The whole
 * flow stays inside one browser context because the mock database lives in
 * that context's localStorage.
 */

/**
 * COP is the default currency and its minor unit is the whole peso, so these
 * are typed as integers and must render with no decimal part. If anything in
 * the app still divides by 100, 137.542 would come out as 1.375 and these
 * assertions fail, which is exactly the regression they exist to catch.
 */
const CONTRIBUTIONS: Contribution[] = [
  { amount: '137542', formatted: /137\.542/, name: 'Ana Restrepo', anonymous: false, method: 'Tarjeta' },
  { amount: '264819', formatted: /264\.819/, name: 'Bruno Salas', anonymous: false, method: 'QR' },
  { amount: '411763', formatted: /411\.763/, name: '', anonymous: true, method: 'Link' },
];

const TOTAL = /814\.124/;

const SEALED_FORBIDDEN = [
  '137542', '137.542', '1.375,42',
  '264819', '264.819', '2.648,19',
  '411763', '411.763', '4.117,63',
  '814124', '814.124', '8.141,24',
];

test('sellado guarda la sorpresa y revelar la entrega', async ({ page }) => {
  await recordDashboardPayloads(page);

  // ---------- 1. a brand new organizer lands on the designed empty state ----------
  await registerOrganizer(page, 'Ana Restrepo');
  await expect(page.getByText('Todavía no tienes cajitas')).toBeVisible();

  // ---------- 2. create the cajita and collect the share link and the QR ----------
  await page.getByRole('link', { name: /Crear mi primera cajita/ }).click();
  const title = `Grado de Mariana ${Date.now()}`;
  await page.getByLabel(/Nombre de la cajita/).fill(title);
  await page.getByLabel('Descripción').fill('Sobres para el grado, sin espiar.');
  await page.getByRole('button', { name: /^Crear cajita$/ }).click();

  await expect(page.getByRole('heading', { name: new RegExp(`${title} está lista`) })).toBeVisible();
  const shareUrl = (await page.getByTestId('share-url').inputValue()).trim();
  expect(shareUrl).toMatch(/\/caja\/[0-9a-f-]{36}$/);

  // The QR really is an image the backend produced, not a placeholder box.
  const qr = page.getByRole('img', { name: /Código QR/ });
  await expect(qr).toBeVisible();
  expect(await qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/);

  await page.getByRole('link', { name: /Ir al panel de la cajita/ }).click();
  await expect(page).toHaveURL(/\/cajitas\/[^/]+$/);
  const dashboardUrl = page.url();

  // ---------- 3. the empty dashboard, then three guests seal their envelopes ----------
  await expect(page.getByText('Todavía no llega ningún sobre')).toBeVisible();
  for (const contribution of CONTRIBUTIONS) {
    await contribute(page, shareUrl, contribution);
  }

  // ---------- 4. the invariant: 3 envelopes, "? ? ?", no amount anywhere ----------
  await page.goto(dashboardUrl);
  await expect(page.getByTestId('envelope-count')).toHaveText('3');
  await expect(page.getByTestId('total-value')).toHaveText('? ? ?');
  await expect(page.locator('.envelope--sealed')).toHaveCount(3);
  await expect(page.locator('.envelope--open')).toHaveCount(0);

  const sealedText = await page.locator('body').innerText();
  const sealedHtml = await page.content();
  for (const needle of SEALED_FORBIDDEN) {
    expect(sealedText, `${needle} must not be rendered while sealed`).not.toContain(needle);
    // Not merely hidden by CSS: it must not be in the markup at all.
    expect(sealedHtml, `${needle} must not exist in the sealed DOM`).not.toContain(needle);
  }

  // Strongest form: the API never hands the amounts to the client.
  const payloads = await dashboardPayloads(page);
  expect(payloads.length, 'a dashboard payload was captured').toBeGreaterThan(0);
  for (const payload of payloads) {
    expect(payload).toContain('"totalCents":null');
    for (const needle of ['amountCents', 'isAnonymous', '137542', '264819', '411763', '814124']) {
      expect(payload, `the sealed payload must not carry ${needle}`).not.toContain(needle);
    }
  }

  // Every sealed envelope looks the same: no "Anónimo" label to deduce from.
  await expect(page.getByText('Anónimo')).toHaveCount(0);
  await expect(page.getByText('Se abre con la cajita')).toHaveCount(3);

  // ---------- 5. and the design invariant: the sealed state is monochrome ----------
  await assertNoAccentPainted(page);

  // ---------- 6. two-step reveal ----------
  await page.getByRole('button', { name: /Abrir 3 sobres/ }).click();
  await expect(page.getByText(/Esto es definitivo/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Cancelar$/ })).toBeVisible();
  // Still no amounts while the confirmation is on screen, and still no carmine.
  expect(await page.content()).not.toContain('137542');
  await assertNoAccentPainted(page);

  await page.getByRole('button', { name: /Sí, revelar ahora/ }).click();

  // ---------- 7. everything arrives at once: amounts, total, wallet ----------
  await expect(page.locator('.envelope--open')).toHaveCount(3);
  await expect(page.getByTestId('total-value')).toContainText(TOTAL);
  // COP renders without a decimal part: no "814.124,00", no "8.141,24".
  await expect(page.getByTestId('total-value')).not.toContainText(/814\.124,/);
  for (const contribution of CONTRIBUTIONS) {
    await expect(page.getByText(contribution.formatted).first()).toBeVisible();
  }
  await expect(page.getByText('Ana Restrepo')).toBeVisible();
  await expect(page.getByText('Bruno Salas')).toBeVisible();
  await expect(page.getByText('Anónimo')).toBeVisible();
  await expect(page.getByTestId('wallet-seal')).toContainText(TOTAL);
  await expect(page.getByRole('button', { name: /Abrir 3 sobres/ })).toHaveCount(0);

  // The reveal survives a reload.
  await page.reload();
  await expect(page.getByTestId('total-value')).toContainText(TOTAL);

  // ---------- 8. the money is in the wallet ----------
  await page.getByRole('link', { name: 'Wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Wallet', level: 1 })).toBeVisible();
  await expect(page.getByText(TOTAL).first()).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();
});

test('la identidad real de un aporte anónimo no llega al navegador', async ({ page }) => {
  await registerOrganizer(page, 'Ana Restrepo');
  await page.getByRole('link', { name: /Crear mi primera cajita/ }).click();
  await page.getByLabel(/Nombre de la cajita/).fill('Cumple de Renzo');
  await page.getByRole('button', { name: /^Crear cajita$/ }).click();
  const shareUrl = (await page.getByTestId('share-url').inputValue()).trim();
  await page.getByRole('link', { name: /Ir al panel de la cajita/ }).click();
  const dashboardUrl = page.url();

  await contribute(page, shareUrl, {
    amount: '500000',
    formatted: /500\.000/,
    name: 'Mariela Quispe',
    anonymous: true,
    method: 'QR',
  });

  await page.goto(dashboardUrl);
  await page.getByRole('button', { name: /Abrir 1 sobre/ }).click();
  await page.getByRole('button', { name: /Sí, revelar ahora/ }).click();

  await expect(page.getByText('Anónimo')).toBeVisible();
  expect(await page.content()).not.toContain('Mariela');
});

test('un pago rechazado deja al invitado en el paso de pago con el error explicado', async ({
  page,
}) => {
  await registerOrganizer(page, 'Ana Restrepo');
  await page.getByRole('link', { name: /Crear mi primera cajita/ }).click();
  await page.getByLabel(/Nombre de la cajita/).fill('Regalo de bienvenida');
  await page.getByRole('button', { name: /^Crear cajita$/ }).click();
  const shareUrl = (await page.getByTestId('share-url').inputValue()).trim();

  await page.goto(shareUrl);
  // 402 minor units is the amount the simulated gateway always declines.
  await page.getByLabel(/^Tu aporte/).fill('402');
  await page.getByLabel('Tu nombre').fill('Nicolás Ayala');
  await page.getByRole('button', { name: /Continuar al pago/ }).click();
  await page.getByRole('button', { name: 'QR', exact: true }).click();
  await page.getByRole('button', { name: /^Pagar/ }).click();

  await expect(page.getByText(/rechazado/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pagar/ })).toBeVisible();
});

test('un link que no existe muestra un estado de error diseñado, no una pantalla vacía', async ({
  page,
}) => {
  await page.goto('/caja/00000000-0000-0000-0000-000000000000');
  await expect(page.getByText('Este link no lleva a ninguna cajita')).toBeVisible();
});
