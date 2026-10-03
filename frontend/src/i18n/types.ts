/**
 * @file types.ts
 * @module i18n
 *
 * Tipos y constantes del módulo i18n (F4.6a — artesanal, sin librerías).
 * Los diccionarios viven en `locales/{en,es}/*.json` agrupados por
 * dominio; aquí solo el contrato compartido.
 */

/**
 * Idiomas soportados en v1. Añadir uno = crear sus JSON y añadirlo a
 * `SUPPORTED_LOCALES` (la detección y el provider no cambian).
 */
export type Locale = 'en' | 'es';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'es'];

/** Idioma por defecto y último fallback de la detección (F0 #3). */
export const DEFAULT_LOCALE: Locale = 'en';

/** Clave de la preferencia del usuario en localStorage (F0 #4). */
export const LOCALE_STORAGE_KEY = 'mr.locale';

/**
 * Diccionario anidado. `t('login.submit')` recorre el camino
 * `login → submit` dentro del merge de los JSON del idioma.
 */
export interface I18nDictionary {
  [key: string]: string | I18nDictionary;
}

/** Parámetros de interpolación: `{ count: 2 }` → `{count}`. */
export type TranslateParams = Record<string, string | number>;

/** Valor del contexto que exponen `I18nProvider` y `useI18n`. */
export interface I18nContextValue {
  /** Locale activo (ya resuelto: usuario > tenant > navegador > en). */
  locale: Locale;
  /** Cambia el idioma y lo persiste como preferencia del usuario. */
  setLocale: (locale: Locale) => void;
  /** Traduce una clave; si falta en el idioma activo, cae a `en`. */
  t: (key: string, params?: TranslateParams) => string;
  /** `Intl.NumberFormat` con el locale activo (estilo moneda EUR). */
  formatPrice: (price: number | null) => string;
  /** `Intl.NumberFormat` con el locale activo. */
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** `Intl.DateTimeFormat` con el locale activo. */
  formatDate: (
    value: string | number | Date,
    options?: Intl.DateTimeFormatOptions
  ) => string;
}
