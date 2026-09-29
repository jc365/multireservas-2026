import { describe, it, expect } from 'vitest';
import {
  DAY_KEYS,
  DAYS_MAP,
  RRULE_DAYS_MAP,
  isDayKey,
  toRRuleDays,
  fromRRuleDays,
  generateRRuleFromSchedule,
  generateRRuleFromHoliday,
} from '../../../../backend/src/domain/utils/dayMaster';

describe('dayMaster (F3.4 #3, #14)', () => {
  it('DAYS_MAP mapea los 7 días mon..sun → MO..SU', () => {
    expect(DAY_KEYS).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    expect(DAYS_MAP).toEqual({
      mon: 'MO',
      tue: 'TU',
      wed: 'WE',
      thu: 'TH',
      fri: 'FR',
      sat: 'SA',
      sun: 'SU',
    });
  });

  it('RRULE_DAYS_MAP es el inverso exacto de DAYS_MAP', () => {
    for (const key of DAY_KEYS) {
      expect(RRULE_DAYS_MAP[DAYS_MAP[key]]).toBe(key);
    }
  });

  it('isDayKey reconoce solo los 7 días', () => {
    expect(isDayKey('mon')).toBe(true);
    expect(isDayKey('sun')).toBe(true);
    expect(isDayKey('MON')).toBe(false);
    expect(isDayKey('holiday')).toBe(false);
    expect(isDayKey(42)).toBe(false);
  });

  it('toRRuleDays convierte dominio → RRULE', () => {
    expect(toRRuleDays(['mon', 'fri', 'sun'])).toEqual(['MO', 'FR', 'SU']);
  });

  it('toRRuleDays lanza con día desconocido', () => {
    expect(() => toRRuleDays(['mon', 'holiday'])).toThrow('Unknown day "holiday"');
  });

  it('fromRRuleDays convierte RRULE → dominio', () => {
    expect(fromRRuleDays(['MO', 'WE', 'SU'])).toEqual(['mon', 'wed', 'sun']);
  });

  it('fromRRuleDays lanza con código desconocido', () => {
    expect(() => fromRRuleDays(['XX'])).toThrow('Unknown RRULE day code "XX"');
  });

  it('roundtrip dominio → RRULE → dominio', () => {
    const days = ['tue', 'thu', 'sat'];
    expect(fromRRuleDays(toRRuleDays(days))).toEqual(days);
  });

  describe('generateRRuleFromSchedule', () => {
    it('emite BYDAY en orden canónico mon→sun sin duplicados', () => {
      expect(generateRRuleFromSchedule({ days: ['fri', 'mon', 'wed', 'mon'] })).toBe(
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'
      );
    });

    it('un solo día → BYDAY=SA', () => {
      expect(generateRRuleFromSchedule({ days: ['sat'] })).toBe(
        'RRULE:FREQ=WEEKLY;BYDAY=SA'
      );
    });

    it('los 7 días → BYDAY completo', () => {
      expect(generateRRuleFromSchedule({ days: [...DAY_KEYS] })).toBe(
        'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU'
      );
    });

    it('día desconocido → throw', () => {
      expect(() => generateRRuleFromSchedule({ days: ['xx'] })).toThrow('Unknown day "xx"');
    });
  });

  describe('generateRRuleFromHoliday', () => {
    it('recurrente → RRULE anual por mes y día', () => {
      expect(
        generateRRuleFromHoliday({ date: '2026-12-25', recurring: true })
      ).toBe('RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25');
    });

    it('puntual → DTSTART;VALUE=DATE sin ceros perdidos', () => {
      expect(
        generateRRuleFromHoliday({ date: '2026-10-05', recurring: false })
      ).toBe('DTSTART;VALUE=DATE:20261005');
    });

    it('fecha con formato inválido → throw', () => {
      expect(() =>
        generateRRuleFromHoliday({ date: '25/12/2026', recurring: true })
      ).toThrow('valid YYYY-MM-DD');
      expect(() =>
        generateRRuleFromHoliday({ date: '2026-13-01', recurring: true })
      ).toThrow('valid YYYY-MM-DD');
    });
  });
});
