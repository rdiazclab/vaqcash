import { expect, test, type Page } from '@playwright/test';
import { assertNoAccentPainted, assertNoVerticalScroll, loginDemo } from './helpers';

/**
 * One capture pass over the states that carry the product: signing in, the
 * wallet with its withdrawal, and the sealed and revealed dashboards on a
 * phone. The 360x640 checks below take no screenshots; they exist to fail the
 * build if the guest checkout ever stops fitting on a small phone.
 */
/*
 * Test runs drop the captures in e2e/screenshots, which is gitignored. The
 * README needs the same states committed, so `npm run screenshots` points DIR
 * at screenshots/ instead of keeping a second, drifting copy of the flow.
 */
const DIR = process.env.SHOTS_DIR ?? 'e2e/screenshots';
const SEALED_BOX = 'box_grado';
const REVEALED_BOX = 'box_despedida';
const SEALED_UUID = 'f7c1a94e-3b52-4d10-9a77-0e2b5c81d4aa';

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const SMALL_PHONE = { width: 360, height: 640 };

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage, animations: 'disabled' });
}

test.describe('escritorio', () => {
  test.use({ viewport: DESKTOP });

  test('login y wallet con retiro', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Entrar a VaqCash' })).toBeVisible();
    await shot(page, 'desktop-login');

    await loginDemo(page);
    await page.goto('/wallet');
    await page.getByTestId('withdraw-open').click();
    await expect(page.getByLabel(/Cuánto quieres retirar/)).toBeVisible();
    await shot(page, 'desktop-wallet-retiro', true);
  });
});

test.describe('móvil', () => {
  test.use({ viewport: MOBILE });

  test('login, dashboards y checkout', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Entrar a VaqCash' })).toBeVisible();
    await shot(page, 'mobile-login');

    await loginDemo(page);

    await page.goto(`/cajitas/${SEALED_BOX}`);
    await expect(page.getByTestId('total-value')).toHaveText('? ? ?');
    await assertNoAccentPainted(page);
    await shot(page, 'mobile-dashboard-sealed', true);

    await page.goto(`/cajitas/${REVEALED_BOX}`);
    await expect(page.locator('.envelope--open').first()).toBeVisible();
    await shot(page, 'mobile-dashboard-revealed', true);

    await page.goto('/wallet');
    await page.getByTestId('withdraw-open').click();
    await expect(page.getByLabel(/Cuánto quieres retirar/)).toBeVisible();
    await shot(page, 'mobile-wallet-retiro', true);

    await page.goto('/cajitas/nueva');
    await expect(page.getByLabel('Moneda')).toBeVisible();
    await shot(page, 'mobile-crear-cajita', true);

    await page.goto(`/caja/${SEALED_UUID}`);
    await expect(page.getByLabel(/^Tu aporte/)).toBeVisible();
    await assertNoAccentPainted(page);
    await shot(page, 'mobile-checkout-monto');
  });
});

/** The hard constraint from the brief: the guest checkout fits 360x640. */
test.describe('teléfono de 360x640', () => {
  test.use({ viewport: SMALL_PHONE });

  test('el checkout cabe sin scroll en cada paso', async ({ page }) => {
    await page.goto(`/caja/${SEALED_UUID}`);
    await expect(page.getByLabel(/^Tu aporte/)).toBeVisible();
    await assertNoVerticalScroll(page, 'paso del monto');

    await page.getByLabel(/^Tu aporte/).fill('150000');
    await page.getByLabel('Tu nombre').fill('Camila Ortiz');
    await page.getByRole('button', { name: /Agregar un mensaje/ }).click();
    await expect(page.getByLabel(/^Mensaje/)).toBeVisible();
    await assertNoVerticalScroll(page, 'paso del monto con mensaje');

    await page.getByRole('button', { name: /Continuar al pago/ }).click();
    await expect(page.getByLabel('Número de tarjeta')).toBeVisible();
    await assertNoVerticalScroll(page, 'paso de pago con tarjeta');

    await page.getByLabel('Número de tarjeta').fill('4242424242424242');
    await page.getByLabel('Caducidad').fill('0928');
    await page.getByLabel('CVC').fill('123');
    await page.getByRole('button', { name: /^Pagar/ }).click();
    await expect(page.getByRole('heading', { name: /sobre está sellado/i })).toBeVisible();
    await assertNoVerticalScroll(page, 'recibo');
    await shot(page, 'small-checkout-recibo');
  });
});

/*
 * Las cuatro únicas capturas que se versionan, para el README: la cajita
 * sellada y la revelada, en teléfono y en escritorio. Se etiquetan @docs
 * porque `npm run screenshots` las filtra; el resto de este archivo produce
 * artefactos de prueba que no se commitean.
 */
test.describe('capturas del README @docs', () => {
  for (const [label, viewport] of [
    ['mobile', MOBILE],
    ['desktop', DESKTOP],
  ] as const) {
    test(`${label} sellada y revelada @docs`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await loginDemo(page);

      await page.goto(`/cajitas/${SEALED_BOX}`);
      await expect(page.getByTestId('total-value')).toHaveText('? ? ?');
      await shot(page, `${label}-sellada`, true);

      await page.goto(`/cajitas/${REVEALED_BOX}`);
      await expect(page.locator('.envelope--open').first()).toBeVisible();
      await shot(page, `${label}-revelada`, true);
    });
  }
});
