/**
 * @file format.ts
 * @module i18n
 *
 * Formateo por locale con `Intl` (F4.6a, decisión F0 #6). Sale de
 * `utils/booking.ts` (donde `formatPrice` estaba fijo a `es-ES`).
 *
 * El provider (`I18nProvider`) fija el locale activo con
 * `setCurrentLocale()` cada vez que cambia el idioma, de modo que
 * `formatPrice(price)` —sin segundo argumento— ya formatea según la
 * UI. Las páginas que necesiten un locale concreto lo pasan explícito.
 *
 * La moneda sigue siendo EUR (v1): el tenant define `currency` pero
 * aún no se propaga aquí (deuda en FINDINGS). El parámetro `locale`
 * acepta cualquier tag BCP-47 que Intl entienda (`en-US`, `es-AR`, …);
 * el `Locale` del contexto solo restringe la UI.
 */

import { DEFAULT_LOCALE, type Locale } from './types';

let currentLocale: Locale = DEFAULT_LOCALE;

/** Fija el locale por defecto de los formateos (lo llama el provider). */
export function setCurrentLocale(locale: Locale): void {
  currentLocale = locale;
}

/** Locale activo de los formateos. */
export function getCurrentLocale(): Locale {
  return currentLocale;
}

/**
 * Precio formateado con `Intl.NumberFormat` (estilo moneda, EUR).
 * `null` → `—` (igual que el `formatPrice` original de booking.ts).
 * Emite NBSP antes del símbolo (en `es-ES`), como hasta ahora.
 */
export function formatPrice(price: number | null, locale: string = currentLocale): string {
  if (price === null) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(price);
}

/** Número formateado con el locale activo (`1,234.5` / `1.234,5`). */
export function formatNumber(
  value: number,
  locale: string = currentLocale,
  options: Intl.NumberFormatOptions = {}
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Fecha/hora formateada con el locale activo. */
export function formatDate(
  value: string | number | Date,
  locale: string = currentLocale,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, options).format(date);
}
