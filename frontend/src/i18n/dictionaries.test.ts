/**
 * @file dictionaries.test.ts
 * @module i18n
 *
 * Tests de diccionarios F4.6b: `common`, `auth` y `tenant` deben tener
 * exactamente las MISMAS claves en `en` y `es` (paridad de claves) y
 * ningún valor vacío. Si se añade una clave a un idioma, hay que
 * añadirla al otro.
 */

import { describe, it, expect } from 'vitest';

import enCommon from './locales/en/common.json';
import esCommon from './locales/es/common.json';
import enAuth from './locales/en/auth.json';
import esAuth from './locales/es/auth.json';
import enTenant from './locales/en/tenant.json';
import esTenant from './locales/es/tenant.json';

type JsonNode = string | number | boolean | null | JsonNode[] | { [key: string]: JsonNode };

/** Rutas de todas las hojas (`a.b.c`) de un diccionario JSON. */
function keyPaths(node: JsonNode, prefix = ''): string[] {
  if (node === null || typeof node !== 'object') {
    return [prefix];
  }
  return Object.entries(node).flatMap(([key, value]) =>
    keyPaths(value, prefix ? `${prefix}.${key}` : key)
  );
}

/** Todos los valores hoja (strings) de un diccionario JSON. */
function leafValues(node: JsonNode): string[] {
  if (typeof node === 'string') return [node];
  if (node === null || typeof node !== 'object') return [];
  return Object.values(node).flatMap(leafValues);
}

const CASES: Array<[string, JsonNode, JsonNode]> = [
  ['common', enCommon as JsonNode, esCommon as JsonNode],
  ['auth', enAuth as JsonNode, esAuth as JsonNode],
  ['tenant', enTenant as JsonNode, esTenant as JsonNode],
];

describe('diccionarios F4.6b (common, auth, tenant)', () => {
  it.each(CASES)('%s: mismas claves en en y es', (name, en, es) => {
    expect(keyPaths(es).sort()).toEqual(keyPaths(en).sort());
    expect(keyPaths(en).length).toBeGreaterThan(0);
    expect(name).toBeTruthy();
  });

  it.each(CASES)('%s: sin valores vacíos en en ni es', (_name, en, es) => {
    expect(leafValues(en).filter((v) => v.trim() === '')).toEqual([]);
    expect(leafValues(es).filter((v) => v.trim() === '')).toEqual([]);
  });

  it('claves de uso frecuente presentes (nav, register, checkEmail, dashboard, config)', () => {
    const en = keyPaths(enCommon as JsonNode);
    for (const key of ['nav.dashboard', 'nav.logout', 'nav.theme', 'buttons.save', 'error']) {
      expect(en).toContain(key);
    }
    const auth = keyPaths(enAuth as JsonNode);
    for (const key of [
      'auth.login.submit',
      'auth.register.submit',
      'auth.checkEmail.title',
      'auth.verify.resend',
    ]) {
      expect(auth).toContain(key);
    }
    const tenant = keyPaths(enTenant as JsonNode);
    for (const key of [
      'tenant.dashboard.welcome',
      'tenant.dashboard.verifyBanner',
      'tenant.config.title',
      'tenant.config.save',
      'tenant.config.errors.nameRequired',
    ]) {
      expect(tenant).toContain(key);
    }
  });
});
