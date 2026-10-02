/**
 * @file ListReservationsUseCase.ts
 * @module application/use-cases/reservations
 *
 * Lista reservas del tenant con filtros (F3.3 #6): status, date,
 * employeeId, clientId, limit. F4.3 añade el rango from/to (día
 * calendario local, ambos inclusive) para la agenda semanal.
 */

import { ACTIVE_STATUSES, TERMINAL_STATUSES, ReservationStatusValue } from '../../../domain/entities/Reservation';
import type { ReservationView } from '../../interfaces/IReservationRepository';
import IReservationRepository from '../../interfaces/IReservationRepository';
import { ReservationListOptions } from '../../interfaces/IReservationRepository';
import logger from '../../../infrastructure/logging/requestContext';
import { ValidationError } from '../../../infrastructure/errors';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default class ListReservationsUseCase {
  constructor(private readonly reservationRepository: IReservationRepository) {}

  async execute(
    tenantId: string,
    filters?: ReservationListOptions
  ): Promise<ReservationView[]> {
    logger.info({ tenantId, filters }, 'ListReservationsUseCase: starting');

    if (filters?.status && !ACTIVE_STATUSES.includes(filters.status as ReservationStatusValue) &&
        !TERMINAL_STATUSES.includes(filters.status as ReservationStatusValue)) {
      throw new ValidationError('Reservation status must be pending, confirmed, cancelled, completed or no_show');
    }
    if (filters?.date && !DATE_PATTERN.test(filters.date)) {
      throw new ValidationError('date must be a YYYY-MM-DD string');
    }
    if (filters?.from && !DATE_PATTERN.test(filters.from)) {
      throw new ValidationError('from must be a YYYY-MM-DD string');
    }
    if (filters?.to && !DATE_PATTERN.test(filters.to)) {
      throw new ValidationError('to must be a YYYY-MM-DD string');
    }
    if (filters?.from && filters?.to && filters.from > filters.to) {
      throw new ValidationError('from must be before or equal to to');
    }

    const views = await this.reservationRepository.findByTenantId(tenantId, filters);

    // F4.5b: total por grupo en UNA query (sin N+1). Solo las filas
    // con grupo llevan `groupTotalPrice`.
    const groupIds = [
      ...new Set(
        views
          .map((view) => view.reservation.groupBookingId)
          .filter((groupId): groupId is string => Boolean(groupId))
      ),
    ];
    const totals =
      groupIds.length > 0 ? await this.reservationRepository.findGroupTotals(groupIds) : {};
    const result = views.map((view) => {
      const groupId = view.reservation.groupBookingId;
      const total = groupId ? totals[groupId] : undefined;
      return total === undefined ? view : { ...view, groupTotalPrice: total };
    });

    logger.info({ tenantId, count: result.length }, 'ListReservationsUseCase: completed');
    return result;
  }
}
