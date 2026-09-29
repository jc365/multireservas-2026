import { describe, it, expect } from 'vitest';
import Holiday, { isValidDate } from '../../../../backend/src/domain/value-objects/Holiday';

describe('Holiday (F3.4 #6, #11)', () => {
  it('crea un holiday recurrente con rrule anual derivada', () => {
    const holiday = Holiday.create({
      label: 'Navidad',
      date: '2026-12-25',
      recurring: true,
    });
    expect(holiday.label).toBe('Navidad');
    expect(holiday.date).toBe('2026-12-25');
    expect(holiday.recurring).toBe(true);
    expect(holiday.rrule).toBe('RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25');
  });

  it('crea un holiday puntual con DTSTART;VALUE=DATE', () => {
    const holiday = Holiday.create({
      label: 'Puente local',
      date: '2026-10-12',
      recurring: false,
    });
    expect(holiday.rrule).toBe('DTSTART;VALUE=DATE:20261012');
  });

  it('recurring ausente → false (default)', () => {
    const holiday = Holiday.create({ label: 'Sin bandera', date: '2026-01-01' });
    expect(holiday.recurring).toBe(false);
    expect(holiday.rrule).toBe('DTSTART;VALUE=DATE:20260101');
  });

  it('la rrule se regenera aunque el input traiga una rrule ajena', () => {
    const holiday = Holiday.create({
      label: 'Navidad',
      date: '2026-12-25',
      recurring: true,
      rrule: 'RRULE:FREQ=DAILY',
    });
    expect(holiday.rrule).toBe('RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25');
  });

  it('trim del label', () => {
    expect(Holiday.create({ label: '  Feriado  ', date: '2026-05-01' }).label).toBe(
      'Feriado'
    );
  });

  describe('isValidDate', () => {
    it('acepta fechas reales en YYYY-MM-DD', () => {
      expect(isValidDate('2026-01-01')).toBe(true);
      expect(isValidDate('2028-02-29')).toBe(true);
    });

    it('rechaza formato, día inexistente y tipos no-string', () => {
      expect(isValidDate('25/12/2026')).toBe(false);
      expect(isValidDate('2026-02-31')).toBe(false);
      expect(isValidDate('2026-13-01')).toBe(false);
      expect(isValidDate('2026-1-1')).toBe(false);
      expect(isValidDate(20261225)).toBe(false);
      expect(isValidDate(null)).toBe(false);
    });
  });

  describe('validación (F3.4 #11)', () => {
    it('no-objeto → throw', () => {
      expect(() => Holiday.create('x')).toThrow('holiday must be an object');
      expect(() => Holiday.create(null)).toThrow('holiday must be an object');
    });

    it('label vacío → throw', () => {
      expect(() => Holiday.create({ label: '', date: '2026-12-25' })).toThrow(
        'holiday label is required'
      );
      expect(() => Holiday.create({ date: '2026-12-25' })).toThrow(
        'holiday label is required'
      );
    });

    it('date inválida → throw', () => {
      expect(() => Holiday.create({ label: 'X', date: '2026-02-31' })).toThrow(
        'holiday date must be a valid YYYY-MM-DD date'
      );
      expect(() => Holiday.create({ label: 'X', date: '12-12-2026' })).toThrow(
        'holiday date must be a valid YYYY-MM-DD date'
      );
    });

    it('recurring no booleano → throw', () => {
      expect(() =>
        Holiday.create({ label: 'X', date: '2026-12-25', recurring: 'yes' })
      ).toThrow('holiday recurring must be a boolean');
    });
  });

  describe('parse()', () => {
    it('no-array → throw', () => {
      expect(() => Holiday.parse('x')).toThrow('holidays must be an array');
      expect(() => Holiday.parse(undefined)).toThrow('holidays must be an array');
    });

    it('array vacío → [] y array válido → holidays', () => {
      expect(Holiday.parse([])).toEqual([]);
      const holidays = Holiday.parse([
        { label: 'Navidad', date: '2026-12-25', recurring: true },
      ]);
      expect(holidays).toHaveLength(1);
      expect(holidays[0].rrule).toContain('FREQ=YEARLY');
    });
  });

  it('getValue devuelve copia y equals compara por valor', () => {
    const a = Holiday.create({ label: 'A', date: '2026-12-25', recurring: true });
    const b = Holiday.create({ label: 'A', date: '2026-12-25', recurring: true });
    expect(a.equals(b)).toBe(true);
    expect(a.getValue()).not.toBe(b.getValue());
    expect(b.label).toBe('A');
  });
});
