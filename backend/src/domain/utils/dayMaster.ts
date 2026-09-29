/**
 * @file dayMaster.ts
 * @module domain/utils
 *
 * dayMaster (F3.4 #3, #14): mapeo canónico entre los días del dominio
 * (`mon`, `tue`, …) y los códigos RRULE (`MO`, `TU`, …), más la
 * generación de las RRules derivadas que se guardan junto al bloque
 * estructurado (la fuente de verdad es el bloque; la RRule es
 * derivada, F0 #2). Sin i18n (SF8 añadirá nombres traducidos).
 *
 * Formatos derivados (decisión de implementación F3.4):
 * - Schedule block → `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,…` (los días se
 *   emiten en orden canónico mon→sun; horas/breaks viven en los
 *   campos estructurados, no en la RRule).
 * - Holiday recurrente → `RRULE:FREQ=YEARLY;BYMONTH=MM;BYMONTHDAY=DD`.
 * - Holiday puntual → `DTSTART;VALUE=DATE:YYYYMMDD` (iCal DATE).
 */

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

/** `mon` ↔ `MO` (F3.4 #14). */
export const DAYS_MAP: Record<DayKey, string> = {
  mon: 'MO',
  tue: 'TU',
  wed: 'WE',
  thu: 'TH',
  fri: 'FR',
  sat: 'SA',
  sun: 'SU',
};

/** Inverso de DAYS_MAP (`MO` → `mon`). */
export const RRULE_DAYS_MAP: Record<string, DayKey> = Object.fromEntries(
  DAY_KEYS.map((key) => [DAYS_MAP[key], key])
) as Record<string, DayKey>;

export function isDayKey(value: unknown): value is DayKey {
  return typeof value === 'string' && (DAY_KEYS as readonly string[]).includes(value);
}

/**
 * Convierte `['mon','tue']` → `['MO','TU']`. Lanza si hay un día
 * desconocido (no valida silenciosamente).
 */
export function toRRuleDays(days: string[]): string[] {
  return days.map((day) => {
    if (!isDayKey(day)) {
      throw new Error(`Unknown day "${day}" (expected mon|tue|wed|thu|fri|sat|sun)`);
    }
    return DAYS_MAP[day];
  });
}

/**
 * Convierte `['MO','TU']` → `['mon','tue']`. Lanza si hay un código
 * desconocido.
 */
export function fromRRuleDays(codes: string[]): DayKey[] {
  return codes.map((code) => {
    const key = RRULE_DAYS_MAP[code];
    if (!key) {
      throw new Error(`Unknown RRULE day code "${code}" (expected MO|TU|WE|TH|FR|SA|SU)`);
    }
    return key;
  });
}

/** Orden canónico mon→sun para salidas deterministas. */
function canonicalOrder(days: string[]): DayKey[] {
  const set = new Set(days.map((day) => {
    if (!isDayKey(day)) {
      throw new Error(`Unknown day "${day}" (expected mon|tue|wed|thu|fri|sat|sun)`);
    }
    return day;
  }));
  return DAY_KEYS.filter((key) => set.has(key));
}

/**
 * RRule derivada de un bloque de horario:
 * `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`.
 */
export function generateRRuleFromSchedule(block: { days: string[] }): string {
  const codes = canonicalOrder(block.days).map((key) => DAYS_MAP[key]);
  return `RRULE:FREQ=WEEKLY;BYDAY=${codes.join(',')}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` con día calendario real (rechaza 2026-02-31). */
export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() === Number(month) - 1 &&
    parsed.getUTCDate() === Number(day)
  );
}

/**
 * RRule derivada de un holiday. Recurrente → anual por mes+día;
 * puntual → `DTSTART;VALUE=DATE` con la fecha concreta.
 */
export function generateRRuleFromHoliday(holiday: { date: string; recurring: boolean }): string {
  if (!isValidDate(holiday.date)) {
    throw new Error(`Holiday date must be a valid YYYY-MM-DD string, got "${holiday.date}"`);
  }
  const [year, month, day] = holiday.date.split('-');
  if (!holiday.recurring) {
    return `DTSTART;VALUE=DATE:${year}${month}${day}`;
  }
  return `RRULE:FREQ=YEARLY;BYMONTH=${Number(month)};BYMONTHDAY=${Number(day)}`;
}
