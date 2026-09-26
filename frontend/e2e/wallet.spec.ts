import { expect, test } from '@playwright/test';
import { loginDemo } from './helpers';

/**
 * Money that can only come in is not a wallet.
 *
 * COP formats with a non-breaking space after the symbol, so every assertion
 * matches on the digits rather than on the exact separator.
 */

test('retirar baja el saldo y deja el movimiento en negativo', async ({ page }) => {
  await loginDemo(page);
  await page.goto('/wallet');

  const balance = page.getByTestId('wallet-balance');
  // 200.000 + 150.000 + 50.000 abonados, 100.000 ya retirados.
  await expect(balance).toContainText(/300\.000/);

  await page.getByTestId('withdraw-open').click();
  await page.getByLabel(/Cuánto quieres retirar/).fill('50000');
  await page.getByRole('button', { name: /^Continuar$/ }).click();

  await expect(page.getByText(/Vas a retirar .*50\.000 de .*300\.000/)).toBeVisible();
  // The simulation is stated, never dressed up as a bank transfer.
  await expect(page.getByText(/no hay transferencia a un banco/i)).toBeVisible();

  await page.getByTestId('withdraw-confirm').click();
  await expect(page.getByText(/Retiraste .*50\.000/)).toBeVisible();
  await expect(page.getByText(/no salió dinero a ninguna cuenta bancaria real/i)).toBeVisible();
  await page.getByRole('button', { name: /^Listo$/ }).click();

  await expect(balance).toContainText(/250\.000/);
  await expect(page.getByText(/^-\$.?50\.000$/)).toBeVisible();
});

test('un retiro mayor que el saldo se rechaza citando el saldo real', async ({ page }) => {
  await loginDemo(page);
  await page.goto('/wallet');

  await page.getByTestId('withdraw-open').click();
  await page.getByLabel(/Cuánto quieres retirar/).fill('99999999');
  await page.getByRole('button', { name: /^Continuar$/ }).click();

  await expect(page.getByText(/Tu saldo es .*300\.000/)).toBeVisible();
  await expect(page.getByTestId('withdraw-confirm')).toHaveCount(0);
});

test('"retirar todo" deja la wallet en cero y en su estado vacío', async ({ page }) => {
  await loginDemo(page);
  await page.goto('/wallet');

  await page.getByTestId('withdraw-open').click();
  await page.getByRole('button', { name: /Retirar todo/ }).click();
  await page.getByRole('button', { name: /^Continuar$/ }).click();
  await page.getByTestId('withdraw-confirm').click();
  await page.getByRole('button', { name: /^Listo$/ }).click();

  await expect(page.getByTestId('wallet-balance')).toContainText(/^\$.?0$/);
  // With nothing left there is no withdraw button, there is an explanation.
  await expect(page.getByTestId('withdraw-open')).toHaveCount(0);
  await expect(page.getByText(/Cuando abras una cajita el total entra aquí/)).toBeVisible();
});
