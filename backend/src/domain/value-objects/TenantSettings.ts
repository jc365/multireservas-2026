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
 * requireClientEmail false. F4.1a añade: advanceBookingLimit 30
 * (días máximos de anticipación, editable por owner),
 * availabilityBatchSize 10 (tanda del motor de disponibilidad,
 * NO editable por owner — se filtra en UpdateTenantConfigUseCase),
 * allowCustomerAssignment true (F5).
 *
 * F4.4a añade la clave de sistema `email_verification`
 * ({ token, expiresAt }): su PRESENCIA = tenant no verificado. NO es
 * editable por owner/admin (se filtra en UpdateTenantConfigUseCase y
 * UpdateTenantUseCase con `preserveEmailVerification`); solo la
 * escriben register/verify/resend. La ausencia = verificado.
 * `getValue()` la incluye solo cuando existe; el serializer de rutas
 * la elimina de la respuesta y expone `settings.emailVerified`.
 */

export const SLOT_DURATIONS = [15, 30, 45, 60] as const;
export const DATA_RETENTIONS = ['nextDay', 'nextMonth', 'never'] as const;
export const DEFAULT_LANGUAGE = 'en';
export const MAX_ADVANCE_BOOKING_LIMIT = 365;
export const MAX_AVAILABILITY_BATCH_SIZE = 50;

export type DataRetention = (typeof DATA_RETENTIONS)[number];

/** Estado de verificación de email pendiente (F4.4a). */
export interface EmailVerificationData {
  token: string;
  expiresAt: string;
}

export interface TenantSettingsData {
  slotDuration: number;
  maxServiceDuration: number;
  clientDataRetention: DataRetention;
  defaultLanguage: string;
  requireClientPhone: boolean;
  requireClientEmail: boolean;
  advanceBookingLimit: number;
  availabilityBatchSize: number;
  allowCustomerAssignment: boolean;
  email_verification?: EmailVerificationData;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Valida una clave `email_verification` (token no vacío + expiresAt parseable). */
export function isValidEmailVerification(
  value: unknown
): value is EmailVerificationData {
  return (
    isObject(value) &&
    typeof value.token === 'string' &&
    value.token.trim().length > 0 &&
    typeof value.expiresAt === 'string' &&
    !Number.isNaN(Date.parse(value.expiresAt))
  );
}

/**
 * Filtra el input de un PUT para que la clave de sistema
 * `email_verification` SOLO pueda provenir del valor almacenado
 * (nunca del payload). Si no hay valor previo válido, la elimina.
 * Devuelve el input tal cual cuando no es un objeto.
 */
export function preserveEmailVerification(
  input: unknown,
  previous: unknown
): unknown {
  if (!isObject(input)) return input;
  const filtered: Record<string, unknown> = { ...input };
  const previousValue = isObject(previous) ? previous.email_verification : undefined;
  if (isValidEmailVerification(previousValue)) {
    filtered.email_verification = previousValue;
  } else {
    delete filtered.email_verification;
  }
  return filtered;
}

function defaultSettings(): TenantSettingsData {
  return {
    slotDuration: 15,
    maxServiceDuration: 15 * 12,
    clientDataRetention: 'nextMonth',
    defaultLanguage: DEFAULT_LANGUAGE,
    requireClientPhone: true,
    requireClientEmail: false,
    advanceBookingLimit: 30,
    availabilityBatchSize: 10,
    allowCustomerAssignment: true,
  };
}

export default class TenantSettings {
  private readonly _slotDuration: number;
  private readonly _maxServiceDuration: number;
  private readonly _clientDataRetention: DataRetention;
  private readonly _defaultLanguage: string;
  private readonly _requireClientPhone: boolean;
  private readonly _requireClientEmail: boolean;
  private readonly _advanceBookingLimit: number;
  private readonly _availabilityBatchSize: number;
  private readonly _allowCustomerAssignment: boolean;
  private readonly _emailVerification?: EmailVerificationData;

  private constructor(data: TenantSettingsData) {
    this._slotDuration = data.slotDuration;
    this._maxServiceDuration = data.maxServiceDuration;
    this._clientDataRetention = data.clientDataRetention;
    this._defaultLanguage = data.defaultLanguage;
    this._requireClientPhone = data.requireClientPhone;
    this._requireClientEmail = data.requireClientEmail;
    this._advanceBookingLimit = data.advanceBookingLimit;
    this._availabilityBatchSize = data.availabilityBatchSize;
    this._allowCustomerAssignment = data.allowCustomerAssignment;
    this._emailVerification = data.email_verification;
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

    const advanceBookingLimit =
      input.advanceBookingLimit === undefined ? 30 : input.advanceBookingLimit;
    if (
      typeof advanceBookingLimit !== 'number' ||
      !Number.isInteger(advanceBookingLimit) ||
      advanceBookingLimit < 1 ||
      advanceBookingLimit > MAX_ADVANCE_BOOKING_LIMIT
    ) {
      throw new Error(
        `advanceBookingLimit must be an integer between 1 and ${MAX_ADVANCE_BOOKING_LIMIT}`
      );
    }

    const availabilityBatchSize =
      input.availabilityBatchSize === undefined ? 10 : input.availabilityBatchSize;
    if (
      typeof availabilityBatchSize !== 'number' ||
      !Number.isInteger(availabilityBatchSize) ||
      availabilityBatchSize < 1 ||
      availabilityBatchSize > MAX_AVAILABILITY_BATCH_SIZE
    ) {
      throw new Error(
        `availabilityBatchSize must be an integer between 1 and ${MAX_AVAILABILITY_BATCH_SIZE}`
      );
    }

    const allowCustomerAssignment =
      input.allowCustomerAssignment === undefined
        ? true
        : input.allowCustomerAssignment;
    if (typeof allowCustomerAssignment !== 'boolean') {
      throw new Error('allowCustomerAssignment must be a boolean');
    }

    // Clave de sistema F4.4a: ausente/null = verificado; presente
    // tiene que ser válida (el filtro de PUT nunca la inyecta).
    let emailVerification: EmailVerificationData | undefined;
    if (input.email_verification !== undefined && input.email_verification !== null) {
      if (!isValidEmailVerification(input.email_verification)) {
        throw new Error('email_verification must be an object with token and expiresAt');
      }
      emailVerification = input.email_verification;
    }

    return new TenantSettings({
      slotDuration,
      maxServiceDuration,
      clientDataRetention: retention as DataRetention,
      defaultLanguage: defaultLanguage.trim(),
      requireClientPhone,
      requireClientEmail,
      advanceBookingLimit,
      availabilityBatchSize,
      allowCustomerAssignment,
      email_verification: emailVerification,
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
    keepIf(
      'advanceBookingLimit',
      typeof raw.advanceBookingLimit === 'number' &&
        Number.isInteger(raw.advanceBookingLimit) &&
        raw.advanceBookingLimit >= 1 &&
        raw.advanceBookingLimit <= MAX_ADVANCE_BOOKING_LIMIT,
      raw.advanceBookingLimit
    );
    keepIf(
      'availabilityBatchSize',
      typeof raw.availabilityBatchSize === 'number' &&
        Number.isInteger(raw.availabilityBatchSize) &&
        raw.availabilityBatchSize >= 1 &&
        raw.availabilityBatchSize <= MAX_AVAILABILITY_BATCH_SIZE,
      raw.availabilityBatchSize
    );
    keepIf(
      'allowCustomerAssignment',
      typeof raw.allowCustomerAssignment === 'boolean',
      raw.allowCustomerAssignment
    );
    keepIf('email_verification', isValidEmailVerification(raw.email_verification), raw.email_verification);

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

  get advanceBookingLimit(): number {
    return this._advanceBookingLimit;
  }

  get availabilityBatchSize(): number {
    return this._availabilityBatchSize;
  }

  get allowCustomerAssignment(): boolean {
    return this._allowCustomerAssignment;
  }

  /** Estado de verificación pendiente (F4.4a); ausente = verificado. */
  get emailVerification(): EmailVerificationData | undefined {
    return this._emailVerification;
  }

  getValue(): TenantSettingsData {
    const data: TenantSettingsData = {
      slotDuration: this._slotDuration,
      maxServiceDuration: this._maxServiceDuration,
      clientDataRetention: this._clientDataRetention,
      defaultLanguage: this._defaultLanguage,
      requireClientPhone: this._requireClientPhone,
      requireClientEmail: this._requireClientEmail,
      advanceBookingLimit: this._advanceBookingLimit,
      availabilityBatchSize: this._availabilityBatchSize,
      allowCustomerAssignment: this._allowCustomerAssignment,
    };
    if (this._emailVerification) {
      data.email_verification = this._emailVerification;
    }
    return data;
  }

  equals(other: TenantSettings): boolean {
    return JSON.stringify(this.getValue()) === JSON.stringify(other.getValue());
  }
}
