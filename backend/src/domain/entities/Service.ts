/**
 * @file Service.ts
 * @module domain/entities
 *
 * Service — primer modelo de dominio de MR (catálogo de servicios de
 * un tenant). Migración de F3.1 desde el Item genérico del starter.
 */

import genUUID from '../utils/genUUID';
import ServiceName from '../value-objects/ServiceName';
import BookingSettings from '../value-objects/BookingSettings';

const MAX_PRICE = 99999999.99;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_CATEGORY_LENGTH = 100;

export interface ServiceCreateInput {
  tenantId: string;
  name: ServiceName;
  description?: string | null;
  duration: number;
  price?: number | null;
  category?: string | null;
  id?: string;
  isActive?: boolean;
}

export interface ServiceUpdateData {
  name?: ServiceName;
  description?: string | null;
  duration?: number;
  price?: number | null;
  category?: string | null;
  isActive?: boolean;
}

export interface ServiceReconstituteFields {
  id: string;
  tenantId: string;
  name: ServiceName;
  description: string | null;
  duration: number;
  price: number | null;
  category: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function validateDuration(duration: number, settings: BookingSettings): void {
  if (!Number.isInteger(duration) || duration <= 0) {
    throw new Error('Service duration must be a positive integer of minutes');
  }
  if (duration < settings.slotDuration) {
    throw new Error(`Service duration must be at least ${settings.slotDuration} minutes`);
  }
  if (duration % settings.slotDuration !== 0) {
    throw new Error(`Service duration must be a multiple of ${settings.slotDuration} minutes`);
  }
  if (duration > settings.maxServiceDuration) {
    throw new Error(`Service duration cannot exceed ${settings.maxServiceDuration} minutes`);
  }
}

function validatePrice(price: number | null | undefined): void {
  if (price === null || price === undefined) return;
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    throw new Error('Service price must be a number');
  }
  if (price < 0) {
    throw new Error('Service price cannot be negative');
  }
  if (price > MAX_PRICE) {
    throw new Error('Service price cannot exceed 99999999.99');
  }
  if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) {
    throw new Error('Service price can have at most 2 decimal places');
  }
}

function validateDescription(description: string | null | undefined): void {
  if (description !== null && description !== undefined && description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Service description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`);
  }
}

function validateCategory(category: string | null | undefined): void {
  if (category !== null && category !== undefined && category.length > MAX_CATEGORY_LENGTH) {
    throw new Error(`Service category cannot exceed ${MAX_CATEGORY_LENGTH} characters`);
  }
}

export default class Service {
  private readonly _id: string;
  private readonly _tenantId: string;
  private readonly _name: ServiceName;
  private readonly _description: string | null;
  private readonly _duration: number;
  private readonly _price: number | null;
  private readonly _category: string | null;
  private readonly _isActive: boolean;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  private constructor(
    id: string,
    tenantId: string,
    name: ServiceName,
    description: string | null,
    duration: number,
    price: number | null,
    category: string | null,
    isActive: boolean,
    createdAt: Date,
    updatedAt: Date
  ) {
    this._id = id;
    this._tenantId = tenantId;
    this._name = name;
    this._description = description;
    this._duration = duration;
    this._price = price;
    this._category = category;
    this._isActive = isActive;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  /**
   * Crea un servicio validando duration contra los ajustes del tenant
   * (>= slotDuration, múltiplo de slotDuration, <= maxServiceDuration).
   */
  static create(input: ServiceCreateInput, settings: BookingSettings): Service {
    validateDuration(input.duration, settings);
    validatePrice(input.price);
    validateDescription(input.description);
    validateCategory(input.category);

    const now = new Date();
    return new Service(
      input.id || genUUID('svc'),
      input.tenantId,
      input.name,
      input.description ?? null,
      input.duration,
      input.price ?? null,
      input.category ?? null,
      input.isActive ?? true,
      now,
      now
    );
  }

  /**
   * Reconstruye un servicio desde la BD. Solo valida invariantes
   * duros (duration > 0, price): el múltiplo de slotDuration se
   * comprueba en create/withUpdates (los datos leídos son de su tenant).
   */
  static reconstitute(fields: ServiceReconstituteFields): Service {
    if (!Number.isInteger(fields.duration) || fields.duration <= 0) {
      throw new Error('Service duration must be a positive integer of minutes');
    }
    validatePrice(fields.price);
    validateDescription(fields.description);
    validateCategory(fields.category);
    return new Service(
      fields.id,
      fields.tenantId,
      fields.name,
      fields.description,
      fields.duration,
      fields.price,
      fields.category,
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

  get name(): ServiceName {
    return this._name;
  }

  get description(): string | null {
    return this._description;
  }

  get duration(): number {
    return this._duration;
  }

  get price(): number | null {
    return this._price;
  }

  get category(): string | null {
    return this._category;
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

  withUpdates(data: ServiceUpdateData, settings: BookingSettings): Service {
    if (data.duration !== undefined) {
      validateDuration(data.duration, settings);
    }
    validatePrice(data.price);
    validateDescription(data.description);
    validateCategory(data.category);
    return new Service(
      this._id,
      this._tenantId,
      data.name ?? this._name,
      data.description !== undefined ? data.description : this._description,
      data.duration ?? this._duration,
      data.price !== undefined ? data.price : this._price,
      data.category !== undefined ? data.category : this._category,
      data.isActive ?? this._isActive,
      this._createdAt,
      new Date()
    );
  }
}
