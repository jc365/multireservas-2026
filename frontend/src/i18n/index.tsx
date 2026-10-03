/**
 * @file index.ts
 * @module i18n
 *
 * Infraestructura i18n artesanal (F4.6a — decisiones F0 #1-#5, #9).
 * Sin librerías externas: `I18nProvider` + `useI18n()` + diccionarios
 * JSON por dominio + `t(key)`.
 *
 * Uso:
 *   <I18nProvider> … </I18nProvider>   // App.tsx (envuelve todo)
 *   const { t, locale, setLocale } = useI18n();
 *   t('auth.login.submit')             // 'Sign in' | 'Entrar'
 *
 * El provider también fija `document.documentElement.lang` (F0 #5) y
 * el locale activo del formateo (`i18n/format.ts`, F0 #6).
 *
 * NOTA: solo `LoginForm` traduce en F4.6a (PoC). El resto de la UI
 * sigue con texto hardcodeado hasta F4.6b/c/d, y el CONTENIDO
 * (nombres de servicios, notas) nunca se traduce (F0).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import client from '../api/client';
import {
  DEFAULT_LOCALE,
  type I18nContextValue,
  type I18nDictionary,
  type Locale,
  type TranslateParams,
} from './types';
import { detectLocale, normalizeLocale, readStoredLocale, writeStoredLocale } from './detection';
import { dictionaries } from './locales';
import { formatDate, formatNumber, formatPrice, setCurrentLocale } from './format';

const I18nContext = createContext<I18nContextValue | null>(null);

/** Lee `a.b.c` en el diccionario; `null` si falta (o si `c` no es string). */
function lookup(dictionary: I18nDictionary, key: string): string | null {
  let node: string | I18nDictionary | undefined = dictionary;
  for (const part of key.split('.')) {
    if (node === undefined || node === null || typeof node === 'string') return null;
    node = (node as I18nDictionary)[part];
  }
  return typeof node === 'string' ? node : null;
}

/** Sustituye `{name}` por los valores de `params`. */
function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

export interface I18nProviderProps {
  children: ReactNode;
  /**
   * `tenant.settings.defaultLanguage`, opcional. Si se inyecta, el
   * provider NO consulta `/tenants/me` (útil en tests y en quien ya
   * conoce el tenant). Sin inyectar, hace un best-effort cuando hay
   * sesión: si el tenant no existe o no hay permiso, gana el navegador.
   */
  tenantLanguage?: string | null;
}

export function I18nProvider({ children, tenantLanguage }: I18nProviderProps) {
  const [stored, setStored] = useState<string | null>(() => readStoredLocale());
  const [fetchedTenant, setFetchedTenant] = useState<string | null>(null);
  const [navigatorLanguage] = useState<string | null>(() =>
    typeof navigator !== 'undefined' ? navigator.language : null
  );

  const tenant = tenantLanguage !== undefined ? tenantLanguage : fetchedTenant;

  // F0 #3: idioma del tenant (best-effort, solo con sesión).
  useEffect(() => {
    if (tenantLanguage !== undefined) return;
    let alive = true;
    if (!localStorage.getItem('token')) return;
    void (async () => {
      try {
        const res = await client.get('/tenants/me');
        const lang = (res?.data as { settings?: { defaultLanguage?: unknown } } | undefined)
          ?.settings?.defaultLanguage;
        if (alive && typeof lang === 'string' && normalizeLocale(lang)) {
          setFetchedTenant(lang);
        }
      } catch {
        /* sin tenant (401/403) o sin red: gana el navegador */
      }
    })();
    return () => {
      alive = false;
    };
  }, [tenantLanguage]);

  const locale = detectLocale({
    storedLanguage: stored,
    tenantLanguage: tenant,
    navigatorLanguage,
  });

  // F0 #5 y #6: <html lang> + locale activo de Intl.
  useEffect(() => {
    document.documentElement.lang = locale;
    setCurrentLocale(locale);
  }, [locale]);

  const t = useCallback(
    (key: string, params?: TranslateParams): string => {
      const found =
        lookup(dictionaries[locale], key) ??
        (locale === DEFAULT_LOCALE ? null : lookup(dictionaries[DEFAULT_LOCALE], key));
      if (found === null) return key;
      return interpolate(found, params);
    },
    [locale]
  );

  // F0 #4: el cambio explícito del usuario se persiste y gana al tenant.
  const setLocale = useCallback((next: Locale) => {
    writeStoredLocale(next);
    setStored(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      formatPrice: (price: number | null) => formatPrice(price, locale),
      formatNumber: (v: number, options?: Intl.NumberFormatOptions) =>
        formatNumber(v, locale, options),
      formatDate: (v: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
        formatDate(v, locale, options),
    }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Hook del contexto i18n. Fuera de `I18nProvider` lanza error. */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}

export { detectLocale, normalizeLocale, readStoredLocale, writeStoredLocale } from './detection';
export { formatPrice, formatNumber, formatDate, getCurrentLocale, setCurrentLocale } from './format';
export {
  ERROR_CODE_TO_KEY,
  extractBackendError,
  i18nKeyForError,
  translateError,
} from './errorMessages';
export { dictionaries } from './locales';
export {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  type I18nContextValue,
  type I18nDictionary,
  type Locale,
  type TranslateParams,
} from './types';
