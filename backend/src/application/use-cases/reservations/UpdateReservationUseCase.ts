/**
 * @file UpdateReservationUseCase.ts
 * @module application/use-cases/reservations
 *
 * Actualización (F3.3 #6): `notes` y `status` — al reactivar
 * (terminal → activo) se revalida el solapamiento y el activeKey se
 * regenera en la entity.
 *
 * F4.7a — reprogramación: el mismo PUT acepta además `date`,
 * `startTimeUTC` y `employeeId?` (F0 #2). Si llega cualquiera de los
 * tres → camino de reprogramación:
 * - Reprograma fecha + hora + empleado (**no** servicios — F0 #1).
 * - Si la fila tiene `groupBookingId` se reprograman **todas las
 *   filas activas** del grupo con las nuevas horas encadenadas por
 *   duración (la fila objetivo marca la hora pedida; F0 #3).
 * - Validaciones: fecha futura, solape por ventana total (excluyendo
 *   las propias filas), empleado del tenant y capaz, servicios
 *   activos, `date`/`startTimeUTC` coherentes (F0 #6-#10).
 * - `cancelToken` **regenerado por fila** (el email viejo deja de
 *   cancelar; F0 #11) y email de reprogramación con el token nuevo de
 *   la primera fila (F0 #12-#14).
 * - Bitácora `reschedule_reservation` con
 *   `{ oldStart, newStart, oldEmployeeId, newEmployeeId, groupId? }`
 *   (F0 #15). Sin límite de tiempo (F0 #16).
 * - `notes` puede acompañar (se aplica a la fila objetivo); `status`
 *   no (mezclarlo con reprogramación → 400).
 */

import Reservation, { buildActiveKey } from '../../../domain/entities/Reservation';
import type Employee from '../../../domain/entities/Employee';
import type { ReservationWithRelations } from '../../interfaces/IReservationRepository';
import IReservationRepository from '../../interfaces/IReservationRepository';
import IEmployeeRepository from '../../interfaces/IEmployeeRepository';
import IServiceRepository from '../../interfaces/IServiceRepository';
import ITenantRepository from '../../interfaces/ITenantRepository';
import { UpdateReservationInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';
import EmailService, { getFrontendOrigin } from '../../../infrastructure/email/EmailService';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../../infrastructure/errors';
import {
  DATE_START_TIME_MISMATCH,
  RESERVATION_INVALID_STATE,
  RESERVATION_NOT_FOUND,
  RESERVATION_OVERLAP,
} from '../../../infrastructure/errors/mr-codes';
import { localDateString } from '../../../domain/utils/TimezoneService';
import cancelReservationGroup from './cancelReservationGroup';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export default class UpdateReservationUseCase {
  constructor(
    private readonly reservationRepository: IReservationRepository,
    private readonly employeeRepository: IEmployeeRepository,
    private readonly serviceRepository: IServiceRepository,
    private readonly tenantRepository: ITenantRepository,
    private readonly bitacoraService: BitacoraService,
    private readonly emailService: EmailService
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
      throw new NotFoundError('Reservation not found', RESERVATION_NOT_FOUND);
    }

    // F4.7a: detección del camino de reprogramación (F0 #2). Cualquiera
    // de los tres campos lo activa; `date` y `startTimeUTC` van juntos.
    if (
      input.employeeId !== undefined &&
      input.employeeId !== null &&
      typeof input.employeeId !== 'string'
    ) {
      throw new ValidationError('employeeId must be a string');
    }
    const hasDate = input.date !== undefined && input.date !== null;
    const hasStart = input.startTimeUTC !== undefined && input.startTimeUTC !== null;
    const hasEmployee =
      typeof input.employeeId === 'string' && input.employeeId.trim().length > 0;
    const reschedule = hasDate || hasStart || hasEmployee;

    if (reschedule) {
      if (input.status !== undefined) {
        throw new ValidationError('status cannot be combined with a reschedule');
      }
      if (hasDate !== hasStart) {
        throw new ValidationError('date and startTimeUTC must be provided together to reschedule');
      }
      return this.reschedule(existing, input, tenantId, updatedBy);
    }

    let updated: Reservation = existing.reservation;
    let statusChanged = false;
    let reactivated = false;

    // notes/status vienen del body: los errores de la entity (VOs)
    // son errores de validación de entrada (F4.2). Solo se envuelven
    // las llamadas síncronas a la entity — nada de repo aquí.
    try {
      if (input.notes !== undefined) {
        updated = updated.withNotes(input.notes);
      }

      statusChanged = input.status !== undefined && input.status !== updated.status;
      if (statusChanged) {
        const wasActive = updated.isActive;
        updated = updated.withStatus(input.status as Reservation['status']);
        reactivated = updated.isActive && !wasActive;
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid reservation data');
    }

    // F4.5b: cancelar una fila de un grupo cancela el grupo entero —
    // misma indivisibilidad que la cancelación directa (1 bitácora
    // por grupo). Solo aplica a `cancelled`; el resto de estados
    // (notas, completed, …) sigue tocando la fila concreta.
    const groupId = existing.reservation.groupBookingId;
    if (statusChanged && input.status === 'cancelled' && groupId) {
      const view = await cancelReservationGroup(
        this.reservationRepository,
        this.bitacoraService,
        groupId,
        id,
        updatedBy
      );
      logger.info({ id, groupId }, 'UpdateReservationUseCase: group cancelled');
      return view;
    }

    // Reactivación: revalidar solapamiento (el activeKey se regenera)
    if (reactivated) {      const activeKey = buildActiveKey(updated.employeeId, updated.date, updated.startTimeUTC);
      const exact = await this.reservationRepository.findByActiveKey(activeKey);
      if (exact && exact.reservation.id !== id) {
        throw new ConflictError('Reservation overlaps an existing reservation', RESERVATION_OVERLAP);
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
        throw new ConflictError('Reservation overlaps an existing reservation', RESERVATION_OVERLAP);
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
        throw new ConflictError('Reservation overlaps an existing reservation', RESERVATION_OVERLAP);
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
      throw new NotFoundError('Reservation not found', RESERVATION_NOT_FOUND);
    }
    logger.info({ id }, 'UpdateReservationUseCase: completed');
    return view;
  }

  /**
   * F4.7a — reprogramación (F0 #2-#16). Ver JSDoc del fichero.
   *
   * Modelo de grupo (F0 #3-#5): `rows` son las filas **activas**
   * ordenadas por inicio; la hora pedida marca la fila objetivo y el
   * resto se reencadenan por duración conservando el orden (las
   * filas inactivas no se tocan). La ventana total se valida contra
   * la ocupación del empleado **excluyendo las propias filas**.
   */
  private async reschedule(
    existing: ReservationWithRelations,
    input: UpdateReservationInput,
    tenantId: string,
    updatedBy: string
  ): Promise<ReservationWithRelations> {
    const target = existing.reservation;
    const id = target.id;

    if (!target.isActive) {
      throw new ConflictError('Reservation is already cancelled or finished', RESERVATION_INVALID_STATE);
    }

    const tenant = await this.tenantRepository.findById(tenantId);
    const timezone = tenant?.timezone || target.timezone || 'UTC';

    // `date`+`startTimeUTC` vienen juntos (execute lo garantiza);
    // solo `employeeId` → se conserva la fecha/hora actual.
    let newStart: Date;
    if (input.date !== undefined && input.date !== null) {
      if (!DATE_PATTERN.test(String(input.date))) {
        throw new ValidationError('date must be a YYYY-MM-DD string');
      }
      newStart = new Date(String(input.startTimeUTC));
      if (Number.isNaN(newStart.getTime())) {
        throw new ValidationError('startTimeUTC must be a valid ISO date');
      }
      const expectedDate = localDateString(newStart, timezone);
      if (String(input.date) !== expectedDate) {
        throw new ValidationError(
          `date must be the local day (${timezone}) of startTimeUTC — got ${String(input.date)}, expected ${expectedDate}`,
          DATE_START_TIME_MISMATCH
        );
      }
    } else {
      newStart = target.startTimeUTC;
    }
    if (newStart.getTime() < Date.now()) {
      throw new ValidationError('Reservation cannot be in the past');
    }

    // Filas a reprogramar: grupo → todas las activas (orden de inicio);
    // simple → la propia. Si el objetivo no está activa → 409.
    const groupId = target.groupBookingId;
    let rows: Reservation[];
    if (groupId) {
      const groupViews = await this.reservationRepository.findByGroupBookingId(groupId);
      rows = groupViews.filter((view) => view.reservation.isActive).map((view) => view.reservation);
      if (!rows.some((row) => row.id === id)) {
        throw new ConflictError('Reservation is already cancelled or finished', RESERVATION_INVALID_STATE);
      }
    } else {
      rows = [target];
    }

    // Empleado: conservar el actual si no viene (o viene en blanco).
    const requestedEmployeeId = input.employeeId?.trim() || target.employeeId;
    const employee = await this.employeeRepository.findById(requestedEmployeeId);
    if (!employee || employee.tenantId !== tenantId) {
      throw new ValidationError('employeeId does not reference an employee of this tenant');
    }
    if (!employee.isActive) {
      throw new ValidationError('employee is not active');
    }

    const serviceIds = [...new Set(rows.map((row) => row.serviceId))];
    if (!offersAll(employee, serviceIds)) {
      throw new ValidationError('employee does not offer all the requested services');
    }

    // Servicios siguen activos (F0 #9).
    const serviceById = new Map<string, Awaited<ReturnType<IServiceRepository['findById']>>>();
    for (const serviceId of serviceIds) {
      const service = await this.serviceRepository.findById(serviceId);
      if (!service || !service.isActive) {
        throw new ValidationError('service is not active');
      }
      serviceById.set(serviceId, service);
    }

    // Reprogramación por fila: offsets encadenados sobre la fila
    // objetivo (la hora pedida es exactamente la de esa fila).
    let updatedRows: Reservation[];
    try {
      const offsets: number[] = [];
      let acc = 0;
      for (const row of rows) {
        offsets.push(acc);
        acc += row.duration * 60_000;
      }
      const targetIndex = rows.findIndex((row) => row.id === id);
      const targetOffset = offsets[targetIndex];

      updatedRows = rows.map((row, index) => {
        const start = new Date(newStart.getTime() + (offsets[index] - targetOffset));
        const date = new Date(`${localDateString(start, timezone)}T00:00:00.000Z`);
        const withNotes =
          index === targetIndex && input.notes !== undefined
            ? row.withNotes(input.notes)
            : row;
        return withNotes.withSchedule({ date, startTimeUTC: start, employeeId: employee.id });
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid reservation data');
    }

    // Solapamiento por VENTANA TOTAL (como F4.5b), excluyendo las
    // filas propias: su ocupación vieja no es un conflicto.
    const blockStart = updatedRows[0].startTimeUTC;
    const lastRow = updatedRows[updatedRows.length - 1];
    const blockEnd = lastRow.endTimeUTC;
    const ranges = await this.reservationRepository.findActiveRanges(
      tenantId,
      employee.id,
      blockStart,
      blockEnd,
      rows.map((row) => row.id)
    );
    if (ranges.length > 0) {
      throw new ConflictError('Reservation overlaps an existing reservation', RESERVATION_OVERLAP);
    }

    // Persistencia: grupo → UNA transacción (saveMany); simple → save.
    // Un P2002 (carrera sobre activeKey) → 409 sin reintentos.
    try {
      if (groupId) {
        await this.reservationRepository.saveMany(updatedRows);
      } else {
        await this.reservationRepository.save(updatedRows[0]);
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Reservation overlaps an existing reservation', RESERVATION_OVERLAP);
      }
      throw error;
    }

    // 1 bitácora por reserva simple / 1 por grupo (F0 #15).
    await this.bitacoraService.log({
      userId: updatedBy,
      action: 'reschedule_reservation',
      entityType: 'reservation',
      entityId: groupId ?? id,
      metadata: {
        oldStart: target.startTimeUTC.toISOString(),
        newStart: newStart.toISOString(),
        oldEmployeeId: target.employeeId,
        newEmployeeId: employee.id,
        ...(groupId ? { groupId } : {}),
      },
    });

    const view = await this.reservationRepository.findById(id);
    if (!view) {
      throw new NotFoundError('Reservation not found', RESERVATION_NOT_FOUND);
    }

    // Email de reprogramación (nunca bloquea). 1 email, con el token
    // NUEVO de la primera fila del bloque (F0 #12-#14).
    const client = view.client;
    if (client?.email) {
      try {
        const first = updatedRows[0];
        const origin = getFrontendOrigin();
        const cancelUrl = `${origin}/reservations/cancel/${first.cancelToken}`;
        const orderedNames: string[] = [];
        for (const row of rows) {
          const name = serviceById.get(row.serviceId)?.name.getValue() ?? row.serviceId;
          if (!orderedNames.includes(name)) orderedNames.push(name);
        }
        const totalDuration = rows.reduce((sum, row) => sum + row.duration, 0);
        const text = [
          `Hi ${client.firstName},`,
          '',
          'Your reservation has been rescheduled:',
          ...(rows.length > 1
            ? ['Services:', ...orderedNames.map((name, index) => `${index + 1}. ${name}`)]
            : [`Service: ${orderedNames[0]}`]),
          `Employee: ${employee.name.getValue()}`,
          `New date: ${localDateString(first.startTimeUTC, timezone)} (${timezone}), ${first.startTimeUTC
            .toISOString()
            .slice(11, 16)} UTC`,
          `Duration: ${totalDuration} min`,
          '',
          `Cancel it here: ${cancelUrl}`,
        ].join('\n');
        await this.emailService.send({
          to: client.email,
          subject: `Reservation rescheduled - ${orderedNames.join(' + ')}`,
          text,
        });
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : error },
          'UpdateReservationUseCase: reschedule email failed (ignored)'
        );
      }
    }

    logger.info(
      { id, groupId, newStart: newStart.toISOString(), employeeId: employee.id },
      'UpdateReservationUseCase: rescheduled'
    );
    return view;
  }
}

/** El empleado ofrece TODOS los servicios de las filas (F4.5b/F4.4c). */
function offersAll(employee: Employee, serviceIds: string[]): boolean {
  if (employee.offersAllServices) return true;
  return serviceIds.every((id) => employee.serviceIds.includes(id));
}
