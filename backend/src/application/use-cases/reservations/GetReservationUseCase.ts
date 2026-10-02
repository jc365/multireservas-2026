/**
 * @file GetReservationUseCase.ts
 * @module application/use-cases/reservations
 *
 * Detalle de reserva (F3.3 #14): aislamiento por tenant → 404 si no
 * existe o pertenece a otro tenant. F4.5b: si la reserva pertenece a
 * un grupo añade `groupTotalPrice` (suma de precios de SUS filas, una
 * query extra — nunca N+1 porque es una sola reserva).
 */

import type { ReservationView } from '../../interfaces/IReservationRepository';
import IReservationRepository from '../../interfaces/IReservationRepository';
import logger from '../../../infrastructure/logging/requestContext';
import { NotFoundError } from '../../../infrastructure/errors';
import { RESERVATION_NOT_FOUND } from '../../../infrastructure/errors/mr-codes';

export default class GetReservationUseCase {
  constructor(private readonly reservationRepository: IReservationRepository) {}

  async execute(id: string, tenantId: string): Promise<ReservationView> {
    logger.info({ id, tenantId }, 'GetReservationUseCase: starting');

    const view = await this.reservationRepository.findById(id);
    if (!view || view.reservation.tenantId !== tenantId) {
      throw new NotFoundError('Reservation not found', RESERVATION_NOT_FOUND);
    }

    const groupId = view.reservation.groupBookingId;
    if (groupId) {
      const totals = await this.reservationRepository.findGroupTotals([groupId]);
      const total = totals[groupId];
      if (total !== undefined) {
        logger.info({ id, groupBookingId: groupId, groupTotalPrice: total }, 'GetReservationUseCase: completed');
        return { ...view, groupTotalPrice: total };
      }
    }

    logger.info({ id }, 'GetReservationUseCase: completed');
    return view;
  }
}
