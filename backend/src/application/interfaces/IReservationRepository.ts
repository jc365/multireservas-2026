/**
 * @file IReservationRepository.ts
 * @module application/interfaces
 */

import Reservation from '../../domain/entities/Reservation';

export interface ReservationClientRelation {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
}

export interface ReservationEmployeeRelation {
  id: string;
  name: string;
  isActive: boolean;
}

export interface ReservationServiceRelation {
  id: string;
  name: string;
  duration: number;
  price: number | null;
}

/**
 * Reserva + relaciones mínimas (nombres) para respuestas de API,
 * evitando N+1 en el frontend.
 */
export interface ReservationWithRelations {
  reservation: Reservation;
  client: ReservationClientRelation | null;
  employee: ReservationEmployeeRelation | null;
  service: ReservationServiceRelation | null;
}

/**
 * F4.5b: la misma vista con el total del grupo cuando aplica. Solo
 * lo añaden los use cases (POST / GET / listado) para filas con
 * `groupBookingId`; `reservationResponse()` lo refleja.
 */
export interface ReservationViewExtras {
  groupTotalPrice?: number;
}

export type ReservationView = ReservationWithRelations & ReservationViewExtras;

export interface ReservationListOptions {
  status?: string;
  date?: string; // YYYY-MM-DD (día exacto; tiene prioridad sobre from/to)
  from?: string; // YYYY-MM-DD inclusive (F4.3 — rango visible de la agenda)
  to?: string; // YYYY-MM-DD inclusive (F4.3)
  employeeId?: string;
  clientId?: string;
  limit?: number;
}

/**
 * Interface for the repository operations related to reservations.
 */
export default interface IReservationRepository {
  /**
   * Finds a reservation by its unique identifier (con relaciones).
   */
  findById(id: string): Promise<ReservationWithRelations | null>;

  /**
   * Reservas del tenant (createdAt desc), con filtros opcionales.
   */
  findByTenantId(
    tenantId: string,
    options?: ReservationListOptions
  ): Promise<ReservationWithRelations[]>;

  /**
   * Lookup por activeKey (único): base del chequeo de solapamiento.
   */
  findByActiveKey(activeKey: string): Promise<ReservationWithRelations | null>;

  /**
   * Lookup público por cancelToken (único, F3.3 #10).
   */
  findByCancelToken(cancelToken: string): Promise<ReservationWithRelations | null>;

  /**
   * F4.5b: todas las filas de un grupo (misma `groupBookingId`),
   * ordenadas por inicio. Base de la cancelación de grupo.
   */
  findByGroupBookingId(groupBookingId: string): Promise<ReservationWithRelations[]>;

  /**
   * F4.5b: precio total por grupo (suma de `Service.price` de cada
   * fila) para los grupos indicados, en UNA query — evita el N+1 del
   * listado. Grupos sin filas no aparecen en el mapa.
   */
  findGroupTotals(groupBookingIds: string[]): Promise<Record<string, number>>;

  /**
   * Rangos UTC (start/end) de reservas activas (pending|confirmed) de
   * un empleado que solapan [fromUTC, toUTC) — entrada de ocupación
   * del motor de disponibilidad (F4.1a). Devuelve solo el rango
   * (sin relaciones) para evitar N+1.
   */
  findActiveRanges(
    tenantId: string,
    employeeId: string,
    fromUTC: Date,
    toUTC: Date
  ): Promise<{ start: Date; end: Date }[]>;

  /**
   * Saves a reservation entity into the database (upsert).
   */
  save(reservation: Reservation): Promise<void>;

  /**
   * F4.5b: persiste N filas en UNA transacción (creación del grupo y
   * cancelación de grupo). Si alguna fila viola un único (P2002) la
   * transacción entera revierte y el error llega al caller — allí se
   * traduce a 409 overlap (sin reintentos).
   */
  saveMany(reservations: Reservation[]): Promise<void>;
}
