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

export interface ReservationListOptions {
  status?: string;
  date?: string; // YYYY-MM-DD
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
   * Saves a reservation entity into the database (upsert).
   */
  save(reservation: Reservation): Promise<void>;
}
