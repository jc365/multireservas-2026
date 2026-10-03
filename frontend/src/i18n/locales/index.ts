/**
 * @file locales/index.ts
 * @module i18n
 *
 * Carga de diccionarios (F4.6a, decisión F0 #9): se importan los JSON
 * de los DOS idiomas completos de una (~10 KB por idioma) — sin
 * lazy-loading ni dynamic import. Cada fichero aporta su espacio de
 * nombres (`auth.json` → `auth.*`, `errors.json` → `errors.*`, …) y se
 * fusionan en un único diccionario por idioma.
 *
 * Si un fichero faltara en un idioma, el `t()` sigue funcionando: cae
 * al idioma `en` y, si tampoco está, devuelve la propia clave.
 */

import type { I18nDictionary, Locale } from '../types';

import enAdmin from './en/admin.json';
import enAgenda from './en/agenda.json';
import enAuth from './en/auth.json';
import enBitacora from './en/bitacora.json';
import enCommon from './en/common.json';
import enConfig from './en/config.json';
import enEmployees from './en/employees.json';
import enErrors from './en/errors.json';
import enReservations from './en/reservations.json';
import enServices from './en/services.json';
import enTenant from './en/tenant.json';

import esAdmin from './es/admin.json';
import esAgenda from './es/agenda.json';
import esAuth from './es/auth.json';
import esBitacora from './es/bitacora.json';
import esCommon from './es/common.json';
import esConfig from './es/config.json';
import esEmployees from './es/employees.json';
import esErrors from './es/errors.json';
import esReservations from './es/reservations.json';
import esServices from './es/services.json';
import esTenant from './es/tenant.json';

/** Fusión profunda: dos ficheros no deberían pisarse, pero por si acaso. */
function deepMerge(target: I18nDictionary, source: I18nDictionary): I18nDictionary {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (
      value &&
      typeof value === 'object' &&
      existing &&
      typeof existing === 'object'
    ) {
      target[key] = deepMerge(existing, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function build(parts: I18nDictionary[]): I18nDictionary {
  return parts.reduce((acc, part) => deepMerge(acc, part), {} as I18nDictionary);
}

/** Diccionarios completos, por idioma, listos para `t()`. */
export const dictionaries: Record<Locale, I18nDictionary> = {
  en: build([
    enCommon as I18nDictionary,
    enAuth as I18nDictionary,
    enErrors as I18nDictionary,
    enTenant as I18nDictionary,
    enServices as I18nDictionary,
    enEmployees as I18nDictionary,
    enReservations as I18nDictionary,
    enAgenda as I18nDictionary,
    enAdmin as I18nDictionary,
    enBitacora as I18nDictionary,
    enConfig as I18nDictionary,
  ]),
  es: build([
    esCommon as I18nDictionary,
    esAuth as I18nDictionary,
    esErrors as I18nDictionary,
    esTenant as I18nDictionary,
    esServices as I18nDictionary,
    esEmployees as I18nDictionary,
    esReservations as I18nDictionary,
    esAgenda as I18nDictionary,
    esAdmin as I18nDictionary,
    esBitacora as I18nDictionary,
    esConfig as I18nDictionary,
  ]),
};
