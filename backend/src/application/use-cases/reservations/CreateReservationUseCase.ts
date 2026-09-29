/**
 * @file CreateReservationUseCase.ts
 * @module application/use-cases/reservations
 *
 * Crea una reserva (F3.3 #6-#9): valida refs al tenant, que service y
 * employee estén activos, fecha futura, duration == Service.duration,
 * solapamiento (activeKey único + intersección de intervalos para el
 * mismo employee/día) y crea o reutiliza el cliente interno (pasándole
 * `startTimeUTC` como `visitAt` para el lastVisit de F3.3.1). Estado
 * inicial por defecto `confirmed`; envía email de confirmación si el
 * cliente tiene email (nunca bloquea la operación).
 */

import Client from '../../../domain/entities/Client';
import Reservation, { buildActiveKey } from '../../../domain/entities/Reservation';
import type { ReservationWithRelations } from '../../interfaces/IReservationRepository';
import IReservationRepository from '../../interfaces/IReservationRepository';
import IEmployeeRepository from '../../interfaces/IEmployeeRepository';
import IServiceRepository from '../../interfaces/IServiceRepository';
import IClientRepository from '../../interfaces/IClientRepository';
import ITenantRepository from '../../interfaces/ITenantRepository';
import FindOrCreateClientUseCase from '../clients/FindOrCreateClientUseCase';
import { CreateReservationInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';
import EmailService, { getFrontendOrigin } from '../../../infrastructure/email/EmailService';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export default class CreateReservationUseCase {
  constructor(
    private readonly reservationRepository: IReservationRepository,
    private readonly employeeRepository: IEmployeeRepository,
    private readonly serviceRepository: IServiceRepository,
    private readonly clientRepository: IClientRepository,
    private readonly tenantRepository: ITenantRepository,
    private readonly findOrCreateClient: FindOrCreateClientUseCase,
    private readonly bitacoraService: BitacoraService,
    private readonly emailService: EmailService
  ) {}

  async execute(
    input: CreateReservationInput,
    tenantId: string,
    createdBy: string
  ): Promise<ReservationWithRelations> {
    logger.info({ tenantId, employeeId: input.employeeId, serviceId: input.serviceId, createdBy }, 'CreateReservationUseCase: starting');

    if (!DATE_PATTERN.test(input.date)) {
      throw new Error('date must be a YYYY-MM-DD string');
    }
    const startTimeUTC = new Date(input.startTimeUTC);
    if (Number.isNaN(startTimeUTC.getTime())) {
      throw new Error('startTimeUTC must be a valid ISO date');
    }
    if (startTimeUTC.getTime() < Date.now()) {
      throw new Error('Reservation cannot be in the past');
    }
    const date = new Date(`${input.date}T00:00:00.000Z`);

    const employee = await this.employeeRepository.findById(input.employeeId);
    if (!employee || employee.tenantId !== tenantId) {
      throw new Error('employeeId does not reference an employee of this tenant');
    }
    if (!employee.isActive) {
      throw new Error('employee is not active');
    }

    const service = await this.serviceRepository.findById(input.serviceId);
    if (!service || service.tenantId !== tenantId) {
      throw new Error('serviceId does not reference a service of this tenant');
    }
    if (!service.isActive) {
      throw new Error('service is not active');
    }

    const duration = input.duration ?? service.duration;
    if (duration !== service.duration) {
      throw new Error('duration must match the service duration');
    }

    // Cliente: existente (clientId) o interno (client data)
    let client: Client;
    if (input.clientId) {
      const existing = await this.clientRepository.findById(input.clientId);
      if (!existing || existing.tenantId !== tenantId) {
        throw new Error('clientId does not reference a client of this tenant');
      }
      client = existing;
    } else if (input.client) {
      client = await this.findOrCreateClient.execute(input.client, tenantId, startTimeUTC);
    } else {
      throw new Error('client or client data is required');
    }

    const timezone = (input.timezone ?? '').trim() || (await this.tenantRepository.findById(tenantId))?.timezone || 'UTC';
    const status = input.status ?? 'confirmed';
    if (status !== 'pending' && status !== 'confirmed') {
      throw new Error('Reservation status must be pending or confirmed');
    }

    // Solapamiento: 1) activeKey exacto; 2) intersección de intervalos
    const activeKey = buildActiveKey(employee.id, date, startTimeUTC);
    const exact = await this.reservationRepository.findByActiveKey(activeKey);
    if (exact) {
      throw new Error('Reservation overlaps an existing reservation');
    }

    const endTimeUTC = new Date(startTimeUTC.getTime() + duration * 60_000);
    const sameDay = await this.reservationRepository.findByTenantId(tenantId, {
      employeeId: employee.id,
      date: input.date,
    });
    const conflict = sameDay.find(
      (view) =>
        view.reservation.isActive &&
        intervalsOverlap(startTimeUTC, endTimeUTC, view.reservation.startTimeUTC, view.reservation.endTimeUTC)
    );
    if (conflict) {
      throw new Error('Reservation overlaps an existing reservation');
    }

    const reservation = Reservation.create({
      tenantId,
      clientId: client.id,
      employeeId: employee.id,
      serviceId: service.id,
      date,
      startTimeUTC,
      duration,
      timezone,
      notes: input.notes ?? null,
      status,
    });

    try {
      await this.reservationRepository.save(reservation);
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Carrera sobre activeKey: otro mismo slot se insertó a la vez
        throw new Error('Reservation overlaps an existing reservation');
      }
      throw error;
    }

    await this.bitacoraService.log({
      userId: createdBy,
      action: 'create_reservation',
      entityType: 'reservation',
      entityId: reservation.id,
      metadata: {
        date: input.date,
        startTimeUTC: reservation.startTimeUTC.toISOString(),
        employeeId: employee.id,
        serviceId: service.id,
        clientId: client.id,
        status: reservation.status,
      },
    });

    // Email de confirmación (nunca bloquea)
    if (client.email) {
      try {
        const origin = getFrontendOrigin();
        const cancelUrl = `${origin}/reservations/cancel/${reservation.cancelToken}`;
        const text = [
          `Hi ${client.firstName},`,
          '',
          'Your reservation is confirmed:',
          `Service: ${service.name.getValue()}`,
          `Employee: ${employee.name.getValue()}`,
          `Date: ${input.date} (${timezone}), ${startTimeUTC.toISOString().slice(11, 16)} UTC`,
          `Duration: ${duration} min`,
          '',
          `Cancel it here: ${cancelUrl}`,
        ].join('\n');
        await this.emailService.send({
          to: client.email,
          subject: `Reservation confirmed - ${service.name.getValue()}`,
          text,
        });
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : error },
          'CreateReservationUseCase: confirmation email failed (ignored)'
        );
      }
    }

    const view = await this.reservationRepository.findById(reservation.id);
    if (!view) {
      throw new Error('Reservation not found');
    }
    logger.info({ reservationId: reservation.id }, 'CreateReservationUseCase: completed');
    return view;
  }
}
