import { describe, it, expect } from 'vitest';
import ScheduleBlock, { isValidTime } from '../../../../backend/src/domain/value-objects/ScheduleBlock';

const validBlock = {
  label: 'Horario semanal',
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  start: '09:00',
  end: '18:00',
  breaks: [{ start: '13:00', end: '14:00' }],
};

describe('ScheduleBlock (F3.4 #5, #11)', () => {
  it('crea un bloque válido y genera la rrule derivada', () => {
    const block = ScheduleBlock.create(validBlock);
    expect(block.label).toBe('Horario semanal');
    expect(block.days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(block.start).toBe('09:00');
    expect(block.end).toBe('18:00');
    expect(block.breaks).toEqual([{ start: '13:00', end: '14:00' }]);
    expect(block.rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  });

  it('normaliza días: orden canónico, sin duplicados, trim del label', () => {
    const block = ScheduleBlock.create({
      ...validBlock,
      label: '  Mañana  ',
      days: ['fri', 'mon', 'fri', 'wed'],
    });
    expect(block.label).toBe('Mañana');
    expect(block.days).toEqual(['mon', 'wed', 'fri']);
    expect(block.rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
  });

  it('la rrule se regenera aunque el input traiga una rrule ajena', () => {
    const block = ScheduleBlock.create({
      ...validBlock,
      rrule: 'RRULE:FREQ=DAILY;BYDAY=MO,WE',
    });
    expect(block.rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  });

  it('breaks ausentes → array vacío', () => {
    const block = ScheduleBlock.create({ ...validBlock, breaks: undefined });
    expect(block.breaks).toEqual([]);
  });

  it('isValidTime acepta HH:MM 24h y rechaza el resto', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:00')).toBe(false);
    expect(isValidTime('12:60')).toBe(false);
    expect(isValidTime('12:00:00')).toBe(false);
    expect(isValidTime(1200)).toBe(false);
  });

  describe('validación (F3.4 #11)', () => {
    it('no-objeto → throw', () => {
      expect(() => ScheduleBlock.create('x')).toThrow('schedule block must be an object');
      expect(() => ScheduleBlock.create(null)).toThrow('schedule block must be an object');
    });

    it('label vacío o ausente → throw', () => {
      expect(() => ScheduleBlock.create({ ...validBlock, label: '' })).toThrow(
        'schedule label is required'
      );
      expect(() => ScheduleBlock.create({ ...validBlock, label: '   ' })).toThrow(
        'schedule label is required'
      );
      expect(() => ScheduleBlock.create({ ...validBlock, label: 42 })).toThrow(
        'schedule label is required'
      );
    });

    it('days vacío o con valor desconocido → throw', () => {
      expect(() => ScheduleBlock.create({ ...validBlock, days: [] })).toThrow(
        'schedule days must be a non-empty array'
      );
      expect(() => ScheduleBlock.create({ ...validBlock, days: 'mon' })).toThrow(
        'schedule days must be a non-empty array'
      );
      expect(() => ScheduleBlock.create({ ...validBlock, days: ['mon', 'holiday'] })).toThrow(
        'schedule days must be from mon, tue, wed, thu, fri, sat, sun'
      );
    });

    it('start/end inválidos o start >= end → throw', () => {
      expect(() => ScheduleBlock.create({ ...validBlock, start: '9am' })).toThrow(
        'schedule start must be a valid HH:MM time'
      );
      expect(() => ScheduleBlock.create({ ...validBlock, end: '25:00' })).toThrow(
        'schedule end must be a valid HH:MM time'
      );
      expect(() =>
        ScheduleBlock.create({ ...validBlock, start: '18:00', end: '18:00' })
      ).toThrow('schedule start must be before schedule end');
      expect(() =>
        ScheduleBlock.create({ ...validBlock, start: '14:00', end: '10:00' })
      ).toThrow('schedule start must be before schedule end');
    });

    it('breaks mal formados o fuera de rango → throw', () => {
      expect(() => ScheduleBlock.create({ ...validBlock, breaks: 'noon' })).toThrow(
        'schedule breaks must be an array'
      );
      expect(() =>
        ScheduleBlock.create({ ...validBlock, breaks: [{ start: '13:00' }] })
      ).toThrow('break must be an object with valid HH:MM start and end');
      expect(() =>
        ScheduleBlock.create({
          ...validBlock,
          breaks: [{ start: '14:00', end: '13:00' }],
        })
      ).toThrow('break start must be before break end');
      expect(() =>
        ScheduleBlock.create({
          ...validBlock,
          breaks: [{ start: '08:00', end: '09:00' }],
        })
      ).toThrow('break must be within the schedule block range');
      expect(() =>
        ScheduleBlock.create({
          ...validBlock,
          breaks: [{ start: '17:00', end: '19:00' }],
        })
      ).toThrow('break must be within the schedule block range');
      expect(() =>
        ScheduleBlock.create({
          ...validBlock,
          breaks: [{ start: '09:00', end: '18:00' }],
        }).getValue()
      ).toBeTruthy();
    });
  });

  describe('parse()', () => {
    it('no-array → throw', () => {
      expect(() => ScheduleBlock.parse({})).toThrow('schedules must be an array');
      expect(() => ScheduleBlock.parse(null)).toThrow('schedules must be an array');
    });

    it('array vacío → [] y array válido → bloques con rrule', () => {
      expect(ScheduleBlock.parse([])).toEqual([]);
      const blocks = ScheduleBlock.parse([validBlock]);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    });
  });

  it('getValue devuelve copia profunda y equals compara por valor', () => {
    const a = ScheduleBlock.create(validBlock);
    const b = ScheduleBlock.create(validBlock);
    const data = a.getValue();
    data.breaks[0].start = '12:00';
    expect(a.breaks[0].start).toBe('13:00');
    expect(a.equals(ScheduleBlock.create(validBlock))).toBe(true);
    expect(a.equals(b)).toBe(true);
  });
});
