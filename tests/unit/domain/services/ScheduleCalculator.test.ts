/**
 * @file ScheduleCalculator.test.ts
 * @module tests/unit/domain/services
 *
 * F4.1a: motor puro de disponibilidad — bloques estructurados, breaks,
 * festivos (exactos y recurrentes), reservas ocupadas, filtrado de
 * pasados, duración que debe caber entera en la ventana, alineación a
 * marcas locales múltiplos de slotDuration y conversión a la tz del
 * tenant.
 */

import { describe, it, expect } from 'vitest';
import ScheduleCalculator, {
  type ScheduleCalculatorInput,
} from '../../../../backend/src/domain/services/ScheduleCalculator';
import ScheduleBlock from '../../../../backend/src/domain/value-objects/ScheduleBlock';
import Holiday from '../../../../backend/src/domain/value-objects/Holiday';

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function block(
  days: string[],
  start: string,
  end: string,
  breaks: { start: string; end: string }[] = []
): ScheduleBlock {
  return ScheduleBlock.parse([{ label: 'Test', days, start, end, breaks }])[0];
}

function holiday(date: string, recurring = false): Holiday {
  return Holiday.parse([{ label: 'Festivo', date, recurring }])[0];
}

// 2026-10-15 es jueves.
function baseInput(overrides: Partial<ScheduleCalculatorInput> = {}): ScheduleCalculatorInput {
  return {
    timezone: 'UTC',
    slotDuration: 15,
    duration: 15,
    fromUTC: new Date('2026-10-15T00:00:00.000Z'),
    toUTC: new Date('2026-10-16T00:00:00.000Z'),
    nowUTC: new Date('2026-10-14T00:00:00.000Z'),
    tenantSchedules: [block(ALL_DAYS, '09:00', '17:00')],
    tenantHolidays: [],
    employeeSchedule: null,
    employeeHolidays: [],
    busy: [],
    ...overrides,
  };
}

describe('ScheduleCalculator.compute', () => {
  it('día completo de bloque 09:00–17:00 → 32 slots de 15 min', () => {
    const slots = ScheduleCalculator.compute(baseInput());

    expect(slots).toHaveLength(32);
    expect(slots[0]).toMatchObject({
      localStart: '09:00',
      localEnd: '09:15',
      startUTC: new Date('2026-10-15T09:00:00.000Z'),
      endUTC: new Date('2026-10-15T09:15:00.000Z'),
    });
    expect(slots[31]).toMatchObject({
      localStart: '16:45',
      localEnd: '17:00',
      endUTC: new Date('2026-10-15T17:00:00.000Z'),
    });
  });

  it('los breaks del bloque desaparecen de los slots', () => {
    const slots = ScheduleCalculator.compute(
      baseInput({
        tenantSchedules: [
          block(ALL_DAYS, '09:00', '17:00', [{ start: '12:00', end: '13:00' }]),
        ],
      })
    );

    expect(slots).toHaveLength(28);
    expect(slots.map((s) => s.localStart)).not.toContain('12:00');
    expect(slots.map((s) => s.localStart)).not.toContain('12:45');
    expect(slots.map((s) => s.localStart)).toContain('11:45');
    expect(slots.map((s) => s.localStart)).toContain('13:00');
  });

  it('festivo exacto del tenant → sin slots ese día', () => {
    const slots = ScheduleCalculator.compute(
      baseInput({ tenantHolidays: [holiday('2026-10-15')] })
    );
    expect(slots).toEqual([]);
  });

  it('festivo recurrente compara MM-DD → sin slots', () => {
    const slots = ScheduleCalculator.compute(
      baseInput({ tenantHolidays: [holiday('2020-10-15', true)] })
    );
    expect(slots).toEqual([]);
  });

  it('festivo de otro día no afecta', () => {
    const slots = ScheduleCalculator.compute(
      baseInput({ tenantHolidays: [holiday('2026-10-16')] })
    );
    expect(slots).toHaveLength(32);
  });

  it('festivos del employee se SUMAN a los del tenant (F0 #2)', () => {
    const slots = ScheduleCalculator.compute(
      baseInput({ employeeHolidays: [holiday('2026-10-15')] })
    );
    expect(slots).toEqual([]);
  });

  it('slots pasados se filtran: startUTC > nowUTC (estricto)', () => {
    const slots = ScheduleCalculator.compute(
      baseInput({ nowUTC: new Date('2026-10-15T12:00:00.000Z') })
    );
    expect(slots).toHaveLength(19);
    expect(slots[0].localStart).toBe('12:15');
    expect(slots.every((s) => s.startUTC.getTime() > Date.parse('2026-10-15T12:00:00.000Z'))).toBe(
      true
    );
  });

  it('la reserva activa ocupa su rango (solape por start/end)', () => {
    const slots = ScheduleCalculator.compute(
      baseInput({
        busy: [
          {
            start: new Date('2026-10-15T10:00:00.000Z'),
            end: new Date('2026-10-15T11:00:00.000Z'),
          },
        ],
      })
    );
    expect(slots).toHaveLength(28);
    expect(slots.map((s) => s.localStart)).not.toContain('10:00');
    expect(slots.map((s) => s.localStart)).not.toContain('10:45');
    expect(slots.map((s) => s.localStart)).toContain('09:45');
    expect(slots.map((s) => s.localStart)).toContain('11:00');
  });

  it('duration 30 → el último slot que cabe termina en el cierre', () => {
    const slots = ScheduleCalculator.compute(baseInput({ duration: 30 }));
    expect(slots).toHaveLength(31);
    expect(slots[30]).toMatchObject({ localStart: '16:30', localEnd: '17:00' });
  });

  it('duration mayor que la ventana → sin slots', () => {
    const slots = ScheduleCalculator.compute(
      baseInput({
        duration: 60,
        tenantSchedules: [block(ALL_DAYS, '09:00', '09:30')],
      })
    );
    expect(slots).toEqual([]);
  });

  it('el horario custom del employee REEMPLAZA al del tenant', () => {
    const slots = ScheduleCalculator.compute(
      baseInput({ employeeSchedule: [block(ALL_DAYS, '10:00', '12:00')] })
    );
    expect(slots).toHaveLength(8);
    expect(slots[0].localStart).toBe('10:00');
    expect(slots[7].localEnd).toBe('12:00');
  });

  it('bloque solo de lunes → jueves 2026-10-15 sin slots', () => {
    const slots = ScheduleCalculator.compute(
      baseInput({ tenantSchedules: [block(['mon'], '09:00', '17:00')] })
    );
    expect(slots).toEqual([]);
  });

  it('muestra la hora en la tz del tenant y startUTC en UTC', () => {
    const slots = ScheduleCalculator.compute(
      baseInput({
        timezone: 'Europe/Madrid',
        tenantSchedules: [block(ALL_DAYS, '09:00', '10:00')],
      })
    );
    expect(slots).toHaveLength(4);
    expect(slots[0]).toMatchObject({
      localStart: '09:00',
      localEnd: '09:15',
      startUTC: new Date('2026-10-15T07:00:00.000Z'),
      endUTC: new Date('2026-10-15T07:15:00.000Z'),
    });
    expect(slots[3].localEnd).toBe('10:00');
  });

  it('la alineación de marcas no depende de from (paginación estable)', () => {
    const full = ScheduleCalculator.compute(baseInput());
    const paged = ScheduleCalculator.compute(
      baseInput({ fromUTC: new Date('2026-10-15T11:07:00.000Z') })
    );
    expect(paged[0].localStart).toBe('11:15');
    expect(full.some((s) => s.localStart === '11:15')).toBe(true);
  });

  it('rango vacío o sin horario → []', () => {
    expect(
      ScheduleCalculator.compute(
        baseInput({
          fromUTC: new Date('2026-10-16T00:00:00.000Z'),
          toUTC: new Date('2026-10-15T00:00:00.000Z'),
        })
      )
    ).toEqual([]);
    expect(ScheduleCalculator.compute(baseInput({ tenantSchedules: [] }))).toEqual([]);
  });
});
