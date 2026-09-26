/**
 * The single place money is formatted or parsed in this app.
 *
 * `amountCents` is a misleading name inherited from the contract: it holds
 * integers of the currency's MINOR UNIT, and that unit is not always a
 * hundredth. In COP and CLP the minor unit is the whole peso, so dividing by
 * 100 turns $150.000 into $1.500 and silently loses two orders of magnitude.
 * Every component asks this module instead of formatting by hand.
 */

export const SUPPORTED_CURRENCIES = ['COP', 'CLP', 'USD', 'PEN', 'MXN', 'ARS', 'EUR'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = 'COP';

/** Digits after the separator. 0 means the minor unit is the whole unit. */
const EXPONENT: Record<Currency, number> = {
  COP: 0,
  CLP: 0,
  USD: 2,
  PEN: 2,
  MXN: 2,
  ARS: 2,
  EUR: 2,
};

/** Each currency formatted the way its own market writes it. */
const LOCALE: Record<Currency, string> = {
  COP: 'es-CO',
  CLP: 'es-CL',
  USD: 'en-US',
  PEN: 'es-PE',
  MXN: 'es-MX',
  ARS: 'es-AR',
  EUR: 'es-ES',
};

export const CURRENCY_LABEL: Record<Currency, string> = {
  COP: 'COP, peso colombiano',
  CLP: 'CLP, peso chileno',
  USD: 'USD, dólar',
  PEN: 'PEN, sol peruano',
  MXN: 'MXN, peso mexicano',
  ARS: 'ARS, peso argentino',
  EUR: 'EUR, euro',
};

function asCurrency(currency: string): Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(currency)
    ? (currency as Currency)
    : DEFAULT_CURRENCY;
}

export function exponentOf(currency: string): number {
  return EXPONENT[asCurrency(currency)];
}

export function localeOf(currency: string): string {
  return LOCALE[asCurrency(currency)];
}

/** Minor units to the display string, symbol included. */
export function formatMoney(minorUnits: number, currency: string): string {
  const code = asCurrency(currency);
  const exponent = EXPONENT[code];
  return new Intl.NumberFormat(LOCALE[code], {
    style: 'currency',
    currency: code,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(minorUnits / 10 ** exponent);
}

/** Grouped digits with no symbol, for compact tables. */
export function formatAmount(minorUnits: number, currency: string): string {
  const code = asCurrency(currency);
  const exponent = EXPONENT[code];
  return new Intl.NumberFormat(LOCALE[code], {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(minorUnits / 10 ** exponent);
}

/**
 * Turns what a person typed into minor units, using the currency's own rules.
 *
 * With exponent 0 every dot and comma is a thousands separator, because there
 * is no such thing as half a Colombian peso. With exponent 2 the last separator
 * counts as decimal when it is followed by one or two digits.
 * Returns null when the text is not a usable amount.
 */
export function parseAmountToMinor(raw: string, currency: string): number | null {
  const exponent = exponentOf(currency);
  const cleaned = raw.trim().replace(/[^\d.,]/g, '');
  if (!cleaned) return null;

  if (exponent === 0) {
    const digits = cleaned.replace(/[.,]/g, '');
    if (!digits) return null;
    const value = Number(digits);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const separatorAt = Math.max(lastComma, lastDot);

  let normalized = cleaned.replace(/[.,]/g, '');
  if (separatorAt >= 0) {
    const tail = cleaned.slice(separatorAt + 1);
    // One or two trailing digits is a decimal part; three is a thousands group.
    if (tail.length > 0 && tail.length <= exponent) {
      const whole = cleaned.slice(0, separatorAt).replace(/[.,]/g, '');
      normalized = `${whole}.${tail}`;
    }
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 10 ** exponent);
}

/** Quick-pick amounts that mean something in the currency at hand. */
export function suggestedAmounts(currency: string): number[] {
  return exponentOf(currency) === 0 ? [50000, 150000, 200000] : [5000, 15000, 20000];
}

/** Minor units as plain text for an input: no grouping, exact decimals. */
export function toInputValue(minorUnits: number, currency: string): string {
  const exponent = exponentOf(currency);
  return (minorUnits / 10 ** exponent).toFixed(exponent);
}

/** Placeholder that teaches the expected shape without acting as a label. */
export function amountPlaceholder(currency: string): string {
  return exponentOf(currency) === 0 ? '150000' : '1500.00';
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(date);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
