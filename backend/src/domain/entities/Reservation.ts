/**
 * @file Reservation.ts
 * @module domain/entities
 *
 * Reservation — reserva de un tenant (F3.3). CRUD básico sin motor de
 * disponibilidad (F4): valida tiempos, duration y deriva `activeKey`
 * (trico de unicidad F0 #8) y `cancelToken` (nanoid, endpoint público
 * de cancelación).
 */

import genUUID from '../utils/genUUID';
import { nanoid } from 'nanoid';

export type ReservationStatusValue =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export const ACTIVE_STATUSES: readonly ReservationStatusValue[] = ['pending', 'confirmed'];
export const TERMINAL_STATUSES: readonly ReservationStatusValue[] = ['cancelled', 'completed', 'no_show'];

const MAX_NOTES_LENGTH = 2000;

export interface ReservationCreateInput {
  tenantId: string;
  clientId: string;
  employeeId: string;
  serviceId: string;
  date: Date; // día calendario (UTC midnight, @db.Date)
  startTimeUTC: Date;
  duration: number; // minutos; endTimeUTC se deriva
  timezone: string; // IANA snapshot
  notes?: string | null;
  status?: ReservationStatusValue;
  groupBookingId?: string | null;
  id?: string;
  cancelToken?: string;
}

export interface ReservationReconstituteFields {
  id: string;
  tenantId: string;
  clientId: string;
  employeeId: string;
  serviceId: string;
  date: Date;
  startTimeUTC: Date;
  endTimeUTC: Date;
  timezone: string;
  duration: number;
  status: ReservationStatusValue;
  notes: string | null;
  groupBookingId: string | null;
  activeKey: string | null;
  cancelToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function isActiveStatus(status: ReservationStatusValue): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/**
 * "{employeeId}-{YYYY-MM-DD}-{HH:MM}" en UTC. Los separadores fijos al
 * final hacen la clave no ambigua aunque employeeId lleve guiones.
 */
export function buildActiveKey(employeeId: string, date: Date, startTimeUTC: Date): string {
  const day = date.toISOString().slice(0, 10);
  const time = startTimeUTC.toISOString().slice(11, 16);
  return `${employeeId}-${day}-${time}`;
}

function validateStatus(status: string): ReservationStatusValue {
  if (!ACTIVE_STATUSES.includes(status as ReservationStatusValue) &&
      !TERMINAL_STATUSES.includes(status as ReservationStatusValue)) {
    throw new Error('Reservation status must be pending, confirmed, cancelled, completed or no_show');
  }
  return status as ReservationStatusValue;
}

function validateNotes(notes: string | null | undefined): string | null {
  if (notes === null || notes === undefined) return null;
  const trimmed = notes.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_NOTES_LENGTH) {
    throw new Error(`Reservation notes cannot exceed ${MAX_NOTES_LENGTH} characters`);
  }
  return trimmed;
}

export default class Reservation {
  private readonly _id: string;
  private readonly _tenantId: string;
  private readonly _clientId: string;
  private readonly _employeeId: string;
  private readonly _serviceId: string;
  private readonly _date: Date;
  private readonly _startTimeUTC: Date;
  private readonly _endTimeUTC: Date;
  private readonly _timezone: string;
  private readonly _duration: number;
  private readonly _status: ReservationStatusValue;
  private readonly _notes: string | null;
  private readonly _groupBookingId: string | null;
  private readonly _activeKey: string | null;
  private readonly _cancelToken: string | null;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  private constructor(
    id: string,
    tenantId: string,
    clientId: string,
    employeeId: string,
    serviceId: string,
    date: Date,
    startTimeUTC: Date,
    endTimeUTC: Date,
    timezone: string,
    duration: number,
    status: ReservationStatusValue,
    notes: string | null,
    groupBookingId: string | null,
    activeKey: string | null,
    cancelToken: string | null,
    createdAt: Date,
    updatedAt: Date
  ) {
    this._id = id;
    this._tenantId = tenantId;
    this._clientId = clientId;
    this._employeeId = employeeId;
    this._serviceId = serviceId;
    this._date = date;
    this._startTimeUTC = startTimeUTC;
    this._endTimeUTC = endTimeUTC;
    this._timezone = timezone;
    this._duration = duration;
    this._status = status;
    this._notes = notes;
    this._groupBookingId = groupBookingId;
    this._activeKey = activeKey;
    this._cancelToken = cancelToken;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  static create(input: ReservationCreateInput): Reservation {
    if (!(input.date instanceof Date) || Number.isNaN(input.date.getTime())) {
      throw new Error('Reservation date must be a valid date');
    }
    if (!(input.startTimeUTC instanceof Date) || Number.isNaN(input.startTimeUTC.getTime())) {
      throw new Error('Reservation startTimeUTC must be a valid date');
    }
    if (!Number.isInteger(input.duration) || input.duration <= 0) {
      throw new Error('Reservation duration must be a positive integer of minutes');
    }
    const endTimeUTC = new Date(input.startTimeUTC.getTime() + input.duration * 60_000);
    if (input.startTimeUTC.getTime() >= endTimeUTC.getTime()) {
      throw new Error('Reservation startTimeUTC must be before endTimeUTC');
    }
    const timezone = (input.timezone ?? '').trim();
    if (timezone.length === 0) {
      throw new Error('Reservation timezone is required');
    }
    const status = validateStatus(input.status ?? 'confirmed');
    const notes = validateNotes(input.notes);
    const activeKey = isActiveStatus(status)
      ? buildActiveKey(input.employeeId, input.date, input.startTimeUTC)
      : null;

    const now = new Date();
    return new Reservation(
      input.id || genUUID('res'),
      input.tenantId,
      input.clientId,
      input.employeeId,
      input.serviceId,
      new Date(Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth(), input.date.getUTCDate())),
      input.startTimeUTC,
      endTimeUTC,
      timezone,
      input.duration,
      status,
      notes,
      input.groupBookingId ?? null,
      activeKey,
      input.cancelToken || nanoid(21),
      now,
      now
    );
  }

  static reconstitute(fields: ReservationReconstituteFields): Reservation {
    if (!(fields.date instanceof Date) || Number.isNaN(fields.date.getTime())) {
      throw new Error('Reservation date must be a valid date');
    }
    if (!(fields.startTimeUTC instanceof Date) || Number.isNaN(fields.startTimeUTC.getTime())) {
      throw new Error('Reservation startTimeUTC must be a valid date');
    }
    if (!Number.isInteger(fields.duration) || fields.duration <= 0) {
      throw new Error('Reservation duration must be a positive integer of minutes');
    }
    if (fields.startTimeUTC.getTime() >= fields.endTimeUTC.getTime()) {
      throw new Error('Reservation startTimeUTC must be before endTimeUTC');
    }
    if ((fields.timezone ?? '').trim().length === 0) {
      throw new Error('Reservation timezone is required');
    }
    return new Reservation(
      fields.id,
      fields.tenantId,
      fields.clientId,
      fields.employeeId,
      fields.serviceId,
      fields.date,
      fields.startTimeUTC,
      fields.endTimeUTC,
      fields.timezone,
      fields.duration,
      validateStatus(fields.status),
      validateNotes(fields.notes),
      fields.groupBookingId,
      fields.activeKey,
      fields.cancelToken,
      fields.createdAt,
      fields.updatedAt
    );
  }

  /**
   * Cambio de estado: al entrar en estado activo (pending/confirmed)
   * se (re)genera el activeKey; al salir (cancelled/completed/no_show)
   * se limpia (F0 #8).
   */
  withStatus(status: ReservationStatusValue): Reservation {
    validateStatus(status);
    const activeKey = isActiveStatus(status)
      ? buildActiveKey(this._employeeId, this._date, this._startTimeUTC)
      : null;
    return new Reservation(
      this._id,
      this._tenantId,
      this._clientId,
      this._employeeId,
      this._serviceId,
      this._date,
      this._startTimeUTC,
      this._endTimeUTC,
      this._timezone,
      this._duration,
      status,
      this._notes,
      this._groupBookingId,
      activeKey,
      this._cancelToken,
      this._createdAt,
      new Date()
    );
  }

  withNotes(notes: string | null): Reservation {
    return new Reservation(
      this._id,
      this._tenantId,
      this._clientId,
      this._employeeId,
      this._serviceId,
      this._date,
      this._startTimeUTC,
      this._endTimeUTC,
      this._timezone,
      this._duration,
      this._status,
      validateNotes(notes),
      this._groupBookingId,
      this._activeKey,
      this._cancelToken,
      this._createdAt,
      new Date()
    );
  }

  /**
   * F4.7a — reprogramación: nueva fecha/hora y opcionalmente nuevo
   * empleado. Recalcula `endTimeUTC` y `activeKey` (si sigue activa —
   * la clave vieja queda liberada al sobrescribir la fila) y
   * **regenera `cancelToken`** (`nanoid(21)`): el email anterior deja
   * de cancelar, solo el más reciente funciona.
   *
   * No toca `status` ni `notes` (el use case aplica `withNotes` antes
   * si el PUT también trae notas).
   *
   * @throws {Error} fechas inválidas o `startTimeUTC` no parseable.
   */
  withSchedule(fields: { date: Date; startTimeUTC: Date; employeeId?: string }): Reservation {
    if (!(fields.date instanceof Date) || Number.isNaN(fields.date.getTime())) {
      throw new Error('Reservation date must be a valid date');
    }
    if (!(fields.startTimeUTC instanceof Date) || Number.isNaN(fields.startTimeUTC.getTime())) {
      throw new Error('Reservation startTimeUTC must be a valid date');
    }
    const employeeId = fields.employeeId ?? this._employeeId;
    const startTimeUTC = fields.startTimeUTC;
    const endTimeUTC = new Date(startTimeUTC.getTime() + this._duration * 60_000);
    const date = new Date(
      Date.UTC(fields.date.getUTCFullYear(), fields.date.getUTCMonth(), fields.date.getUTCDate())
    );
    const activeKey = isActiveStatus(this._status)
      ? buildActiveKey(employeeId, date, startTimeUTC)
      : null;
    return new Reservation(
      this._id,
      this._tenantId,
      this._clientId,
      employeeId,
      this._serviceId,
      date,
      startTimeUTC,
      endTimeUTC,
      this._timezone,
      this._duration,
      this._status,
      this._notes,
      this._groupBookingId,
      activeKey,
      nanoid(21),
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

  get clientId(): string {
    return this._clientId;
  }

  get employeeId(): string {
    return this._employeeId;
  }

  get serviceId(): string {
    return this._serviceId;
  }

  get date(): Date {
    return this._date;
  }

  get startTimeUTC(): Date {
    return this._startTimeUTC;
  }

  get endTimeUTC(): Date {
    return this._endTimeUTC;
  }

  get timezone(): string {
    return this._timezone;
  }

  get duration(): number {
    return this._duration;
  }

  get status(): ReservationStatusValue {
    return this._status;
  }

  get notes(): string | null {
    return this._notes;
  }

  get groupBookingId(): string | null {
    return this._groupBookingId;
  }

  get activeKey(): string | null {
    return this._activeKey;
  }

  get cancelToken(): string | null {
    return this._cancelToken;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get isActive(): boolean {
    return isActiveStatus(this._status);
  }
}
