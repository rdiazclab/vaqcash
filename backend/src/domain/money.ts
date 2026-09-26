/**
 * Fuente de verdad del dinero. El front usa esta MISMA tabla.
 *
 * `amountCents` se llama así por herencia, pero su semántica es "unidades
 * menores de su moneda". COP y CLP tienen exponente 0: su unidad menor es el
 * peso entero, así que dividir entre 100 encogería las cifras por cien.
 * Nunca se divide por una constante: se divide por 10^exponente, o por nada.
 */
export const MINOR_UNIT_EXPONENT = {
  COP: 0,
  CLP: 0,
  USD: 2,
  PEN: 2,
  MXN: 2,
  ARS: 2,
  EUR: 2,
} as const;

export type SupportedCurrency = keyof typeof MINOR_UNIT_EXPONENT;

/** Moneda por defecto del producto. */
export const DEFAULT_CURRENCY: SupportedCurrency = 'COP';

export const SUPPORTED_CURRENCIES = Object.keys(MINOR_UNIT_EXPONENT) as SupportedCurrency[];

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return Object.prototype.hasOwnProperty.call(MINOR_UNIT_EXPONENT, value);
}

/** Cuántos decimales tiene esta moneda al escribirla. 0 para COP y CLP. */
export function minorUnitExponent(currency: SupportedCurrency): number {
  return MINOR_UNIT_EXPONENT[currency];
}

/**
 * Convierte unidades menores a la unidad mayor. En COP es la identidad; en USD
 * divide entre 100. Devuelve number sólo para formatear: la contabilidad
 * siempre opera sobre los enteros de unidad menor.
 */
export function toMajorUnits(amountCents: number, currency: SupportedCurrency): number {
  const exponent = minorUnitExponent(currency);
  return exponent === 0 ? amountCents : amountCents / 10 ** exponent;
}

/** Texto en unidad mayor con los decimales exactos de la moneda ("1500.00" en USD, "150000" en COP). */
export function toMajorString(amountCents: number, currency: SupportedCurrency): string {
  const exponent = minorUnitExponent(currency);
  return toMajorUnits(amountCents, currency).toFixed(exponent);
}

/** Formato humano. `maximumFractionDigits` = exponente, igual que hará el front. */
export function formatMoney(amountCents: number, currency: SupportedCurrency, locale = 'es-CO'): string {
  const exponent = minorUnitExponent(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(toMajorUnits(amountCents, currency));
}
