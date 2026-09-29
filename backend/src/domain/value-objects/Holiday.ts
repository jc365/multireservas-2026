/**
 * @file Holiday.ts
 * @module domain/value-objects
 *
 * Festivo del tenant (F3.4 #6): `{ label, date, recurring, rrule }`.
 * `date` es `YYYY-MM-DD` (día calendario local, F4 añadirá tz).
 * `rrule` es derivada (F0 #2): se regenera en cada `create()` con
 * dayMaster — anual `FREQ=YEARLY` si `recurring`, `DTSTART;VALUE=DATE`
 * puntual si no.
 *
 * `create()` es estricto (PUT /tenants/me); `parse(raw)` valida el
 * array completo.
 */

import { generateRRuleFromHoliday, isValidDate } from '../utils/dayMaster';

export { isValidDate };

export interface HolidayData {
  label: string;
  date: string;
  recurring: boolean;
  rrule: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export default class Holiday {
  private readonly _label: string;
  private readonly _date: string;
  private readonly _recurring: boolean;
  private readonly _rrule: string;

  private constructor(data: HolidayData) {
    this._label = data.label;
    this._date = data.date;
    this._recurring = data.recurring;
    this._rrule = data.rrule;
  }

  /**
   * Validación estricta de un holiday. Reglas (F3.4 #11): label no
   * vacío, date `YYYY-MM-DD` válida, recurring booleano.
   * @throws {Error} con mensaje apto para respuesta 400.
   */
  static create(input: unknown): Holiday {
    if (!isObject(input)) {
      throw new Error('holiday must be an object');
    }

    const label = input.label;
    if (typeof label !== 'string' || label.trim().length === 0) {
      throw new Error('holiday label is required');
    }
    if (label.trim().length > 100) {
      throw new Error('holiday label must be at most 100 characters');
    }

    if (!isValidDate(input.date)) {
      throw new Error('holiday date must be a valid YYYY-MM-DD date');
    }

    const recurring = input.recurring === undefined ? false : input.recurring;
    if (typeof recurring !== 'boolean') {
      throw new Error('holiday recurring must be a boolean');
    }

    return new Holiday({
      label: label.trim(),
      date: input.date,
      recurring,
      rrule: generateRRuleFromHoliday({ date: input.date, recurring }),
    });
  }

  /**
   * Valida el array de holidays completo (PUT).
   * @throws {Error} `holidays must be an array` o el error del elemento.
   */
  static parse(raw: unknown): Holiday[] {
    if (!Array.isArray(raw)) {
      throw new Error('holidays must be an array');
    }
    return raw.map((item) => Holiday.create(item));
  }

  get label(): string {
    return this._label;
  }

  get date(): string {
    return this._date;
  }

  get recurring(): boolean {
    return this._recurring;
  }

  get rrule(): string {
    return this._rrule;
  }

  getValue(): HolidayData {
    return {
      label: this._label,
      date: this._date,
      recurring: this._recurring,
      rrule: this._rrule,
    };
  }

  equals(other: Holiday): boolean {
    return JSON.stringify(this.getValue()) === JSON.stringify(other.getValue());
  }
}
