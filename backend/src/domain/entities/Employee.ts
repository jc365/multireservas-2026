/**
 * @file Employee.ts
 * @module domain/entities
 *
 * Employee — empleado de un tenant (miembro del equipo que ofrece
 * servicios). M2M con Service (`serviceIds`) activo solo cuando
 * `offersAllServices` es false. Soft delete vía `isActive` (F3.2).
 */

import genUUID from '../utils/genUUID';
import EmployeeName from '../value-objects/EmployeeName';
import Email from '../value-objects/Email';

const MAX_PHONE_LENGTH = 50;

export interface EmployeeCreateInput {
  tenantId: string;
  name: EmployeeName;
  email?: string | null;
  phone?: string | null;
  offersAllServices?: boolean;
  serviceIds?: string[];
  customSchedule?: Record<string, unknown> | null;
  customHolidays?: Record<string, unknown> | null;
  userId?: string | null;
  id?: string;
  isActive?: boolean;
}

export interface EmployeeUpdateData {
  name?: EmployeeName;
  email?: string | null;
  phone?: string | null;
  offersAllServices?: boolean;
  serviceIds?: string[];
  customSchedule?: Record<string, unknown> | null;
  customHolidays?: Record<string, unknown> | null;
  userId?: string | null;
  isActive?: boolean;
}

export interface EmployeeReconstituteFields {
  id: string;
  tenantId: string;
  userId: string | null;
  name: EmployeeName;
  email: string | null;
  phone: string | null;
  offersAllServices: boolean;
  serviceIds: string[];
  customSchedule: Record<string, unknown> | null;
  customHolidays: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function validateEmail(email: string | null | undefined): string | null {
  if (email === null || email === undefined) return null;
  const trimmed = email.trim();
  if (trimmed.length === 0) return null;
  if (!Email.isValid(trimmed)) {
    throw new Error(`Employee email must be a valid email: "${email}"`);
  }
  return trimmed;
}

function validatePhone(phone: string | null | undefined): string | null {
  if (phone === null || phone === undefined) return null;
  const trimmed = phone.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_PHONE_LENGTH) {
    throw new Error(`Employee phone cannot exceed ${MAX_PHONE_LENGTH} characters`);
  }
  return trimmed;
}

/**
 * F3.2: JSON simple — solo se valida que sea un objeto plano.
 * La validación completa (subconjunto del tenant) llega en F3.5.
 */
function validateJsonObject(value: unknown, field: string): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Employee ${field} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

/**
 * Normaliza la lista: trim, descarta vacíos y duplicados.
 * @throws {Error} si algún elemento no es un string no vacío.
 */
function normalizeServiceIds(serviceIds: string[] | undefined): string[] {
  if (!serviceIds) return [];
  if (!Array.isArray(serviceIds)) {
    throw new Error('Employee serviceIds must be an array of service ids');
  }
  const normalized: string[] = [];
  for (const raw of serviceIds) {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new Error('Employee serviceIds must be an array of service ids');
    }
    const id = raw.trim();
    if (!normalized.includes(id)) normalized.push(id);
  }
  return normalized;
}

export default class Employee {
  private readonly _id: string;
  private readonly _tenantId: string;
  private readonly _userId: string | null;
  private readonly _name: EmployeeName;
  private readonly _email: string | null;
  private readonly _phone: string | null;
  private readonly _offersAllServices: boolean;
  private readonly _serviceIds: string[];
  private readonly _customSchedule: Record<string, unknown> | null;
  private readonly _customHolidays: Record<string, unknown> | null;
  private readonly _isActive: boolean;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  private constructor(
    id: string,
    tenantId: string,
    userId: string | null,
    name: EmployeeName,
    email: string | null,
    phone: string | null,
    offersAllServices: boolean,
    serviceIds: string[],
    customSchedule: Record<string, unknown> | null,
    customHolidays: Record<string, unknown> | null,
    isActive: boolean,
    createdAt: Date,
    updatedAt: Date
  ) {
    this._id = id;
    this._tenantId = tenantId;
    this._userId = userId;
    this._name = name;
    this._email = email;
    this._phone = phone;
    this._offersAllServices = offersAllServices;
    this._serviceIds = serviceIds;
    this._customSchedule = customSchedule;
    this._customHolidays = customHolidays;
    this._isActive = isActive;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  /**
   * Crea un empleado validando sus campos. Si `offersAllServices` es
   * true (default), la M2M se limpia: `serviceIds` queda vacío.
   */
  static create(input: EmployeeCreateInput): Employee {
    const email = validateEmail(input.email);
    const phone = validatePhone(input.phone);
    const customSchedule = validateJsonObject(input.customSchedule, 'customSchedule');
    const customHolidays = validateJsonObject(input.customHolidays, 'customHolidays');

    const offersAllServices = input.offersAllServices ?? true;
    let serviceIds = normalizeServiceIds(input.serviceIds);
    if (offersAllServices) {
      serviceIds = [];
    }

    const now = new Date();
    return new Employee(
      input.id || genUUID('emp'),
      input.tenantId,
      input.userId ?? null,
      input.name,
      email,
      phone,
      offersAllServices,
      serviceIds,
      customSchedule,
      customHolidays,
      input.isActive ?? true,
      now,
      now
    );
  }

  /**
   * Reconstruye un empleado desde la BD. Solo valida campos escalares
   * (email/phone); el JSON se lee tal cual (se validó al escribir).
   */
  static reconstitute(fields: EmployeeReconstituteFields): Employee {
    const email = validateEmail(fields.email);
    const phone = validatePhone(fields.phone);
    return new Employee(
      fields.id,
      fields.tenantId,
      fields.userId,
      fields.name,
      email,
      phone,
      fields.offersAllServices,
      [...fields.serviceIds],
      fields.customSchedule,
      fields.customHolidays,
      fields.isActive,
      fields.createdAt,
      fields.updatedAt
    );
  }

  get id(): string {
    return this._id;
  }

  get tenantId(): string {
    return this._tenantId;
  }

  get userId(): string | null {
    return this._userId;
  }

  get name(): EmployeeName {
    return this._name;
  }

  get email(): string | null {
    return this._email;
  }

  get phone(): string | null {
    return this._phone;
  }

  get offersAllServices(): boolean {
    return this._offersAllServices;
  }

  get serviceIds(): string[] {
    return [...this._serviceIds];
  }

  get customSchedule(): Record<string, unknown> | null {
    return this._customSchedule;
  }

  get customHolidays(): Record<string, unknown> | null {
    return this._customHolidays;
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

  withUpdates(data: EmployeeUpdateData): Employee {
    const email = data.email !== undefined ? validateEmail(data.email) : this._email;
    const phone = data.phone !== undefined ? validatePhone(data.phone) : this._phone;
    const customSchedule =
      data.customSchedule !== undefined
        ? validateJsonObject(data.customSchedule, 'customSchedule')
        : this._customSchedule;
    const customHolidays =
      data.customHolidays !== undefined
        ? validateJsonObject(data.customHolidays, 'customHolidays')
        : this._customHolidays;

    // Decisión F3.2: al pasar a offersAllServices = true se limpia la M2M.
    const offersAllServices = data.offersAllServices ?? this._offersAllServices;
    let serviceIds: string[];
    if (offersAllServices) {
      serviceIds = [];
    } else if (data.serviceIds !== undefined) {
      serviceIds = normalizeServiceIds(data.serviceIds);
    } else {
      serviceIds = [...this._serviceIds];
    }

    return new Employee(
      this._id,
      this._tenantId,
      data.userId !== undefined ? data.userId : this._userId,
      data.name ?? this._name,
      email,
      phone,
      offersAllServices,
      serviceIds,
      customSchedule,
      customHolidays,
      data.isActive ?? this._isActive,
      this._createdAt,
      new Date()
    );
  }
}
