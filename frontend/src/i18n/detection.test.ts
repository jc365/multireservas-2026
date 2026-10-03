/**
 * @file detection.test.ts
 * @module i18n
 *
 * Tests de la detección de idioma (F4.6a): normalización de etiquetas
 * de navegador/tenant y precedencia usuario > tenant > navegador > en
 * (decisiones F0 #3 y #4).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectLocale,
  normalizeLocale,
  readStoredLocale,
  writeStoredLocale,
} from './detection';
import { LOCALE_STORAGE_KEY } from './types';

describe('normalizeLocale', () => {
  it('acepta etiquetas exactas', () => {
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('es')).toBe('es');
    expect(normalizeLocale('EN')).toBe('en');
  });

  it('recorta la región: es-AR / ES_es → es', () => {
    expect(normalizeLocale('es-AR')).toBe('es');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('es_ES')).toBe('es');
  });

  it('idiomas no soportados o vacíos → null', () => {
    expect(normalizeLocale('fr-FR')).toBeNull();
    expect(normalizeLocale('')).toBeNull();
    expect(normalizeLocale('   ')).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
    expect(normalizeLocale(undefined)).toBeNull();
  });
});

describe('detectLocale', () => {
  it('orden: usuario > tenant > navegador > en', () => {
    expect(
      detectLocale({
        storedLanguage: 'es',
        tenantLanguage: 'en',
        navigatorLanguage: 'en-US',
      })
    ).toBe('es');

    expect(detectLocale({ tenantLanguage: 'es', navigatorLanguage: 'en-US' })).toBe('es');

    expect(detectLocale({ navigatorLanguage: 'es-MX' })).toBe('es');

    expect(detectLocale()).toBe('en');
  });

  it('ignora valores no soportados y sigue con el siguiente origen', () => {
    expect(
      detectLocale({
        storedLanguage: 'fr-FR',
        tenantLanguage: 'de-DE',
        navigatorLanguage: 'es-ES',
      })
    ).toBe('es');

    expect(detectLocale({ storedLanguage: 'fr', tenantLanguage: 'de' })).toBe('en');
  });

  it('normaliza la región en cada origen', () => {
    expect(detectLocale({ tenantLanguage: 'es-AR', navigatorLanguage: 'en-US' })).toBe('es');
    expect(detectLocale({ navigatorLanguage: 'en-GB' })).toBe('en');
  });
});

describe('persistencia (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('escribe y lee la preferencia del usuario', () => {
    expect(readStoredLocale()).toBeNull();

    writeStoredLocale('es');

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('es');
    expect(readStoredLocale()).toBe('es');
  });
});
