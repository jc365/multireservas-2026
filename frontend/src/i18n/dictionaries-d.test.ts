/**
 * @file dictionaries-d.test.ts
 * @module i18n
 *
 * Tests de diccionarios F4.6d (zona admin): `admin`, `bitacora` y
 * `config` deben tener exactamente las MISMAS claves en `en` y `es`
 * (paridad de claves) y ningún valor vacío. Si se añade una clave a un
 * idioma, hay que añadirla al otro.
 *
 * `dictionaries.test.ts` cubre F4.6b (common, auth, tenant); aquí solo
 * los tres diccionarios de esta fase, para no solapar suites.
 */

import { describe, it, expect } from 'vitest';

import enAdmin from './locales/en/admin.json';
import esAdmin from './locales/es/admin.json';
import enBitacora from './locales/en/bitacora.json';
import esBitacora from './locales/es/bitacora.json';
import enConfig from './locales/en/config.json';
import esConfig from './locales/es/config.json';

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
  ['admin', enAdmin as JsonNode, esAdmin as JsonNode],
  ['bitacora', enBitacora as JsonNode, esBitacora as JsonNode],
  ['config', enConfig as JsonNode, esConfig as JsonNode],
];

describe('diccionarios F4.6d (admin, bitacora, config)', () => {
  it.each(CASES)('%s: mismas claves en en y es', (name, en, es) => {
    expect(keyPaths(es).sort()).toEqual(keyPaths(en).sort());
    expect(keyPaths(en).length).toBeGreaterThan(0);
    expect(name).toBeTruthy();
  });

  it.each(CASES)('%s: sin valores vacíos en en ni es', (_name, en, es) => {
    expect(leafValues(en).filter((v) => v.trim() === '')).toEqual([]);
    expect(leafValues(es).filter((v) => v.trim() === '')).toEqual([]);
  });

  it('claves de uso frecuente presentes (nav, tenants, bitacora, config)', () => {
    const admin = keyPaths(enAdmin as JsonNode);
    for (const key of [
      'admin.title',
      'admin.nav.tenants',
      'admin.nav.bitacora',
      'admin.nav.config',
      'admin.status.active',
      'admin.status.inactive',
      'admin.tenants.title',
      'admin.tenants.empty',
      'admin.tenantDetail.operateAsOwner',
      'admin.tenantDetail.labels.maxServiceDuration',
      'admin.tenantDetail.errors.maxDurationMultiple',
    ]) {
      expect(admin).toContain(key);
    }

    const bitacora = keyPaths(enBitacora as JsonNode);
    for (const key of [
      'bitacora.title',
      'bitacora.filters.actions',
      'bitacora.actions.create_user',
      'bitacora.actions.update_tenant_config',
      'bitacora.empty',
      'bitacora.columns.date',
      'bitacora.pagination.showing',
      'bitacora.pagination.previous',
    ]) {
      expect(bitacora).toContain(key);
    }

    const config = keyPaths(enConfig as JsonNode);
    for (const key of [
      'config.title',
      'config.loading',
      'config.empty',
      'config.save',
      'config.confirmDelete',
      'config.saveFailed',
    ]) {
      expect(config).toContain(key);
    }
  });

  it('las claves con interpolación declaran su parámetro en en y es', () => {
    for (const [en, es] of [
      [enBitacora as JsonNode, esBitacora as JsonNode],
      [enConfig as JsonNode, esConfig as JsonNode],
    ]) {
      const pairs = keyPaths(en).map(
        (path) =>
          [lookup(en, path), lookup(es, path)] as [string | undefined, string | undefined]
      );
      for (const [enValue, esValue] of pairs) {
        if (!enValue || !esValue) continue;
        expect(paramsOf(esValue)).toEqual(paramsOf(enValue));
      }
    }
  });
});

function lookup(node: JsonNode, path: string): string | undefined {
  let current: JsonNode = node;
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as { [key: string]: JsonNode })[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function paramsOf(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}
