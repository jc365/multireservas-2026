/**
 * @file booking.ts
 * @module utils
 *
 * Constantes de reserva para el frontend (F3.1).
 *
 * Réplica de los defaults del backend (BookingSettings: DEFAULT_SLOT_DURATION
 * y maxServiceDuration = 12 × slot). El frontend no tiene endpoint de
 * Tenant.settings todavía (llega en F5/SF6): el servidor sigue siendo
 * autoritativo y puede rechazar duraciones si el tenant usa otros valores.
 */

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

/** Formatea un price (o '—' si es null) con la moneda por defecto (EUR). */
export function formatPrice(price: number | null): string {
  if (price === null) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(price);
}
