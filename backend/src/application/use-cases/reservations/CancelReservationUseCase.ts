/**
 * @file CancelReservationUseCase.ts
 * @module application/use-cases/reservations
 *
 * Cancelación (F3.3 #10-#11): por id + tenant (autenticado, con
 * bitácora) o por `cancelToken` público (sin auth, sin bitácora — no
 * hay actor autenticado). Sin límite de tiempo para cancelar. Al
 * salir de estado activo el activeKey se limpia (entity.withStatus).
 */

import type { ReservationWithRelations } from '../../interfaces/IReservationRepository';
import IReservationRepository from '../../interfaces/IReservationRepository';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';

export default class CancelReservationUseCase {
  constructor(
    private readonly reservationRepository: IReservationRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  /**
   * Lookup público por token (GET sin auth): null si no existe.
   */
  async getByToken(token: string): Promise<ReservationWithRelations | null> {
    if (!token || token.trim().length === 0) return null;
    return this.reservationRepository.findByCancelToken(token.trim());
  }

  /**
   * Cancelación autenticada (id + tenantId).
   */
  async execute(id: string, tenantId: string, cancelledBy: string): Promise<ReservationWithRelations> {
    logger.info({ id, tenantId, cancelledBy }, 'CancelReservationUseCase: starting');

    const existing = await this.reservationRepository.findById(id);
    if (!existing || existing.reservation.tenantId !== tenantId) {
      throw new Error('Reservation not found');
    }
    if (!existing.reservation.isActive) {
      throw new Error('Reservation is already cancelled or finished');
    }

    const updated = existing.reservation.withStatus('cancelled');
    await this.reservationRepository.save(updated);

    await this.bitacoraService.log({
      userId: cancelledBy,
      action: 'cancel_reservation',
      entityType: 'reservation',
      entityId: id,
      metadata: { previousStatus: existing.reservation.status },
    });

    const view = await this.reservationRepository.findById(id);
    if (!view) {
      throw new Error('Reservation not found');
    }
    logger.info({ id }, 'CancelReservationUseCase: completed');
    return view;
  }

  /**
   * Cancelación pública por token (POST sin auth).
   */
  async executeByToken(token: string): Promise<ReservationWithRelations> {
    logger.info({ tokenLength: token?.length ?? 0 }, 'CancelReservationUseCase: starting (token)');

    const existing = await this.getByToken(token);
    if (!existing) {
      throw new Error('Reservation not found');
    }
    if (!existing.reservation.isActive) {
      throw new Error('Reservation is already cancelled or finished');
    }

    const updated = existing.reservation.withStatus('cancelled');
    await this.reservationRepository.save(updated);

    const view = await this.reservationRepository.findById(existing.reservation.id);
    if (!view) {
      throw new Error('Reservation not found');
    }
    logger.info({ id: existing.reservation.id }, 'CancelReservationUseCase: completed (token)');
    return view;
  }
}
