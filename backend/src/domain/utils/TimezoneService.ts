/**
 * @file TimezoneService.ts
 * @module domain/utils
 *
 * Conversiones hora local del tenant ↔ UTC (F4.1a) usando exclusivamente
 * `Intl.DateTimeFormat` nativo — el proyecto no tiene librería de fechas
 * y no se añade una. El offset de una zona IANA para un instante se
 * obtiene "formateando el instante en la zona y reinterpretándolo como
 * UTC" (mismo truco que usan date-fns-tz / luxon); convirtiendo dos
 * veces se resuelve el cambio de hora (DST): la primera pasada da el
 * offset de un instante candidato, la segunda lo confirma.
 *
 * Límite conocido: en el "repetido" del fall-back (una hora local ocurre
 * dos veces) el resultado es uno de los dos instantes válidos; en el
 * "salto" del spring-forward una hora local inexistente se desplaza al
 * instante resolvente. Ninguno de los dos casos afecta a bloques de
 * horario laboral (transiciones típicas 02:00-03:00).
 */

const MINUTE_MS = 60_000;

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function wallParts(timeZone: string, utcMs: number): Record<string, number> {
  const parts = getFormatter(timeZone).formatToParts(new Date(utcMs));
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  }
  return values;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * ¿Es una zona IANA válida para Intl?
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== 'string' || timeZone.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Offset de la zona (ms) respecto a UTC para el instante dado:
 * positivo al este (Europe/Madrid → +3_600_000 en invierno).
 */
export function getTimeZoneOffsetMs(timeZone: string, utcMs: number): number {
  const wholeSeconds = Math.floor(utcMs / 1000) * 1000;
  const values = wallParts(timeZone, wholeSeconds);
  const asUTC = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  );
  return asUTC - wholeSeconds;
}

/**
 * Hora local sin offset → instante UTC.
 * `local` es `YYYY-MM-DDTHH:MM[:SS]` en la zona pedida (sin 'Z' ni
 * offset: eso indicaría otra cosa y se rechaza).
 * @throws {Error} si el formato no es válido.
 */
export function convertToUTC(local: string, timeZone: string): Date {
  const match = LOCAL_PATTERN.exec(local);
  if (!match) {
    throw new Error(`invalid local datetime: ${local}`);
  }
  const [, year, month, day, hour, minute, second] = match;
  const wall = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? '0')
  );
  const firstOffset = getTimeZoneOffsetMs(timeZone, wall);
  const guess = wall - firstOffset;
  const finalOffset = getTimeZoneOffsetMs(timeZone, guess);
  return new Date(wall - finalOffset);
}

/**
 * Instante UTC → hora local `YYYY-MM-DDTHH:MM` en la zona pedida.
 */
export function convertFromUTC(utc: Date, timeZone: string): string {
  const values = wallParts(timeZone, utc.getTime());
  return (
    `${values.year}-${pad(values.month)}-${pad(values.day)}` +
    `T${pad(values.hour)}:${pad(values.minute)}`
  );
}

/**
 * Instante UTC → `HH:MM` local (formato de los slots de disponibilidad).
 */
export function formatForDisplay(utc: Date, timeZone: string): string {
  const values = wallParts(timeZone, utc.getTime());
  return `${pad(values.hour)}:${pad(values.minute)}`;
}

/**
 * Día calendario local (`YYYY-MM-DD`) de un instante UTC en la zona.
 */
export function localDateString(utc: Date, timeZone: string): string {
  const values = wallParts(timeZone, utc.getTime());
  return `${values.year}-${pad(values.month)}-${pad(values.day)}`;
}

/**
 * Divide [startUTC, endUTC) en trozos consecutivos de `slotMinutes`
 * minutos. El último troce no sobrepasa `endUTC`.
 * @throws {Error} si `slotMinutes` no es un entero positivo.
 */
export function generateTimeSlots(
  startUTC: Date,
  endUTC: Date,
  slotMinutes: number
): { start: Date; end: Date }[] {
  if (!Number.isInteger(slotMinutes) || slotMinutes <= 0) {
    throw new Error('slotMinutes must be a positive integer');
  }
  const slotMs = slotMinutes * MINUTE_MS;
  const slots: { start: Date; end: Date }[] = [];
  const endMs = endUTC.getTime();
  for (let cursor = startUTC.getTime(); cursor + slotMs <= endMs; cursor += slotMs) {
    slots.push({ start: new Date(cursor), end: new Date(cursor + slotMs) });
  }
  return slots;
}
