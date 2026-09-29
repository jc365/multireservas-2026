/**
 * @file TenantSettings.ts
 * @module domain/value-objects
 *
 * Ajustes del tenant (F3.4 #4). Dos modos de construcción:
 * - `create()` — validación estricta (PUT /tenants/me): cualquier
 *   valor inválido lanza con mensaje de 400.
 * - `from()` — lectura tolerante (GET /tenants/me): campos ausentes o
 *   inválidos caen en los defaults para no tumbar una fila legada
 *   (settings = {} era el estado de los tenants hasta F3.4).
 *
 * Campos y defaults: slotDuration 15, maxServiceDuration 12×
 * slotDuration, clientDataRetention 'nextMonth' (F3.3.1),
 * defaultLanguage 'en' (sin usar hasta SF8), requireClientPhone true,
 * requireClientEmail false.
 */

export const SLOT_DURATIONS = [15, 30, 45, 60] as const;
export const DATA_RETENTIONS = ['nextDay', 'nextMonth', 'never'] as const;
export const DEFAULT_LANGUAGE = 'en';

export type DataRetention = (typeof DATA_RETENTIONS)[number];

export interface TenantSettingsData {
  slotDuration: number;
  maxServiceDuration: number;
  clientDataRetention: DataRetention;
  defaultLanguage: string;
  requireClientPhone: boolean;
  requireClientEmail: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function defaultSettings(): TenantSettingsData {
  return {
    slotDuration: 15,
    maxServiceDuration: 15 * 12,
    clientDataRetention: 'nextMonth',
    defaultLanguage: DEFAULT_LANGUAGE,
    requireClientPhone: true,
    requireClientEmail: false,
  };
}

export default class TenantSettings {
  private readonly _slotDuration: number;
  private readonly _maxServiceDuration: number;
  private readonly _clientDataRetention: DataRetention;
  private readonly _defaultLanguage: string;
  private readonly _requireClientPhone: boolean;
  private readonly _requireClientEmail: boolean;

  private constructor(data: TenantSettingsData) {
    this._slotDuration = data.slotDuration;
    this._maxServiceDuration = data.maxServiceDuration;
    this._clientDataRetention = data.clientDataRetention;
    this._defaultLanguage = data.defaultLanguage;
    this._requireClientPhone = data.requireClientPhone;
    this._requireClientEmail = data.requireClientEmail;
  }

  /**
   * Construcción estricta (PUT). Valida cada campo según las reglas
   * de F3.4 #11; los ausentes toman su default.
   * @throws {Error} con mensaje apto para respuesta 400.
   */
  static create(input: unknown): TenantSettings {
    if (!isObject(input)) {
      throw new Error('settings must be an object');
    }

    const slotDuration =
      input.slotDuration === undefined ? 15 : input.slotDuration;
    if (
      typeof slotDuration !== 'number' ||
      !(SLOT_DURATIONS as readonly number[]).includes(slotDuration)
    ) {
      throw new Error('slotDuration must be one of 15, 30, 45 or 60');
    }

    const maxServiceDuration =
      input.maxServiceDuration === undefined
        ? slotDuration * 12
        : input.maxServiceDuration;
    if (
      typeof maxServiceDuration !== 'number' ||
      !Number.isInteger(maxServiceDuration) ||
      maxServiceDuration < slotDuration ||
      maxServiceDuration % slotDuration !== 0
    ) {
      throw new Error(
        'maxServiceDuration must be a multiple of slotDuration greater than or equal to it'
      );
    }

    const retention =
      input.clientDataRetention === undefined
        ? 'nextMonth'
        : input.clientDataRetention;
    if (
      typeof retention !== 'string' ||
      !(DATA_RETENTIONS as readonly string[]).includes(retention)
    ) {
      throw new Error('clientDataRetention must be nextDay, nextMonth or never');
    }

    const defaultLanguage =
      input.defaultLanguage === undefined ? DEFAULT_LANGUAGE : input.defaultLanguage;
    if (typeof defaultLanguage !== 'string' || defaultLanguage.trim().length === 0) {
      throw new Error('defaultLanguage must be a non-empty string');
    }

    const requireClientPhone =
      input.requireClientPhone === undefined ? true : input.requireClientPhone;
    if (typeof requireClientPhone !== 'boolean') {
      throw new Error('requireClientPhone must be a boolean');
    }

    const requireClientEmail =
      input.requireClientEmail === undefined ? false : input.requireClientEmail;
    if (typeof requireClientEmail !== 'boolean') {
      throw new Error('requireClientEmail must be a boolean');
    }

    return new TenantSettings({
      slotDuration,
      maxServiceDuration,
      clientDataRetention: retention as DataRetention,
      defaultLanguage: defaultLanguage.trim(),
      requireClientPhone,
      requireClientEmail,
    });
  }

  /**
   * Construcción tolerante (GET/reconstitute): cada campo inválido o
   * ausente cae en su default en lugar de lanzar.
   */
  static from(raw: unknown): TenantSettings {
    if (!isObject(raw)) return new TenantSettings(defaultSettings());

    const candidate: Record<string, unknown> = {};
    const keepIf = (key: keyof TenantSettingsData, ok: boolean, value: unknown) => {
      if (ok) candidate[key] = value;
    };

    keepIf(
      'slotDuration',
      typeof raw.slotDuration === 'number' &&
        (SLOT_DURATIONS as readonly number[]).includes(raw.slotDuration),
      raw.slotDuration
    );
    const slot =
      typeof candidate.slotDuration === 'number' ? candidate.slotDuration : 15;
    keepIf(
      'maxServiceDuration',
      typeof raw.maxServiceDuration === 'number' &&
        Number.isInteger(raw.maxServiceDuration) &&
        raw.maxServiceDuration >= slot &&
        raw.maxServiceDuration % slot === 0,
      raw.maxServiceDuration
    );
    keepIf(
      'clientDataRetention',
      typeof raw.clientDataRetention === 'string' &&
        (DATA_RETENTIONS as readonly string[]).includes(raw.clientDataRetention),
      raw.clientDataRetention
    );
    keepIf(
      'defaultLanguage',
      typeof raw.defaultLanguage === 'string' && raw.defaultLanguage.trim().length > 0,
      raw.defaultLanguage
    );
    keepIf(
      'requireClientPhone',
      typeof raw.requireClientPhone === 'boolean',
      raw.requireClientPhone
    );
    keepIf(
      'requireClientEmail',
      typeof raw.requireClientEmail === 'boolean',
      raw.requireClientEmail
    );

    return TenantSettings.create(candidate);
  }

  get slotDuration(): number {
    return this._slotDuration;
  }

  get maxServiceDuration(): number {
    return this._maxServiceDuration;
  }

  get clientDataRetention(): DataRetention {
    return this._clientDataRetention;
  }

  get defaultLanguage(): string {
    return this._defaultLanguage;
  }

  get requireClientPhone(): boolean {
    return this._requireClientPhone;
  }

  get requireClientEmail(): boolean {
    return this._requireClientEmail;
  }

  getValue(): TenantSettingsData {
    return {
      slotDuration: this._slotDuration,
      maxServiceDuration: this._maxServiceDuration,
      clientDataRetention: this._clientDataRetention,
      defaultLanguage: this._defaultLanguage,
      requireClientPhone: this._requireClientPhone,
      requireClientEmail: this._requireClientEmail,
    };
  }

  equals(other: TenantSettings): boolean {
    return JSON.stringify(this.getValue()) === JSON.stringify(other.getValue());
  }
}
