/**
 * @file GetReservationUseCase.ts
 * @module application/use-cases/reservations
 *
 * Detalle de reserva (F3.3 #14): aislamiento por tenant → 404 si no
 * existe o pertenece a otro tenant.
 */

import type { ReservationWithRelations } from '../../interfaces/IReservationRepository';
import IReservationRepository from '../../interfaces/IReservationRepository';
import logger from '../../../infrastructure/logging/requestContext';

export default class GetReservationUseCase {
  constructor(private readonly reservationRepository: IReservationRepository) {}

  async execute(id: string, tenantId: string): Promise<ReservationWithRelations> {
    logger.info({ id, tenantId }, 'GetReservationUseCase: starting');

    const view = await this.reservationRepository.findById(id);
    if (!view || view.reservation.tenantId !== tenantId) {
      throw new Error('Reservation not found');
    }

    logger.info({ id }, 'GetReservationUseCase: completed');
    return view;
  }
}
