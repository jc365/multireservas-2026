/**
 * @file Client.ts
 * @module domain/entities
 *
 * Client — cliente interno de un tenant (F3.3). No tiene CRUD
 * expuesto: se crea/reutiliza automáticamente al crear una reserva
 * (FindOrCreateClientUseCase). `dataExpiresAt` lo calcula el use case
 * según Tenant.settings.clientDataRetention.
 */

import genUUID from '../utils/genUUID';
import Email from '../value-objects/Email';

const MAX_NAME_LENGTH = 100;
const MAX_PHONE_LENGTH = 50;
const MAX_NOTES_LENGTH = 1000;

export interface ClientCreateInput {
  tenantId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  userId?: string | null;
  dataExpiresAt?: Date | null;
  id?: string;
}

export interface ClientReconstituteFields {
  id: string;
  tenantId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  notes: string | null;
  dataExpiresAt: Date | null;
  visitCount: number;
  lastVisit: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function normalizeName(value: string, field: string): string {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) {
    throw new Error(`Client ${field} is required`);
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`Client ${field} cannot exceed ${MAX_NAME_LENGTH} characters`);
  }
  return trimmed;
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (email === null || email === undefined) return null;
  const trimmed = email.trim();
  if (trimmed.length === 0) return null;
  if (!Email.isValid(trimmed)) {
    throw new Error('Client email must be a valid email');
  }
  return trimmed;
}

function normalizePhone(phone: string | null | undefined): string {
  // El teléfono puede quedar vacío solo si el tenant permite reservar
  // sin teléfono (requireClientPhone=false); esa comprobación es del
  // use case. La columna es NOT NULL, así que aquí solo validamos forma.
  const trimmed = (phone ?? '').trim();
  if (trimmed.length > MAX_PHONE_LENGTH) {
    throw new Error(`Client phone cannot exceed ${MAX_PHONE_LENGTH} characters`);
  }
  return trimmed;
}

function validateNotes(notes: string | null | undefined): string | null {
  if (notes === null || notes === undefined) return null;
  const trimmed = notes.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_NOTES_LENGTH) {
    throw new Error(`Client notes cannot exceed ${MAX_NOTES_LENGTH} characters`);
  }
  return trimmed;
}

export default class Client {
  private readonly _id: string;
  private readonly _tenantId: string;
  private readonly _userId: string | null;
  private readonly _firstName: string;
  private readonly _lastName: string;
  private readonly _email: string | null;
  private readonly _phone: string;
  private readonly _notes: string | null;
  private readonly _dataExpiresAt: Date | null;
  private readonly _visitCount: number;
  private readonly _lastVisit: Date | null;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  private constructor(
    id: string,
    tenantId: string,
    userId: string | null,
    firstName: string,
    lastName: string,
    email: string | null,
    phone: string,
    notes: string | null,
    dataExpiresAt: Date | null,
    visitCount: number,
    lastVisit: Date | null,
    createdAt: Date,
    updatedAt: Date
  ) {
    this._id = id;
    this._tenantId = tenantId;
    this._userId = userId;
    this._firstName = firstName;
    this._lastName = lastName;
    this._email = email;
    this._phone = phone;
    this._notes = notes;
    this._dataExpiresAt = dataExpiresAt;
    this._visitCount = visitCount;
    this._lastVisit = lastVisit;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  static create(input: ClientCreateInput): Client {
    const firstName = normalizeName(input.firstName, 'firstName');
    const lastName = normalizeName(input.lastName, 'lastName');
    const phone = normalizePhone(input.phone);
    const email = normalizeEmail(input.email);
    const notes = validateNotes(input.notes);

    const now = new Date();
    return new Client(
      input.id || genUUID('cli'),
      input.tenantId,
      input.userId ?? null,
      firstName,
      lastName,
      email,
      phone,
      notes,
      input.dataExpiresAt ?? null,
      0,
      null,
      now,
      now
    );
  }

  static reconstitute(fields: ClientReconstituteFields): Client {
    return new Client(
      fields.id,
      fields.tenantId,
      fields.userId,
      normalizeName(fields.firstName, 'firstName'),
      normalizeName(fields.lastName, 'lastName'),
      normalizeEmail(fields.email),
      normalizePhone(fields.phone),
      validateNotes(fields.notes),
      fields.dataExpiresAt,
      fields.visitCount,
      fields.lastVisit,
      fields.createdAt,
      fields.updatedAt
    );
  }

  /**
   * Registra una visita: visitCount + 1, lastVisit = visitDate y
   * recalcula dataExpiresAt con la retención del tenant (calculado
   * por el use case y pasado aquí).
   */
  registerVisit(visitDate: Date, dataExpiresAt: Date | null): Client {
    return new Client(
      this._id,
      this._tenantId,
      this._userId,
      this._firstName,
      this._lastName,
      this._email,
      this._phone,
      this._notes,
      dataExpiresAt,
      this._visitCount + 1,
      visitDate,
      this._createdAt,
      new Date()
    );
  }

  /**
   * Actualiza el teléfono (fallback de búsqueda por email: si el
   * cliente fue encontrado por email, se sincroniza su teléfono).
   */
  withPhone(phone: string): Client {
    return new Client(
      this._id,
      this._tenantId,
      this._userId,
      this._firstName,
      this._lastName,
      this._email,
      normalizePhone(phone),
      this._notes,
      this._dataExpiresAt,
      this._visitCount,
      this._lastVisit,
      this._createdAt,
      new Date()
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

  get firstName(): string {
    return this._firstName;
  }

  get lastName(): string {
    return this._lastName;
  }

  get email(): string | null {
    return this._email;
  }

  get phone(): string {
    return this._phone;
  }

  get notes(): string | null {
    return this._notes;
  }

  get dataExpiresAt(): Date | null {
    return this._dataExpiresAt;
  }

  get visitCount(): number {
    return this._visitCount;
  }

  get lastVisit(): Date | null {
    return this._lastVisit;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }
}
