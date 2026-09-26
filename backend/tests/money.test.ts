import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CURRENCY,
  MINOR_UNIT_EXPONENT,
  SUPPORTED_CURRENCIES,
  formatMoney,
  isSupportedCurrency,
  minorUnitExponent,
  toMajorString,
  toMajorUnits,
} from '../src/domain/money';

describe('tabla de monedas', () => {
  it('COP es la moneda por defecto', () => {
    expect(DEFAULT_CURRENCY).toBe('COP');
  });

  it('soporta exactamente las siete monedas del contrato', () => {
    expect([...SUPPORTED_CURRENCIES].sort()).toEqual(['ARS', 'CLP', 'COP', 'EUR', 'MXN', 'PEN', 'USD']);
  });

  it('COP y CLP tienen exponente 0; el resto, 2', () => {
    expect(minorUnitExponent('COP')).toBe(0);
    expect(minorUnitExponent('CLP')).toBe(0);
    for (const currency of ['USD', 'PEN', 'MXN', 'ARS', 'EUR'] as const) {
      expect(minorUnitExponent(currency)).toBe(2);
    }
  });

  it('isSupportedCurrency rechaza lo que no está en la tabla', () => {
    expect(isSupportedCurrency('COP')).toBe(true);
    expect(isSupportedCurrency('BRL')).toBe(false);
    expect(isSupportedCurrency('cop')).toBe(false); // se normaliza antes, no aquí
    expect(isSupportedCurrency('')).toBe(false);
    // No se cuela nada del prototipo de Object.
    expect(isSupportedCurrency('toString')).toBe(false);
    expect(isSupportedCurrency('constructor')).toBe(false);
  });
});

describe('EL BUG A EVITAR: dividir siempre entre 100', () => {
  it('en COP, 150000 unidades menores son 150000 pesos, NO 1500', () => {
    expect(toMajorUnits(150_000, 'COP')).toBe(150_000);
    expect(toMajorUnits(150_000, 'COP')).not.toBe(1_500);
    expect(toMajorString(150_000, 'COP')).toBe('150000');
  });

  it('en CLP tampoco se divide', () => {
    expect(toMajorUnits(150_000, 'CLP')).toBe(150_000);
  });

  it('en USD, 150000 unidades menores son 1500.00', () => {
    expect(toMajorUnits(150_000, 'USD')).toBe(1_500);
    expect(toMajorString(150_000, 'USD')).toBe('1500.00');
  });

  it.each([
    ['PEN', 1_500],
    ['MXN', 1_500],
    ['ARS', 1_500],
    ['EUR', 1_500],
  ] as const)('en %s se divide entre 100', (currency, expected) => {
    expect(toMajorUnits(150_000, currency)).toBe(expected);
  });

  it('el mismo entero vale cien veces más en COP que en USD', () => {
    expect(toMajorUnits(150_000, 'COP')).toBe(toMajorUnits(150_000, 'USD') * 100);
  });

  it('cero y montos pequeños se comportan en ambos exponentes', () => {
    expect(toMajorString(0, 'COP')).toBe('0');
    expect(toMajorString(0, 'USD')).toBe('0.00');
    expect(toMajorString(1, 'COP')).toBe('1');
    expect(toMajorString(1, 'USD')).toBe('0.01');
  });
});

describe('formatMoney', () => {
  it('usa el exponente de la moneda como número de decimales', () => {
    // No se asevera el separador exacto (depende de la versión de ICU): lo que
    // importa es cuántos decimales salen.
    expect(formatMoney(150_000, 'COP')).not.toMatch(/[.,]\d\d$/);
    expect(formatMoney(150_000, 'USD')).toMatch(/[.,]00$/);
  });

  it('todas las monedas soportadas formatean sin lanzar', () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      expect(typeof formatMoney(150_000, currency)).toBe('string');
    }
  });
});

describe('la tabla es la fuente de verdad compartida con el front', () => {
  it('todo exponente es 0 o 2 y no hay monedas huérfanas', () => {
    for (const [currency, exponent] of Object.entries(MINOR_UNIT_EXPONENT)) {
      expect([0, 2]).toContain(exponent);
      expect(currency).toMatch(/^[A-Z]{3}$/);
    }
    expect(Object.keys(MINOR_UNIT_EXPONENT)).toHaveLength(SUPPORTED_CURRENCIES.length);
  });
});
