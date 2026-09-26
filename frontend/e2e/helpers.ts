import { expect, type Page } from '@playwright/test';

/** Carmine, in both themes. Nothing in a sealed state may render in these. */
export const ACCENT_LIGHT = 'rgb(176, 32, 63)';
export const ACCENT_DARK = 'rgb(232, 90, 118)';

/**
 * Records what the app actually received on the wire. MSW answers from a service
 * worker, so these responses never reach Playwright's network events; patching
 * fetch inside the page is the only way to inspect the real payloads.
 */
export async function recordDashboardPayloads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __dashboardPayloads: string[] }).__dashboardPayloads = store;
    const original = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await original(...args);
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url ?? '';
      if (/\/events\/[^/]+\/dashboard/.test(url)) {
        store.push(await response.clone().text());
      }
      return response;
    };
  });
}

export function dashboardPayloads(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __dashboardPayloads: string[] }).__dashboardPayloads ?? [],
  );
}

/**
 * The design rule, asserted mechanically: while a box is sealed, not one pixel
 * of carmine may be painted. Text colour, background, visible border, and SVG
 * fill and stroke are all checked.
 */
export async function assertNoAccentPainted(page: Page): Promise<void> {
  const offenders = await page.evaluate(
    ({ light, dark }) => {
      const accents = new Set([light, dark]);
      const found: string[] = [];
      for (const element of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
        const style = getComputedStyle(element);
        const candidates: [string, string][] = [
          ['color', style.color],
          ['background-color', style.backgroundColor],
          ['fill', style.fill],
          ['stroke', style.stroke],
        ];
        if (parseFloat(style.borderTopWidth) > 0) candidates.push(['border', style.borderTopColor]);
        if (parseFloat(style.borderLeftWidth) > 0) candidates.push(['border', style.borderLeftColor]);
        if (parseFloat(style.outlineWidth) > 0) candidates.push(['outline', style.outlineColor]);

        for (const [property, value] of candidates) {
          if (accents.has(value)) {
            found.push(`${element.tagName.toLowerCase()} ${property}: ${value}`);
          }
        }
      }
      return found;
    },
    { light: ACCENT_LIGHT, dark: ACCENT_DARK },
  );

  expect(offenders, 'the sealed state must not paint a single carmine surface').toEqual([]);

  /*
   * Computed styles cannot see inside a raster or an <img>, so colour could be
   * smuggled onto a sealed screen by swapping an inline mark for a picture of
   * one. The brand mark is therefore required to be inline SVG here, and any
   * image pointing at a full-colour brand asset fails the same rule.
   */
  const colourImages = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img'))
      .map((img) => img.getAttribute('src') ?? '')
      .filter((src) => /logo-(mark|full)(-dark)?\.svg|icon-\d+\.png|favicon/.test(src)),
  );
  expect(colourImages, 'no full-colour brand asset may be shown while sealed').toEqual([]);

  const inlineMarks = await page.locator('svg[aria-label="VaqCash"]').count();
  expect(inlineMarks, 'the VaqCash mark must be inline SVG so its fills are auditable')
    .toBeGreaterThan(0);
}

/** Fails when the page scrolls, which the guest checkout is not allowed to do. */
export async function assertNoVerticalScroll(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollHeight,
    client: document.documentElement.clientHeight,
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(
    overflow.scroll - overflow.client,
    `${label} must fit without vertical scroll (scrollHeight ${overflow.scroll} vs viewport ${overflow.client})`,
  ).toBeLessThanOrEqual(1);
  expect(overflow.horizontal, `${label} must not scroll sideways`).toBeLessThanOrEqual(1);
}

export async function registerOrganizer(page: Page, name: string): Promise<string> {
  const email = `org.${Date.now()}.${Math.floor(Math.random() * 1000)}@vaqcash.test`;
  await page.goto('/registro');
  await page.getByLabel('Tu nombre').fill(name);
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill('vaqcash1234');
  await page.getByRole('button', { name: /^Crear cuenta$/ }).click();
  await expect(page.getByRole('heading', { name: 'Mis cajitas', level: 1 })).toBeVisible();
  return email;
}

export async function loginDemo(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo').fill('ana@vaqcash.app');
  await page.getByLabel('Contraseña').fill('vaqcash1234');
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  await expect(page.getByRole('heading', { name: 'Mis cajitas', level: 1 })).toBeVisible();
}

export interface Contribution {
  amount: string;
  formatted: RegExp;
  name: string;
  anonymous: boolean;
  method: 'Tarjeta' | 'QR' | 'Link';
}

/** Drives the guest checkout end to end, from the share link to the receipt. */
export async function contribute(page: Page, shareUrl: string, c: Contribution): Promise<void> {
  await page.goto(shareUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.getByLabel(/^Tu aporte/).fill(c.amount);
  if (c.anonymous) {
    await page.getByLabel('Aportar de forma anónima').check();
    await expect(page.getByLabel('Tu nombre')).toHaveCount(0);
  } else {
    await page.getByLabel('Tu nombre').fill(c.name);
  }
  await page.getByRole('button', { name: /Continuar al pago/ }).click();

  await page.getByRole('button', { name: c.method, exact: true }).click();
  if (c.method === 'Tarjeta') {
    await page.getByLabel('Número de tarjeta').fill('4242424242424242');
    await page.getByLabel('Caducidad').fill('0928');
    await page.getByLabel('CVC').fill('123');
  }
  await page.getByRole('button', { name: /^Pagar/ }).click();

  await expect(page.getByRole('heading', { name: /sobre está sellado/i })).toBeVisible();
  // The guest sees their own amount and nothing else.
  await expect(page.getByText(c.formatted).first()).toBeVisible();
}
