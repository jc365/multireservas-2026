/**
 * @file UpdateReservationUseCase.ts
 * @module application/use-cases/reservations
 *
 * Actualización limitada (F3.3 #6): solo `notes` y `status` — el
 * reagendado (fecha/hora/empleado) queda para F4 con el motor de
 * disponibilidad. Al reactivar (terminal → activo) se revalida el
 * solapamiento y el activeKey se regenera en la entity.
 */

import Reservation, { buildActiveKey } from '../../../domain/entities/Reservation';
import type { ReservationWithRelations } from '../../interfaces/IReservationRepository';
import IReservationRepository from '../../interfaces/IReservationRepository';
import { UpdateReservationInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export default class UpdateReservationUseCase {
  constructor(
    private readonly reservationRepository: IReservationRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(
    id: string,
    input: UpdateReservationInput,
    tenantId: string,
    updatedBy: string
  ): Promise<ReservationWithRelations> {
    logger.info({ id, tenantId, updatedBy }, 'UpdateReservationUseCase: starting');

    const existing = await this.reservationRepository.findById(id);
    if (!existing || existing.reservation.tenantId !== tenantId) {
      throw new Error('Reservation not found');
    }
    let updated: Reservation = existing.reservation;

    if (input.notes !== undefined) {
      updated = updated.withNotes(input.notes);
    }

    const statusChanged = input.status !== undefined && input.status !== updated.status;
    if (statusChanged) {
      const wasActive = updated.isActive;
      updated = updated.withStatus(input.status as Reservation['status']);

      // Reactivación: revalidar solapamiento (el activeKey se regenera)
      if (updated.isActive && !wasActive) {
        const activeKey = buildActiveKey(updated.employeeId, updated.date, updated.startTimeUTC);
        const exact = await this.reservationRepository.findByActiveKey(activeKey);
        if (exact && exact.reservation.id !== id) {
          throw new Error('Reservation overlaps an existing reservation');
        }

        const dateStr = updated.date.toISOString().slice(0, 10);
        const sameDay = await this.reservationRepository.findByTenantId(tenantId, {
          employeeId: updated.employeeId,
          date: dateStr,
        });
        const conflict = sameDay.find(
          (view) =>
            view.reservation.id !== id &&
            view.reservation.isActive &&
            intervalsOverlap(
              updated.startTimeUTC,
              updated.endTimeUTC,
              view.reservation.startTimeUTC,
              view.reservation.endTimeUTC
            )
        );
        if (conflict) {
          throw new Error('Reservation overlaps an existing reservation');
        }
      }
    }

    if (input.notes === undefined && !statusChanged) {
      logger.info({ id }, 'UpdateReservationUseCase: nothing to update');
      return existing;
    }

    try {
      await this.reservationRepository.save(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error('Reservation overlaps an existing reservation');
      }
      throw error;
    }

    await this.bitacoraService.log({
      userId: updatedBy,
      action: statusChanged && updated.status === 'cancelled' ? 'cancel_reservation' : 'update_reservation',
      entityType: 'reservation',
      entityId: id,
      metadata: {
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(statusChanged ? { previousStatus: existing.reservation.status, status: updated.status } : {}),
      },
    });

    const view = await this.reservationRepository.findById(id);
    if (!view) {
      throw new Error('Reservation not found');
    }
    logger.info({ id }, 'UpdateReservationUseCase: completed');
    return view;
  }
}
