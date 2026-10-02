/**
 * @file ScheduleCalculator.ts
 * @module domain/services
 *
 * Motor puro de disponibilidad (F4.1a). Dado el horario efectivo del
 * empleado (bloques estructurados, NO RRULE), sus festivos, los del
 * tenant, el rango consultado y las reservas activas ya ocupadas,
 * devuelve los slots libres.
 *
 * Algoritmo (F0 #2):
 * 1. Horario efectivo = `employeeSchedule ?? tenantSchedules`.
 * 2. Por cada día calendario local (zona del tenant) del rango:
 *    a. ¿festivo? (tenant + empleado; `recurring` compara MM-DD) → saltar.
 *    b. bloques aplicables al día de la semana; ventana local `start`→`end`
 *       convertida a UTC; recortada al rango consultado.
 *    c. restar breaks → ventanas limpias.
 *    d. candidatos = marcas locales múltiplos de `slotDuration` desde
 *       medianoche local (alineación estable: no depende de `from`/`now`,
 *       así la paginación con `from = último slot + 1 min` es consistente).
 *    e. descartar: pasados (`startUTC > nowUTC`), fuera de ventana limpia
 *       (la duración debe caber entera), solapes con reservas activas.
 * 3. Ordenar por `startUTC` y devolver.
 */

import ScheduleBlock from '../value-objects/ScheduleBlock';
import Holiday from '../value-objects/Holiday';
import type { DayKey } from '../utils/dayMaster';
import {
  convertToUTC,
  formatForDisplay,
  generateTimeSlots,
  localDateString,
} from '../utils/TimezoneService';

const MINUTE_MS = 60_000;

/** Índice `getUTCDay()` → DayKey de dayMaster (0 = domingo). */
const DOW_BY_INDEX: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export interface BusyRange {
  start: Date;
  end: Date;
}

export interface AvailabilitySlot {
  startUTC: Date;
  endUTC: Date;
  localStart: string;
  localEnd: string;
}

export interface ScheduleCalculatorInput {
  timezone: string;
  slotDuration: number;
  duration: number;
  fromUTC: Date;
  toUTC: Date;
  nowUTC: Date;
  tenantSchedules: ScheduleBlock[];
  tenantHolidays: Holiday[];
  employeeSchedule: ScheduleBlock[] | null;
  employeeHolidays: Holiday[];
  busy: BusyRange[];
}

function nextDayString(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  return next.toISOString().slice(0, 10);
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Aplana las ventanas de un bloque (recortadas a [from,to]) menos sus
 * breaks en ventanas limpias [s,e).
 */
function cleanWindows(
  day: string,
  block: ScheduleBlock,
  fromMs: number,
  toMs: number,
  timezone: string
): { s: number; e: number }[] {
  const winStart = convertToUTC(`${day}T${block.start}`, timezone).getTime();
  const winEnd = convertToUTC(`${day}T${block.end}`, timezone).getTime();
  const start = Math.max(winStart, fromMs);
  const end = Math.min(winEnd, toMs);
  if (start >= end) return [];

  const cuts = block.breaks
    .map((br) => ({
      s: convertToUTC(`${day}T${br.start}`, timezone).getTime(),
      e: convertToUTC(`${day}T${br.end}`, timezone).getTime(),
    }))
    .filter((cut) => cut.e > cut.s)
    .sort((a, b) => a.s - b.s);

  const pieces: { s: number; e: number }[] = [];
  let cursor = start;
  for (const cut of cuts) {
    if (cut.e <= cursor) continue;
    if (cut.s >= end) break;
    if (cut.s > cursor) pieces.push({ s: cursor, e: Math.min(cut.s, end) });
    cursor = Math.max(cursor, cut.e);
    if (cursor >= end) break;
  }
  if (cursor < end) pieces.push({ s: cursor, e: end });
  return pieces;
}

export default class ScheduleCalculator {
  static compute(input: ScheduleCalculatorInput): AvailabilitySlot[] {
    const schedules = input.employeeSchedule ?? input.tenantSchedules;
    if (schedules.length === 0) return [];
    if (
      !Number.isInteger(input.slotDuration) ||
      input.slotDuration <= 0 ||
      !Number.isInteger(input.duration) ||
      input.duration <= 0
    ) {
      return [];
    }
    const fromMs = input.fromUTC.getTime();
    const toMs = input.toUTC.getTime();
    if (fromMs >= toMs) return [];

    const exactHolidays = new Set<string>();
    const recurringHolidays = new Set<string>();
    for (const holiday of [...input.tenantHolidays, ...input.employeeHolidays]) {
      if (holiday.recurring) {
        recurringHolidays.add(holiday.date.slice(5));
      } else {
        exactHolidays.add(holiday.date);
      }
    }

    const durationMs = input.duration * MINUTE_MS;
    const nowMs = input.nowUTC.getTime();
    const busy = input.busy.map((range) => ({
      s: range.start.getTime(),
      e: range.end.getTime(),
    }));

    const firstDay = localDateString(input.fromUTC, input.timezone);
    const lastDay = localDateString(input.toUTC, input.timezone);

    const slots: AvailabilitySlot[] = [];
    const seen = new Set<number>();

    for (
      let day = firstDay;
      day <= lastDay && day.length === 10;
      day = nextDayString(day)
    ) {
      if (exactHolidays.has(day) || recurringHolidays.has(day.slice(5))) continue;

      const dayOfWeek = DOW_BY_INDEX[new Date(`${day}T00:00:00Z`).getUTCDay()];
      const dayBlocks = schedules.filter((block) => block.days.includes(dayOfWeek));
      if (dayBlocks.length === 0) continue;

      // Marcas candidatas del día: múltiplos de slotDuration en hora
      // local, generadas pasando la medianoche local por UTC.
      const dayStart = convertToUTC(`${day}T00:00`, input.timezone);
      const nextDayStart = convertToUTC(`${nextDayString(day)}T00:00`, input.timezone);
      const marks = generateTimeSlots(dayStart, nextDayStart, input.slotDuration).map(
        (slot) => slot.start.getTime()
      );

      for (const block of dayBlocks) {
        for (const piece of cleanWindows(day, block, fromMs, toMs, input.timezone)) {
          for (const mark of marks) {
            if (mark < piece.s || mark + durationMs > piece.e) continue;
            if (mark <= nowMs) continue;
            if (seen.has(mark)) continue;
            if (busy.some((range) => overlaps(mark, mark + durationMs, range.s, range.e))) {
              continue;
            }
            seen.add(mark);
            const startUTC = new Date(mark);
            const endUTC = new Date(mark + durationMs);
            slots.push({
              startUTC,
              endUTC,
              localStart: formatForDisplay(startUTC, input.timezone),
              localEnd: formatForDisplay(endUTC, input.timezone),
            });
          }
        }
      }
    }

    slots.sort((a, b) => a.startUTC.getTime() - b.startUTC.getTime());
    return slots;
  }
}
