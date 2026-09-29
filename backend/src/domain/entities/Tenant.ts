/**
 * @file Tenant.ts
 * @module domain/entities
 *
 * Tenant — cliente del sistema, dueño de settings, schedules y
 * holidays (F3.4). La fila de BD ya existía desde F3.1 (`Tenant` en
 * schema.prisma); aquí nace su representación de dominio.
 *
 * Lectura (`reconstitute`): settings con `TenantSettings.from()`
 * tolerante (settings legados `{}` → defaults). Escritura
 * (`withConfig`): validación estricta de todo el payload del PUT
 * (F3.4 #10 — un solo guardado que valida perfil + ajustes +
 * horarios + festivos y regenera las RRules).
 */

import TenantSettings, { type TenantSettingsData } from '../value-objects/TenantSettings';
import ScheduleBlock from '../value-objects/ScheduleBlock';
import Holiday from '../value-objects/Holiday';

export const CURRENCIES = ['EUR', 'USD', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const MAX_NAME_LENGTH = 200;

/** Validación IANA de timezone (F3.4 #8). Acepta con espacios. */
export function isValidTimeZone(timezone: unknown): timezone is string {
  if (typeof timezone !== 'string') return false;
  const value = timezone.trim();
  if (value.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function normalizeName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Tenant name is required');
  }
  if (value.trim().length > MAX_NAME_LENGTH) {
    throw new Error(`Tenant name must be at most ${MAX_NAME_LENGTH} characters`);
  }
  return value.trim();
}

export function normalizeCurrency(value: unknown): Currency {
  if (typeof value !== 'string' || !(CURRENCIES as readonly string[]).includes(value)) {
    throw new Error('currency must be EUR, USD or GBP');
  }
  return value as Currency;
}

export function normalizeTimeZone(value: unknown): string {
  if (!isValidTimeZone(value)) {
    throw new Error('timezone must be a valid IANA time zone');
  }
  return value.trim();
}

export interface TenantReconstituteFields {
  id: string;
  name: string;
  slug: string | null;
  currency: string;
  timezone: string;
  settings: unknown;
  schedules: unknown;
  holidays: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantConfigInput {
  name: string;
  currency: string;
  timezone: string;
  settings: unknown;
  schedules: unknown;
  holidays: unknown;
}

export default class Tenant {
  private readonly _id: string;
  private readonly _name: string;
  private readonly _slug: string | null;
  private readonly _currency: Currency;
  private readonly _timezone: string;
  private readonly _settings: TenantSettings;
  private readonly _schedules: ScheduleBlock[];
  private readonly _holidays: Holiday[];
  private readonly _isActive: boolean;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  private constructor(
    id: string,
    name: string,
    slug: string | null,
    currency: Currency,
    timezone: string,
    settings: TenantSettings,
    schedules: ScheduleBlock[],
    holidays: Holiday[],
    isActive: boolean,
    createdAt: Date,
    updatedAt: Date
  ) {
    this._id = id;
    this._name = name;
    this._slug = slug;
    this._currency = currency;
    this._timezone = timezone;
    this._settings = settings;
    this._schedules = schedules;
    this._holidays = holidays;
    this._isActive = isActive;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  /**
   * Reconstrucción desde la fila. name/currency/timezone estrictos
   * (solo se escriben valores válidos); settings tolerante; schedules
   * y holidays validados (si la fila trae basura, GET falla → 500,
   * nunca datos corruptos silenciosos).
   */
  static reconstitute(fields: TenantReconstituteFields): Tenant {
    return new Tenant(
      fields.id,
      normalizeName(fields.name),
      fields.slug ?? null,
      normalizeCurrency(fields.currency),
      normalizeTimeZone(fields.timezone),
      TenantSettings.from(fields.settings),
      ScheduleBlock.parse(fields.schedules ?? []),
      Holiday.parse(fields.holidays ?? []),
      fields.isActive,
      fields.createdAt,
      fields.updatedAt
    );
  }

  /**
   * Actualización total del perfil (PUT /tenants/me, F3.4 #10).
   * Valida TODO estrictamente y devuelve una instancia nueva; las
   * RRules se regeneran dentro de ScheduleBlock.create/Holiday.create.
   * @throws {Error} con mensaje apto para 400.
   */
  withConfig(input: TenantConfigInput): Tenant {
    return new Tenant(
      this._id,
      normalizeName(input.name),
      this._slug,
      normalizeCurrency(input.currency),
      normalizeTimeZone(input.timezone),
      TenantSettings.create(input.settings),
      ScheduleBlock.parse(input.schedules),
      Holiday.parse(input.holidays),
      this._isActive,
      this._createdAt,
      new Date()
    );
  }

  get id(): string {
    return this._id;
  }

  get name(): string {
    return this._name;
  }

  get slug(): string | null {
    return this._slug;
  }

  get currency(): Currency {
    return this._currency;
  }

  get timezone(): string {
    return this._timezone;
  }

  get settings(): TenantSettings {
    return this._settings;
  }

  get schedules(): ScheduleBlock[] {
    return [...this._schedules];
  }

  get holidays(): Holiday[] {
    return [...this._holidays];
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  /** Payload listo para `ITenantRepository.save()` (JSON ya saneado). */
  toConfigRecord(): {
    name: string;
    currency: Currency;
    timezone: string;
    settings: TenantSettingsData;
    schedules: unknown[];
    holidays: unknown[];
  } {
    return {
      name: this._name,
      currency: this._currency,
      timezone: this._timezone,
      settings: this._settings.getValue(),
      schedules: this._schedules.map((block) => block.getValue()),
      holidays: this._holidays.map((holiday) => holiday.getValue()),
    };
  }
}
