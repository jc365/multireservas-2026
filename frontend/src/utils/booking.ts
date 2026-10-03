/**
 * @file booking.ts
 * @module utils
 *
 * Constantes y helpers de reserva para el frontend (F3.1).
 *
 * Réplica de los defaults del backend (BookingSettings: DEFAULT_SLOT_DURATION
 * y maxServiceDuration = 12 × slot). El servidor sigue siendo
 * autoritativo y puede rechazar duraciones si el tenant usa otros valores.
 *
 * F4.4c: helpers de "sin preferencia" — `showEmployeePicker` decide si
 * el select de empleado se muestra y `reservationEmployeeId` qué valor
 * se envía al backend.
 *
 * F4.5d (multi-servicio seguido): `sumServiceDurations` /
 * `sumServicePrices` calculan los derivados del bloque, 
 * `serviceIdsParam` arma el query param de disponibilidad (siempre,
 * incluso con 1 servicio) y `reservationSummary` / `groupCancelText`
 * generan el resumen visible y el aviso de cancelación de grupo.
 *
 * F4.6a: `formatPrice` se mudó a `i18n/format.ts` (parametrizado por
 * locale, decisión F0 #6) y aquí solo se re-exporta para no romper a
 * las páginas que lo importan de `utils/booking`.
 *
 * F4.6c: `reservationSummary` y `groupCancelText` reciben `t` como
 * último argumento (antes generaban texto hardcodeado). El llamante
 * aporta la `t` de `useI18n()`.
 */

import { formatPrice } from '../i18n/format';

export { formatPrice };

/** Contrato mínimo de `t()` que aceptan los helpers de booking. */
export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export const SLOT_DURATION = 15;
export const MAX_SERVICE_DURATION = SLOT_DURATION * 12;

/** Opciones de duration para selects: de slot a max, paso slot. */
export function serviceDurationOptions(): number[] {
  const options: number[] = [];
  for (let d = SLOT_DURATION; d <= MAX_SERVICE_DURATION; d += SLOT_DURATION) {
    options.push(d);
  }
  return options;
}

/**
 * Día calendario (YYYY-MM-DD) de un instante ISO en la tz dada (F4.1b).
 * Usa Intl con locale 'en-CA' (emite ISO) — sin dependencias.
 * Si la tz es inválida o vacía, cae al día UTC del propio ISO.
 */
export function tenantDateKey(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * F4.4c — ¿se muestra el selector de empleado?
 * `allowCustomerAssignment` (tenant.settings) es true por defecto:
 * el picker aparece con "Sin preferencia" como primera opción.
 * Si el tenant lo desactiva, el picker NO se muestra y la reserva es
 * siempre "sin preferencia" (la asignación es del sistema).
 */
export function showEmployeePicker(allowCustomerAssignment: boolean | undefined): boolean {
  return allowCustomerAssignment !== false;
}

/**
 * F4.4c — valor de `employeeId` para POST /reservations. Vacío o en
 * blanco ("sin preferencia") → undefined, para que el backend asigne
 * el empleado según disponibilidad.
 */
export function reservationEmployeeId(employeeId: string | null | undefined): string | undefined {
  const trimmed = (employeeId ?? '').trim();
  return trimmed ? trimmed : undefined;
}

/**
 * F4.5d — suma de durations de los servicios seleccionados (ancho del
 * bloque que se pedirá a GET /availability).
 */
export function sumServiceDurations(services: ReadonlyArray<{ duration: number }>): number {
  return services.reduce((sum, service) => sum + service.duration, 0);
}

/**
 * F4.5d — suma de prices de los servicios seleccionados (`null`
 * cuenta como 0, igual que el total del grupo del backend).
 */
export function sumServicePrices(services: ReadonlyArray<{ price: number | null }>): number {
  return services.reduce((sum, service) => sum + (service.price ?? 0), 0);
}

/**
 * F4.5d — ids seleccionados → query param `serviceIds` (CSV, en el
 * orden de la selección). Siempre se envía, incluso con 1 servicio:
 * el backend es excluyente con `duration`, así que este parámetro
 * sustituye a `duration` en todos los casos.
 */
export function serviceIdsParam(serviceIds: readonly string[]): string {
  return serviceIds.join(',');
}

/**
 * F4.5d — resumen visible del bloque: "2 services · 75 min · 108,50 €".
 *
 * @param count número de servicios seleccionados
 * @param durationMinutes suma de duraciones
 * @param totalPrice suma de precios (formato `formatPrice`)
 * @param t traductor de `useI18n()` (F4.6c)
 */
export function reservationSummary(
  count: number,
  durationMinutes: number,
  totalPrice: number,
  t: TranslateFn
): string {
  const key = count === 1 ? 'reservations.summary.one' : 'reservations.summary.many';
  return t(key, { count, duration: durationMinutes, price: formatPrice(totalPrice) });
}

/**
 * F4.5d — texto de cancelación cuando la reserva pertenece a un
 * grupo. `count` es el número de filas del grupo que se han podido
 * contar (null si no se pudo consultar el listado).
 *
 * @param t traductor de `useI18n()` (F4.6c)
 */
export function groupCancelText(count: number | null, t: TranslateFn): string {
  if (count === null || count < 2) {
    return t('reservations.groupCancel.every');
  }
  return t('reservations.groupCancel.all', { count });
}
