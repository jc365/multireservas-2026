/**
 * @file dictionaries-c.test.ts
 * @module i18n
 *
 * Tests de diccionarios F4.6c (CRUDs): `services`, `employees`,
 * `reservations` y `agenda` deben tener exactamente las MISMAS claves
 * en `en` y `es` (paridad de claves) y ningún valor vacío. Si se añade
 * una clave a un idioma, hay que añadirla al otro.
 */

import { describe, it, expect } from 'vitest';

import enServices from './locales/en/services.json';
import esServices from './locales/es/services.json';
import enEmployees from './locales/en/employees.json';
import esEmployees from './locales/es/employees.json';
import enReservations from './locales/en/reservations.json';
import esReservations from './locales/es/reservations.json';
import enAgenda from './locales/en/agenda.json';
import esAgenda from './locales/es/agenda.json';

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
  ['services', enServices as JsonNode, esServices as JsonNode],
  ['employees', enEmployees as JsonNode, esEmployees as JsonNode],
  ['reservations', enReservations as JsonNode, esReservations as JsonNode],
  ['agenda', enAgenda as JsonNode, esAgenda as JsonNode],
];

describe('diccionarios F4.6c (services, employees, reservations, agenda)', () => {
  it.each(CASES)('%s: mismas claves en en y es', (name, en, es) => {
    expect(keyPaths(es).sort()).toEqual(keyPaths(en).sort());
    expect(keyPaths(en).length).toBeGreaterThan(0);
    expect(name).toBeTruthy();
  });

  it.each(CASES)('%s: sin valores vacíos en en ni es', (_name, en, es) => {
    expect(leafValues(en).filter((v) => v.trim() === '')).toEqual([]);
    expect(leafValues(es).filter((v) => v.trim() === '')).toEqual([]);
  });

  it('claves de uso frecuentes presentes (CRUDs, resumen de grupo y agenda)', () => {
    const services = keyPaths(enServices as JsonNode);
    for (const key of [
      'services.title',
      'services.empty',
      'services.verifyMessage',
      'services.form.name',
      'services.edit.title',
      'services.errors.nameRequired',
    ]) {
      expect(services).toContain(key);
    }

    const employees = keyPaths(enEmployees as JsonNode);
    for (const key of [
      'employees.title',
      'employees.noAccess',
      'employees.badge.count',
      'employees.form.email',
      'employees.errors.jsonInvalid',
    ]) {
      expect(employees).toContain(key);
    }

    const reservations = keyPaths(enReservations as JsonNode);
    for (const key of [
      'reservations.title',
      'reservations.summary.one',
      'reservations.summary.many',
      'reservations.groupCancel.every',
      'reservations.groupCancel.all',
      'reservations.cancel.groupNotice',
      'reservations.picker.empty',
      'reservations.picker.loadMore',
      'reservations.fields.client',
    ]) {
      expect(reservations).toContain(key);
    }

    const agenda = keyPaths(enAgenda as JsonNode);
    for (const key of ['agenda.title', 'agenda.employee', 'agenda.includeCancelled']) {
      expect(agenda).toContain(key);
    }
  });

  it('resumen de grupo: mismos marcadores {param} en en y es', () => {
    const en = enReservations.reservations as { summary: Record<string, string> };
    const es = esReservations.reservations as { summary: Record<string, string> };
    for (const variant of ['one', 'many'] as const) {
      const params = (value: string) => (value.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
      expect(params(es.summary[variant])).toEqual(params(en.summary[variant]));
    }
  });
});
