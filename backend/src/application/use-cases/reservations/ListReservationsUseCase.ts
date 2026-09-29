/**
 * @file ListReservationsUseCase.ts
 * @module application/use-cases/reservations
 *
 * Lista reservas del tenant con filtros (F3.3 #6): status, date,
 * employeeId, clientId, limit.
 */

import { ACTIVE_STATUSES, TERMINAL_STATUSES, ReservationStatusValue } from '../../../domain/entities/Reservation';
import type { ReservationWithRelations } from '../../interfaces/IReservationRepository';
import IReservationRepository from '../../interfaces/IReservationRepository';
import { ReservationListOptions } from '../../interfaces/IReservationRepository';
import logger from '../../../infrastructure/logging/requestContext';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default class ListReservationsUseCase {
  constructor(private readonly reservationRepository: IReservationRepository) {}

  async execute(
    tenantId: string,
    filters?: ReservationListOptions
  ): Promise<ReservationWithRelations[]> {
    logger.info({ tenantId, filters }, 'ListReservationsUseCase: starting');

    if (filters?.status && !ACTIVE_STATUSES.includes(filters.status as ReservationStatusValue) &&
        !TERMINAL_STATUSES.includes(filters.status as ReservationStatusValue)) {
      throw new Error('Reservation status must be pending, confirmed, cancelled, completed or no_show');
    }
    if (filters?.date && !DATE_PATTERN.test(filters.date)) {
      throw new Error('date must be a YYYY-MM-DD string');
    }

    const views = await this.reservationRepository.findByTenantId(tenantId, filters);
    logger.info({ tenantId, count: views.length }, 'ListReservationsUseCase: completed');
    return views;
  }
}
