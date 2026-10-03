/**
 * @file format.test.ts
 * @module i18n
 *
 * Tests del formateo por locale (F4.6a, decisión F0 #6):
 * `formatPrice` (antes fijo a es-ES en utils/booking), `formatNumber`
 * y `formatDate` parametrizados con `Intl`.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { formatDate, formatNumber, formatPrice, getCurrentLocale, setCurrentLocale } from './format';
import { DEFAULT_LOCALE } from './types';

/** Intl emite NBSP antes del símbolo: lo normalizamos para comparar. */
const plain = (s: string) => s.replace(/\u00a0/g, ' ');

describe('formatPrice', () => {
  it('formatea por locale: es-ES vs en-US', () => {
    expect(plain(formatPrice(43, 'es-ES'))).toBe('43,00 €');
    expect(formatPrice(43, 'en-US')).toBe('€43.00');
  });

  it('null → —', () => {
    expect(formatPrice(null, 'es-ES')).toBe('—');
  });

  it('sin locale explícito usa el activo (lo fija I18nProvider)', () => {
    setCurrentLocale('es');
    expect(plain(formatPrice(43))).toBe('43,00 €');
    expect(getCurrentLocale()).toBe('es');

    setCurrentLocale('en');
    expect(formatPrice(43)).toBe('€43.00');
  });
});

describe('formatNumber', () => {
  it('separadores según locale', () => {
    expect(formatNumber(1234.5, 'en-US')).toBe('1,234.5');
    expect(formatNumber(1234.5, 'es-ES')).toBe('1234,5');
  });

  it('respeta las opciones de Intl', () => {
    expect(formatNumber(0.42, 'en-US', { style: 'percent' })).toBe('42%');
  });
});

describe('formatDate', () => {
  const iso = '2026-10-02T12:00:00.000Z';

  it('formato corto según locale', () => {
    expect(formatDate(iso, 'en', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })).toBe(
      '10/02/2026'
    );
    expect(formatDate(iso, 'es', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })).toBe(
      '02/10/2026'
    );
  });

  it('acepta Date y descarta fechas inválidas', () => {
    expect(
      formatDate(new Date(iso), 'en', { timeZone: 'UTC', year: 'numeric' })
    ).toBe('2026');
    expect(formatDate('no-es-fecha', 'en')).toBe('—');
  });
});

afterEach(() => {
  setCurrentLocale(DEFAULT_LOCALE);
});
