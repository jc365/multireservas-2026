/**
 * @file detection.ts
 * @module i18n
 *
 * Detección y persistencia del idioma (F4.6a).
 *
 * Orden (decisiones F0 #3 y #4):
 *   1. `localStorage` — preferencia explícita del usuario (gana al tenant).
 *   2. `tenant.settings.defaultLanguage` — si hay tenant.
 *   3. `navigator.language` — navegador.
 *   4. `DEFAULT_LOCALE` (`en`).
 *
 * Cada origen se normaliza primero: `es-AR` → `es`, `fr-FR` → null.
 */

import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, type Locale } from './types';

/**
 * Normaliza un identificador de idioma (`es`, `es-AR`, `EN_us`) a un
 * `Locale` soportado, o `null` si no lo es.
 */
export function normalizeLocale(input?: string | null): Locale | null {
  if (!input || typeof input !== 'string') return null;
  const lower = input.trim().toLowerCase();
  if (!lower) return null;
  if ((SUPPORTED_LOCALES as readonly string[]).includes(lower)) return lower as Locale;
  const base = lower.split(/[-_]/)[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(base) ? (base as Locale) : null;
}

export interface DetectionInput {
  /** Preferencia del usuario (localStorage). */
  storedLanguage?: string | null;
  /** `tenant.settings.defaultLanguage`. */
  tenantLanguage?: string | null;
  /** `navigator.language`. */
  navigatorLanguage?: string | null;
}

/** Resuelve el locale según el orden F0: usuario > tenant > navegador > en. */
export function detectLocale(input: DetectionInput = {}): Locale {
  return (
    normalizeLocale(input.storedLanguage) ??
    normalizeLocale(input.tenantLanguage) ??
    normalizeLocale(input.navigatorLanguage) ??
    DEFAULT_LOCALE
  );
}

/** Lee la preferencia guardada; `null` si no existe o localStorage falla. */
export function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persiste la preferencia del usuario (F0 #4). */
export function writeStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* modo privado / sin storage: el locale sigue vivo en memoria */
  }
}
