import { expect, test } from '@playwright/test';
import { loginDemo } from './helpers';

/** Signing in is a real, addressable screen, and it remembers where you were going. */

test('el login vive en /login y acepta la cuenta demo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /^Entrar$/ }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Entrar a VaqCash' })).toBeVisible();

  await page.getByLabel('Correo').fill('ana@vaqcash.app');
  await page.getByLabel('Contraseña').fill('vaqcash1234');
  await page.getByRole('button', { name: /^Entrar$/ }).click();

  await expect(page).toHaveURL(/\/cajitas$/);
  await expect(page.getByRole('heading', { name: 'Mis cajitas', level: 1 })).toBeVisible();
});

test('credenciales malas se explican junto al formulario', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo').fill('ana@vaqcash.app');
  await page.getByLabel('Contraseña').fill('contrasenamala');
  await page.getByRole('button', { name: /^Entrar$/ }).click();

  await expect(page.getByText(/Correo o contraseña incorrectos/)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('una ruta protegida manda al login y devuelve a donde ibas', async ({ page }) => {
  await page.goto('/wallet');
  await expect(page).toHaveURL(/\/login\?next=%2Fwallet$/);
  await expect(page.getByText(/Necesitas una sesión/)).toBeVisible();

  await page.getByLabel('Correo').fill('ana@vaqcash.app');
  await page.getByLabel('Contraseña').fill('vaqcash1234');
  await page.getByRole('button', { name: /^Entrar$/ }).click();

  await expect(page).toHaveURL(/\/wallet$/);
  await expect(page.getByRole('heading', { name: 'Wallet', level: 1 })).toBeVisible();
});

test('la sesión sobrevive a un reload', async ({ page }) => {
  await loginDemo(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mis cajitas', level: 1 })).toBeVisible();
});

test('registro e inicio de sesión se enlazan entre sí', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: /Crea una cuenta/ }).click();
  await expect(page).toHaveURL(/\/registro$/);
  await page.getByRole('link', { name: /Entra con tu correo/ }).click();
  await expect(page).toHaveURL(/\/login$/);
});
