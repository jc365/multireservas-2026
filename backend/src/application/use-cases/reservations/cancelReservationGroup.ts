/**
 * @file cancelReservationGroup.ts
 * @module application/use-cases/reservations
 *
 * F4.5b — cancelación de un grupo de reserva (N filas con la misma
 * `groupBookingId`): cancela en UNA transacción (`saveMany`) todas
 * las filas **activas** del grupo. La decisión es indivisible — o el
 * bloque entero sigue vivo o se cancela entero.
 *
 * Compartida por las dos vías de cancelación:
 * - `CancelReservationUseCase.execute` (id + tenant, con bitácora)
 * - `CancelReservationUseCase.executeByToken` (público, sin bitácora)
 * - `UpdateReservationUseCase` con `status: 'cancelled'`
 *
 * Si ninguna fila del grupo está activa → 409
 * `RESERVATION_INVALID_STATE`. La bitácora registra UNA entrada por
 * grupo (`entityId = groupBookingId`), nunca por fila.
 */

import type { ReservationWithRelations } from '../../interfaces/IReservationRepository';
import type IReservationRepository from '../../interfaces/IReservationRepository';
import type BitacoraService from '../../../infrastructure/logging/BitacoraService';
import { ConflictError, NotFoundError } from '../../../infrastructure/errors';
import { RESERVATION_INVALID_STATE, RESERVATION_NOT_FOUND } from '../../../infrastructure/errors/mr-codes';
import logger from '../../../infrastructure/logging/requestContext';

/**
 * Cancela el grupo completo y devuelve la fila `targetId` (ya
 * cancelada si estaba activa).
 *
 * @param cancelledBy actor autenticado, o `null` en la vía pública
 * por token (no se registra bitácora: no hay actor).
 * @throws {NotFoundError} 404 si la fila objetivo ya no existe.
 * @throws {ConflictError} 409 si ninguna fila del grupo está activa.
 */
export default async function cancelReservationGroup(
  reservationRepository: IReservationRepository,
  bitacoraService: BitacoraService,
  groupBookingId: string,
  targetId: string,
  cancelledBy: string | null
): Promise<ReservationWithRelations> {
  const rows = await reservationRepository.findByGroupBookingId(groupBookingId);
  const actives = rows.filter((view) => view.reservation.isActive);
  if (actives.length === 0) {
    throw new ConflictError(
      'Reservation is already cancelled or finished',
      RESERVATION_INVALID_STATE
    );
  }

  await reservationRepository.saveMany(
    actives.map((view) => view.reservation.withStatus('cancelled'))
  );

  if (cancelledBy !== null) {
    await bitacoraService.log({
      userId: cancelledBy,
      action: 'cancel_reservation',
      entityType: 'reservation',
      entityId: groupBookingId,
      metadata: {
        groupBookingId,
        cancelledCount: actives.length,
        reservationIds: actives.map((view) => view.reservation.id),
        previousStatus: actives[0].reservation.status,
      },
    });
  }

  const view = await reservationRepository.findById(targetId);
  if (!view) {
    throw new NotFoundError('Reservation not found', RESERVATION_NOT_FOUND);
  }
  logger.info(
    { groupBookingId, cancelled: actives.length },
    'cancelReservationGroup: group cancelled'
  );
  return view;
}
