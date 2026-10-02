/**
 * @file CancelReservationUseCase.ts
 * @module application/use-cases/reservations
 *
 * Cancelación (F3.3 #10-#11): por id + tenant (autenticado, con
 * bitácora) o por `cancelToken` público (sin auth, sin bitácora — no
 * hay actor autenticado). Sin límite de tiempo para cancelar. Al
 * salir de estado activo el activeKey se limpia (entity.withStatus).
 *
 * F4.5b (cancelación de grupo): si la fila tiene `groupBookingId` se
 * cancelan en UNA transacción (`saveMany`) TODAS las filas activas del
 * grupo — la decisión es indivisible (o el bloque entero o nada). Si
 * ninguna está activa → 409 `RESERVATION_INVALID_STATE`. La bitácora
 * es UNA entrada por grupo (entityId = groupBookingId), no por fila.
 * Una fila sin grupo conserva el comportamiento de F3.3.
 */

import type { ReservationWithRelations } from '../../interfaces/IReservationRepository';
import IReservationRepository from '../../interfaces/IReservationRepository';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';
import { ConflictError, NotFoundError } from '../../../infrastructure/errors';
import { RESERVATION_INVALID_STATE, RESERVATION_NOT_FOUND } from '../../../infrastructure/errors/mr-codes';
import cancelReservationGroup from './cancelReservationGroup';

function reservationNotFound(): NotFoundError {
  return new NotFoundError('Reservation not found', RESERVATION_NOT_FOUND);
}

function reservationInvalidState(): ConflictError {
  return new ConflictError('Reservation is already cancelled or finished', RESERVATION_INVALID_STATE);
}

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
      throw reservationNotFound();
    }

    // F4.5b: fila de un grupo → la decisión es del grupo entero.
    const groupId = existing.reservation.groupBookingId;
    if (groupId) {
      return cancelReservationGroup(this.reservationRepository, this.bitacoraService, groupId, id, cancelledBy);
    }

    if (!existing.reservation.isActive) {
      throw reservationInvalidState();
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
      throw reservationNotFound();
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
      throw reservationNotFound();
    }

    // F4.5b: el token apunta a una fila del grupo → se cancela el
    // grupo completo (sin bitácora: no hay actor autenticado).
    const groupId = existing.reservation.groupBookingId;
    if (groupId) {
      return cancelReservationGroup(
        this.reservationRepository,
        this.bitacoraService,
        groupId,
        existing.reservation.id,
        null
      );
    }

    if (!existing.reservation.isActive) {
      throw reservationInvalidState();
    }

    const updated = existing.reservation.withStatus('cancelled');
    await this.reservationRepository.save(updated);

    const view = await this.reservationRepository.findById(existing.reservation.id);
    if (!view) {
      throw reservationNotFound();
    }
    logger.info({ id: existing.reservation.id }, 'CancelReservationUseCase: completed (token)');
    return view;
  }
}
