/**
 * @file ScheduleBlock.ts
 * @module domain/value-objects
 *
 * Bloque de horario semanal del tenant (F3.4 #5):
 * `{ label, days[], start, end, breaks[], rrule }`. Horas en formato
 * `HH:MM` (24h). `rrule` es derivada (F0 #2): se regenera en cada
 * `create()` con dayMaster y no se acepta desde fuera.
 *
 * `create()` es estricto (PUT /tenants/me) y lanza mensajes aptos
 * para 400. `parseScheduleBlocks(raw)` valida el array completo.
 */

import { DAY_KEYS, type DayKey, generateRRuleFromSchedule } from '../utils/dayMaster';

export interface BreakWindow {
  start: string;
  end: string;
}

export interface ScheduleBlockData {
  label: string;
  days: DayKey[];
  start: string;
  end: string;
  breaks: BreakWindow[];
  rrule: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

export default class ScheduleBlock {
  private readonly _label: string;
  private readonly _days: DayKey[];
  private readonly _start: string;
  private readonly _end: string;
  private readonly _breaks: BreakWindow[];
  private readonly _rrule: string;

  private constructor(data: ScheduleBlockData) {
    this._label = data.label;
    this._days = data.days;
    this._start = data.start;
    this._end = data.end;
    this._breaks = data.breaks;
    this._rrule = data.rrule;
  }

  /**
   * Validación estricta de un bloque. Reglas (F3.4 #11): label no
   * vacío, days ⊆ {mon…sun} sin vacíos, start < end en `HH:MM`, cada
   * break con `start < end` dentro del rango del bloque.
   * @throws {Error} con mensaje apto para respuesta 400.
   */
  static create(input: unknown): ScheduleBlock {
    if (!isObject(input)) {
      throw new Error('schedule block must be an object');
    }

    const label = input.label;
    if (typeof label !== 'string' || label.trim().length === 0) {
      throw new Error('schedule label is required');
    }
    if (label.trim().length > 100) {
      throw new Error('schedule label must be at most 100 characters');
    }

    if (!Array.isArray(input.days) || input.days.length === 0) {
      throw new Error('schedule days must be a non-empty array');
    }
    const days: DayKey[] = [];
    for (const day of input.days) {
      if (typeof day !== 'string' || !(DAY_KEYS as readonly string[]).includes(day)) {
        throw new Error(
          'schedule days must be from mon, tue, wed, thu, fri, sat, sun'
        );
      }
      if (!days.includes(day as DayKey)) {
        days.push(day as DayKey);
      }
    }
    const canonicalDays = DAY_KEYS.filter((key) => days.includes(key));

    if (!isValidTime(input.start)) {
      throw new Error('schedule start must be a valid HH:MM time');
    }
    if (!isValidTime(input.end)) {
      throw new Error('schedule end must be a valid HH:MM time');
    }
    if (toMinutes(input.start) >= toMinutes(input.end)) {
      throw new Error('schedule start must be before schedule end');
    }

    let rawBreaks: unknown[] = [];
    if (input.breaks !== undefined) {
      if (!Array.isArray(input.breaks)) {
        throw new Error('schedule breaks must be an array');
      }
      rawBreaks = input.breaks;
    }
    const breaks: BreakWindow[] = [];
    for (const rawBreak of rawBreaks) {
      if (!isObject(rawBreak) || !isValidTime(rawBreak.start) || !isValidTime(rawBreak.end)) {
        throw new Error('break must be an object with valid HH:MM start and end');
      }
      if (toMinutes(rawBreak.start) >= toMinutes(rawBreak.end)) {
        throw new Error('break start must be before break end');
      }
      if (
        toMinutes(rawBreak.start) < toMinutes(input.start) ||
        toMinutes(rawBreak.end) > toMinutes(input.end)
      ) {
        throw new Error('break must be within the schedule block range');
      }
      breaks.push({ start: rawBreak.start, end: rawBreak.end });
    }

    return new ScheduleBlock({
      label: label.trim(),
      days: canonicalDays,
      start: input.start,
      end: input.end,
      breaks,
      rrule: generateRRuleFromSchedule({ days: canonicalDays }),
    });
  }

  /**
   * Valida el array de bloques completo (PUT). Cada elemento pasa por
   * `create()`; si `raw` no es array lanza `schedules must be an array`.
   */
  static parse(raw: unknown): ScheduleBlock[] {
    if (!Array.isArray(raw)) {
      throw new Error('schedules must be an array');
    }
    return raw.map((item) => ScheduleBlock.create(item));
  }

  get label(): string {
    return this._label;
  }

  get days(): DayKey[] {
    return [...this._days];
  }

  get start(): string {
    return this._start;
  }

  get end(): string {
    return this._end;
  }

  get breaks(): BreakWindow[] {
    return this._breaks.map((br) => ({ ...br }));
  }

  get rrule(): string {
    return this._rrule;
  }

  getValue(): ScheduleBlockData {
    return {
      label: this._label,
      days: [...this._days],
      start: this._start,
      end: this._end,
      breaks: this._breaks.map((br) => ({ ...br })),
      rrule: this._rrule,
    };
  }

  equals(other: ScheduleBlock): boolean {
    return JSON.stringify(this.getValue()) === JSON.stringify(other.getValue());
  }
}
