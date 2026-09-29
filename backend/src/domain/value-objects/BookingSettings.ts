/**
 * @file BookingSettings.ts
 * @module domain/value-objects
 *
 * Ajustes de reserva derivados de Tenant.settings:
 * - slotDuration: granularidad en minutos (default DEFAULT_SLOT_DURATION)
 * - maxServiceDuration: duración máxima de un servicio en minutos
 *   (default 12 × slotDuration si no está configurado)
 *
 * F3.1: hoy ningún tenant los tiene configurados (settings = {}), se
 * usan los defaults. Editables por admin en F5/SF6 (ver docu/FINDINGS.md).
 */

export const DEFAULT_SLOT_DURATION = 15;
export const MAX_SERVICE_DURATION_FACTOR = 12;

export default class BookingSettings {
  private readonly _slotDuration: number;
  private readonly _maxServiceDuration: number;

  private constructor(slotDuration: number, maxServiceDuration: number) {
    this._slotDuration = slotDuration;
    this._maxServiceDuration = maxServiceDuration;
  }

  /**
   * Deriva los ajustes de reserva desde el JSON de Tenant.settings.
   * Valores ausentes o inválidos caen en los defaults.
   */
  static fromTenantSettings_OLD(settings: unknown): BookingSettings {
    let slotDuration = DEFAULT_SLOT_DURATION;

    if (settings !== null && typeof settings === 'object' && !Array.isArray(settings)) {
      const rawSlot = (settings as Record<string, unknown>).slotDuration;
      if (typeof rawSlot === 'number' && Number.isInteger(rawSlot) && rawSlot > 0) {
        slotDuration = rawSlot;
      }
    }

    let maxServiceDuration = slotDuration * MAX_SERVICE_DURATION_FACTOR;

    if (settings !== null && typeof settings === 'object' && !Array.isArray(settings)) {
      const rawMax = (settings as Record<string, unknown>).maxServiceDuration;
      if (
        typeof rawMax === 'number' &&
        Number.isInteger(rawMax) &&
        rawMax >= slotDuration
      ) {
        maxServiceDuration = rawMax;
      }
    }

    return new BookingSettings(slotDuration, maxServiceDuration);
  }

  static fromTenantSettings(settings: unknown): BookingSettings {
    let slotDuration = DEFAULT_SLOT_DURATION;
    let maxServiceDuration: number;

    const isObject = settings !== null && typeof settings === 'object' && !Array.isArray(settings);
    const s = isObject ? (settings as Record<string, unknown>) : {};

    // slotDuration
    if (typeof s.slotDuration === 'number' && Number.isInteger(s.slotDuration) && s.slotDuration > 0) {
      slotDuration = s.slotDuration;
    }

    // maxServiceDuration (depende de slotDuration ya resuelto)
    if (
      typeof s.maxServiceDuration === 'number' &&
      Number.isInteger(s.maxServiceDuration) &&
      s.maxServiceDuration >= slotDuration
    ) {
      maxServiceDuration = s.maxServiceDuration;
    } else {
      maxServiceDuration = slotDuration * MAX_SERVICE_DURATION_FACTOR;
    }

    return new BookingSettings(slotDuration, maxServiceDuration);
  }

  get slotDuration(): number {
    return this._slotDuration;
  }

  get maxServiceDuration(): number {
    return this._maxServiceDuration;
  }
}
