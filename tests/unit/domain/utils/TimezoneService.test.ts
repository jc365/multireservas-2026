/**
 * @file TimezoneService.test.ts
 * @module tests/unit/domain/utils
 *
 * F4.1a: conversiones local ↔ UTC con Intl nativo, incluido DST
 * (Europe/Madrid y America/New_York) y formato `00:00` (hourCycle h23).
 */

import { describe, it, expect } from 'vitest';
import {
  isValidTimeZone,
  getTimeZoneOffsetMs,
  convertToUTC,
  convertFromUTC,
  formatForDisplay,
  localDateString,
  generateTimeSlots,
} from '../../../../backend/src/domain/utils/TimezoneService';

describe('isValidTimeZone', () => {
  it('zonas IANA válidas → true', () => {
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Europe/Madrid')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
  });

  it('zonas inválidas o vacías → false', () => {
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('   ')).toBe(false);
  });
});

describe('getTimeZoneOffsetMs', () => {
  it('Madrid: +2h en verano, +1h en invierno (DST)', () => {
    expect(getTimeZoneOffsetMs('Europe/Madrid', Date.UTC(2026, 6, 1, 12))).toBe(7_200_000);
    expect(getTimeZoneOffsetMs('Europe/Madrid', Date.UTC(2026, 0, 15, 12))).toBe(3_600_000);
  });

  it('New York: −4h en verano, −5h en invierno', () => {
    expect(getTimeZoneOffsetMs('America/New_York', Date.UTC(2026, 6, 1, 12))).toBe(-14_400_000);
    expect(getTimeZoneOffsetMs('America/New_York', Date.UTC(2026, 0, 15, 12))).toBe(-18_000_000);
  });
});

describe('convertToUTC', () => {
  it('hora local sin offset → instante UTC según la zona', () => {
    expect(convertToUTC('2026-10-15T09:00', 'Europe/Madrid').toISOString()).toBe(
      '2026-10-15T07:00:00.000Z'
    );
    expect(convertToUTC('2026-01-15T09:00', 'Europe/Madrid').toISOString()).toBe(
      '2026-01-15T08:00:00.000Z'
    );
    expect(convertToUTC('2026-07-04T09:00', 'America/New_York').toISOString()).toBe(
      '2026-07-04T13:00:00.000Z'
    );
    expect(convertToUTC('2026-10-15T09:00', 'UTC').toISOString()).toBe(
      '2026-10-15T09:00:00.000Z'
    );
  });

  it('acepta segundos y round-tripea con convertFromUTC', () => {
    const utc = convertToUTC('2026-06-01T10:30:15', 'Europe/Madrid');
    expect(convertFromUTC(utc, 'Europe/Madrid')).toBe('2026-06-01T10:30');
  });

  it('spring forward: hora local inexistente se resuelve y round-tripea', () => {
    // Madrid 2026-03-29: 02:00 → 03:00; 03:30 local existe (CEST +2).
    const utc = convertToUTC('2026-03-29T03:30', 'Europe/Madrid');
    expect(utc.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(formatForDisplay(utc, 'Europe/Madrid')).toBe('03:30');
  });

  it('fall back: hora repetida resuelve a un instante que muestra esa hora', () => {
    // Madrid 2026-10-25: 03:00 → 02:00; 02:30 ocurre dos veces.
    const utc = convertToUTC('2026-10-25T02:30', 'Europe/Madrid');
    expect(formatForDisplay(utc, 'Europe/Madrid')).toBe('02:30');
  });

  it('formato inválido → throw', () => {
    expect(() => convertToUTC('2026-10-15 09:00', 'UTC')).toThrow(
      'invalid local datetime'
    );
    expect(() => convertToUTC('2026-10-15T09:00Z', 'UTC')).toThrow(
      'invalid local datetime'
    );
    expect(() => convertToUTC('ayer', 'UTC')).toThrow('invalid local datetime');
  });
});

describe('formatForDisplay / localDateString', () => {
  it('formatea HH:MM y medianoche como 00:00 (h23)', () => {
    expect(formatForDisplay(new Date('2026-10-15T00:00:00.000Z'), 'UTC')).toBe('00:00');
    expect(formatForDisplay(new Date('2026-10-15T09:05:00.000Z'), 'UTC')).toBe('09:05');
  });

  it('usa la zona del tenant, no el servidor', () => {
    expect(formatForDisplay(new Date('2026-10-15T23:30:00.000Z'), 'Europe/Madrid')).toBe(
      '01:30'
    );
  });

  it('localDateString devuelve el día calendario local', () => {
    expect(localDateString(new Date('2026-10-15T22:30:00.000Z'), 'Europe/Madrid')).toBe(
      '2026-10-16'
    );
    expect(localDateString(new Date('2026-10-15T22:30:00.000Z'), 'UTC')).toBe(
      '2026-10-15'
    );
  });
});

describe('generateTimeSlots', () => {
  it('trocea [start, end) en piezas consecutivas sin sobrepasar el fin', () => {
    const slots = generateTimeSlots(
      new Date('2026-10-15T09:00:00.000Z'),
      new Date('2026-10-15T10:00:00.000Z'),
      15
    );
    expect(slots).toHaveLength(4);
    expect(slots[0].start.toISOString()).toBe('2026-10-15T09:00:00.000Z');
    expect(slots[3].end.toISOString()).toBe('2026-10-15T10:00:00.000Z');
  });

  it('la última pieza no se trunca: si no cabe completa, no se emite', () => {
    const slots = generateTimeSlots(
      new Date('2026-10-15T09:00:00.000Z'),
      new Date('2026-10-15T09:50:00.000Z'),
      15
    );
    expect(slots).toHaveLength(3);
    expect(slots[2].end.toISOString()).toBe('2026-10-15T09:45:00.000Z');
  });

  it('rango vacío → []', () => {
    const t = new Date('2026-10-15T09:00:00.000Z');
    expect(generateTimeSlots(t, t, 15)).toEqual([]);
  });

  it('step inválido → throw', () => {
    const t = new Date('2026-10-15T09:00:00.000Z');
    expect(() => generateTimeSlots(t, new Date(), 0)).toThrow(
      'slotMinutes must be a positive integer'
    );
    expect(() => generateTimeSlots(t, new Date(), 7.5)).toThrow(
      'slotMinutes must be a positive integer'
    );
  });
});
