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
 *
 * F4.4c ("sin preferencia"): `employeeId` es opcional. Si ausente o en
 * blanco, el backend asigna un empleado activo libre en el slot
 * solicitado (via GetAvailability sobre la ventana exacta). Si ningún
 * empleado encaja → 409 `NO_EMPLOYEE_AVAILABLE`. La carrera entre dos
 * asignaciones al mismo empleado/slot la detecta `@@unique([activeKey])`
 * → 409 overlap; NO se reintenta automáticamente (elige otra hora).
 *
 * F4.5b (multi-servicio seguido): `serviceIds: [svc1, svc2, …]`
 * construye N filas encadenadas (`start_i = start + Σ durations[0..i-1]`)
 * con la MISMA `groupBookingId` (`genUUID('grp')`), `date` recalculado
 * por fila (puede cruzar medianoche) y `activeKey` propio por fila.
 * - longitud 1 → reserva simple **sin** grupo (idéntico al camino
 *   clásico de `serviceId`).
 * - Solapamiento validado por **ventana total**
 *   `[start, start + total)` + chequeo de `activeKey` por fila; la
 *   carrera final la resuelve P2002 → 409 (sin reintentos).
 * - Persistencia atómica vía `saveMany()` (una transacción): o se
 *   crean las N filas o ninguna.
 * - Empleado explícito: tiene que ofrecer TODOS los servicios
 *   (`offersAllServices` o M2M `serviceIds`); sin preferencia se pide
 *   la disponibilidad con `serviceIds` (el motor de F4.5a ya filtra
 *   empleados capaces).
 * - Devuelve la primera fila + `groupBookingId` + `groupTotalPrice`
 *   (suma de precios) y envía UN solo email con el listado de
 *   servicios y el total (cancelUrl = token de la primera fila).
 */

import Client from '../../../domain/entities/Client';
import type Employee from '../../../domain/entities/Employee';
import type Service from '../../../domain/entities/Service';
import Reservation, { buildActiveKey } from '../../../domain/entities/Reservation';
import type { ReservationWithRelations } from '../../interfaces/IReservationRepository';
import IReservationRepository from '../../interfaces/IReservationRepository';
import IEmployeeRepository from '../../interfaces/IEmployeeRepository';
import IServiceRepository from '../../interfaces/IServiceRepository';
import IClientRepository from '../../interfaces/IClientRepository';
import ITenantRepository from '../../interfaces/ITenantRepository';
import FindOrCreateClientUseCase from '../clients/FindOrCreateClientUseCase';
import GetAvailabilityUseCase, {
  type AvailabilityResult,
} from './GetAvailabilityUseCase';
import { CreateReservationInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';
import EmailService, { getFrontendOrigin } from '../../../infrastructure/email/EmailService';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../../infrastructure/errors';
import {
  DATE_START_TIME_MISMATCH,
  NO_EMPLOYEE_AVAILABLE,
  RESERVATION_NOT_FOUND,
  RESERVATION_OVERLAP,
} from '../../../infrastructure/errors/mr-codes';
import { localDateString } from '../../../domain/utils/TimezoneService';
import genUUID from '../../../domain/utils/genUUID';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const NO_EMPLOYEE_MESSAGE = 'No active employee is available for the requested slot';

/**
 * Resultado del POST: la primera fila del (posible) grupo + el total
 * del grupo cuando aplica. `reservationResponse()` lo refleja.
 */
export type CreateReservationResult = ReservationWithRelations & {
  groupTotalPrice?: number;
};

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
    private readonly getAvailability: GetAvailabilityUseCase,
    private readonly bitacoraService: BitacoraService,
    private readonly emailService: EmailService
  ) {}

  async execute(
    input: CreateReservationInput,
    tenantId: string,
    createdBy: string
  ): Promise<CreateReservationResult> {
    logger.info(
      { tenantId, employeeId: input.employeeId, serviceId: input.serviceId, serviceIds: input.serviceIds, createdBy },
      'CreateReservationUseCase: starting'
    );

    if (!DATE_PATTERN.test(input.date)) {
      throw new ValidationError('date must be a YYYY-MM-DD string');
    }
    const startTimeUTC = new Date(input.startTimeUTC);
    if (Number.isNaN(startTimeUTC.getTime())) {
      throw new ValidationError('startTimeUTC must be a valid ISO date');
    }
    if (startTimeUTC.getTime() < Date.now()) {
      throw new ValidationError('Reservation cannot be in the past');
    }
    const date = new Date(`${input.date}T00:00:00.000Z`);

    // F4.2 deuda: `date` debe ser el día calendario local (zona del
    // tenant) de `startTimeUTC` — si no, el filtro sameDay/index del
    // activeKey miraría otro día. Zona del tenant = datos fiables
    // (validados al crear el tenant).
    const tenant = await this.tenantRepository.findById(tenantId);
    const timezone = (input.timezone ?? '').trim() || tenant?.timezone || 'UTC';
    const tenantTimezone = tenant?.timezone || 'UTC';
    if (localDateString(startTimeUTC, tenantTimezone) !== input.date) {
      throw new ValidationError(
        `date must be the local day (${tenantTimezone}) of startTimeUTC — got ${input.date}, expected ${localDateString(startTimeUTC, tenantTimezone)}`,
        DATE_START_TIME_MISMATCH
      );
    }

    // F4.4c: sin employeeId ("sin preferencia") → asignación por
    // disponibilidad sobre la ventana exacta del slot pedido. Un valor
    // no string (garbage de API) NO cuenta como "sin preferencia":
    // sigue fallando igual que el resto de ids (serviceId, clientId).
    const requestedEmployeeId = input.employeeId;
    const withoutPreference =
      requestedEmployeeId == null ||
      (typeof requestedEmployeeId === 'string' && requestedEmployeeId.trim() === '');

    // F4.5b: servicios — `serviceIds` (multi) o `serviceId` clásico.
    const requestedIds = this.normalizeServiceIds(input.serviceIds);
    const isGroup = requestedIds.length > 1;
    let services: Service[];
    if (isGroup) {
      services = await this.loadServices(requestedIds, tenantId);
    } else {
      const singleId = requestedIds[0] ?? input.serviceId;
      if (!singleId) {
        throw new ValidationError('serviceId is required');
      }
      const single = await this.serviceRepository.findById(singleId);
      if (!single || single.tenantId !== tenantId) {
        throw new ValidationError('serviceId does not reference a service of this tenant');
      }
      if (!single.isActive) {
        throw new ValidationError('service is not active');
      }
      services = [single];
    }
    const service = services[0];
    const totalDuration = services.reduce((sum, item) => sum + item.duration, 0);

    let duration: number;
    if (isGroup) {
      if (input.duration !== undefined && input.duration !== totalDuration) {
        throw new ValidationError('duration must match the total service duration');
      }
      this.assertTotalWithinLimit(totalDuration, tenant?.settings);
      duration = totalDuration;
    } else {
      duration = input.duration ?? service.duration;
      if (duration !== service.duration) {
        throw new ValidationError('duration must match the service duration');
      }
    }

    const employee = withoutPreference
      ? await this.assignEmployee(
          tenantId,
          startTimeUTC,
          duration,
          isGroup ? requestedIds.join(',') : undefined
        )
      : await this.requireEmployee(requestedEmployeeId as string, tenantId);
    if (isGroup && !this.offersAll(employee, requestedIds)) {
      // Con preferencia explícita el backend comprueba la capacidad
      // (decisión F4.5b #2). Sin preferencia el motor de F4.5a ya
      // filtra empleados capaces: si aun así llega aquí no hay nadie
      // que cubra el bloque entero.
      if (withoutPreference) {
        throw new ConflictError(NO_EMPLOYEE_MESSAGE, NO_EMPLOYEE_AVAILABLE);
      }
      throw new ValidationError('employee does not offer all the requested services');
    }

    // Cliente: existente (clientId) o interno (client data)
    let client: Client;
    if (input.clientId) {
      const existing = await this.clientRepository.findById(input.clientId);
      if (!existing || existing.tenantId !== tenantId) {
        throw new ValidationError('clientId does not reference a client of this tenant');
      }
      client = existing;
    } else if (input.client) {
      client = await this.findOrCreateClient.execute(input.client, tenantId, startTimeUTC);
    } else {
      throw new ValidationError('client or client data is required');
    }

    const status = input.status ?? 'confirmed';
    if (status !== 'pending' && status !== 'confirmed') {
      throw new ValidationError('Reservation status must be pending or confirmed');
    }

    // F4.5b: plan de filas — tramos encadenados en el orden del
    // request (`start_i = start + Σ durations[0..i-1]`) con `date`
    // local por fila (el bloque puede cruzar medianoche).
    const groupBookingId = isGroup ? genUUID('grp') : null;
    let cursor = startTimeUTC.getTime();
    const rowPlan = services.map((item) => {
      const start = new Date(cursor);
      cursor += item.duration * 60_000;
      return {
        service: item,
        start,
        date: new Date(`${localDateString(start, tenantTimezone)}T00:00:00.000Z`),
      };
    });

    // Solapamiento.
    if (isGroup) {
      // Por VENTANA TOTAL (no por `date` de cada fila): evita mirar
      // otro día cuando el bloque cruza medianoche. Luego el
      // activeKey exacto de cada fila.
      const totalEnd = new Date(startTimeUTC.getTime() + totalDuration * 60_000);
      const ranges = await this.reservationRepository.findActiveRanges(
        tenantId,
        employee.id,
        startTimeUTC,
        totalEnd
      );
      if (ranges.length > 0) {
        throw new ConflictError('Reservation overlaps an existing reservation', RESERVATION_OVERLAP);
      }
      for (const row of rowPlan) {
        const exact = await this.reservationRepository.findByActiveKey(
          buildActiveKey(employee.id, row.date, row.start)
        );
        if (exact) {
          throw new ConflictError('Reservation overlaps an existing reservation', RESERVATION_OVERLAP);
        }
      }
    } else {
      // 1) activeKey exacto; 2) intersección de intervalos del día.
      const activeKey = buildActiveKey(employee.id, date, startTimeUTC);
      const exact = await this.reservationRepository.findByActiveKey(activeKey);
      if (exact) {
        throw new ConflictError('Reservation overlaps an existing reservation', RESERVATION_OVERLAP);
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
        throw new ConflictError('Reservation overlaps an existing reservation', RESERVATION_OVERLAP);
      }
    }

    // VOs de la entity (notes/duration/date) → ValidationError (F4.2)
    let rows: Reservation[];
    try {
      rows = rowPlan.map((row) =>
        Reservation.create({
          tenantId,
          clientId: client.id,
          employeeId: employee.id,
          serviceId: row.service.id,
          date: row.date,
          startTimeUTC: row.start,
          duration: row.service.duration,
          timezone,
          notes: input.notes ?? null,
          status,
          groupBookingId,
        })
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid reservation data');
    }
    const reservation = rows[0];

    try {
      if (isGroup) {
        // F4.5b #5: todo o nada — o se crean las N filas o ninguna.
        await this.reservationRepository.saveMany(rows);
      } else {
        await this.reservationRepository.save(reservation);
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Carrera sobre activeKey: otro mismo slot se insertó a la vez
        throw new ConflictError('Reservation overlaps an existing reservation', RESERVATION_OVERLAP);
      }
      throw error;
    }

    // 1 entrada por reserva simple / 1 por grupo (no por fila).
    await this.bitacoraService.log({
      userId: createdBy,
      action: 'create_reservation',
      entityType: 'reservation',
      entityId: groupBookingId ?? reservation.id,
      metadata: {
        date: input.date,
        startTimeUTC: reservation.startTimeUTC.toISOString(),
        employeeId: employee.id,
        serviceId: service.id,
        clientId: client.id,
        status: reservation.status,
        ...(groupBookingId
          ? { groupBookingId, serviceIds: requestedIds, groupRows: rows.length, totalDuration }
          : {}),
      },
    });

    // Email de confirmación (nunca bloquea). 1 email por grupo,
    // listando servicios y total; cancelUrl = token de la primera fila.
    if (client.email) {
      try {
        const origin = getFrontendOrigin();
        const cancelUrl = `${origin}/reservations/cancel/${reservation.cancelToken}`;
        const groupLines = services.map(
          (item, index) =>
            `${index + 1}. ${item.name.getValue()} (${item.duration} min${
              item.price === null ? '' : `, ${item.price}`
            })`
        );
        const text = [
          `Hi ${client.firstName},`,
          '',
          'Your reservation is confirmed:',
          ...(isGroup
            ? [
                'Services:',
                ...groupLines,
                `Total: ${services.reduce((sum, item) => sum + (item.price ?? 0), 0)}`,
              ]
            : [`Service: ${service.name.getValue()}`]),
          `Employee: ${employee.name.getValue()}`,
          `Date: ${input.date} (${timezone}), ${startTimeUTC.toISOString().slice(11, 16)} UTC`,
          `Duration: ${duration} min`,
          '',
          `Cancel it here: ${cancelUrl}`,
        ].join('\n');
        await this.emailService.send({
          to: client.email,
          subject: `Reservation confirmed - ${services.map((item) => item.name.getValue()).join(' + ')}`,
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
      throw new NotFoundError('Reservation not found', RESERVATION_NOT_FOUND);
    }
    logger.info(
      { reservationId: reservation.id, groupBookingId },
      'CreateReservationUseCase: completed'
    );
    if (groupBookingId) {
      return {
        ...view,
        groupTotalPrice: services.reduce((sum, item) => sum + (item.price ?? 0), 0),
      };
    }
    return view;
  }

  /** Employee explícito: tiene que existir, ser del tenant y estar activo. */
  private async requireEmployee(employeeId: string, tenantId: string): Promise<Employee> {
    const employee = await this.employeeRepository.findById(employeeId);
    if (!employee || employee.tenantId !== tenantId) {
      throw new ValidationError('employeeId does not reference an employee of this tenant');
    }
    if (!employee.isActive) {
      throw new ValidationError('employee is not active');
    }
    return employee;
  }

  /**
   * F4.5b: `serviceIds` del body → lista saneada. Repeticiones
   * permitidas (es solo una lista de tramos) y orden = orden del
   * request. Sin `serviceIds` → `[]` (camino clásico con `serviceId`).
   *
   * @throws {ValidationError} 400 si no es un array de strings o si,
   * habiendo llegado, no queda ningún id.
   */
  private normalizeServiceIds(serviceIds: unknown): string[] {
    if (serviceIds === undefined || serviceIds === null) return [];
    if (!Array.isArray(serviceIds)) {
      throw new ValidationError('serviceIds must be an array of strings');
    }
    const ids: string[] = [];
    for (const raw of serviceIds) {
      if (typeof raw !== 'string') {
        throw new ValidationError('serviceIds must be an array of strings');
      }
      const trimmed = raw.trim();
      if (trimmed !== '') ids.push(trimmed);
    }
    if (ids.length === 0) {
      throw new ValidationError('serviceIds is required');
    }
    return ids;
  }

  /**
   * F4.5b: carga N servicios respetando el orden del request (con
   * caché para las repeticiones). Todos del tenant y activos.
   */
  private async loadServices(ids: string[], tenantId: string): Promise<Service[]> {
    const cache = new Map<string, Service>();
    const services: Service[] = [];
    for (const id of ids) {
      const cached = cache.get(id);
      if (cached) {
        services.push(cached);
        continue;
      }
      const service = await this.serviceRepository.findById(id);
      if (!service || service.tenantId !== tenantId) {
        throw new ValidationError('serviceId does not reference a service of this tenant');
      }
      if (!service.isActive) {
        throw new ValidationError('service is not active');
      }
      cache.set(id, service);
      services.push(service);
    }
    return services;
  }

  /**
   * F4.5b: techo de bloque (`TenantSettings.maxServiceDuration`). Solo
   * se valida si el tenant lo define explícitamente en su JSON.
   */
  private assertTotalWithinLimit(totalDuration: number, settings: unknown): void {
    const raw = (settings ?? {}) as { maxServiceDuration?: unknown };
    const max = typeof raw.maxServiceDuration === 'number' ? raw.maxServiceDuration : null;
    if (max !== null && totalDuration > max) {
      throw new ValidationError(`serviceIds total duration must be at most ${max} minutes`);
    }
  }

  /** F4.5b: el empleado ofrece TODOS los servicios del grupo. */
  private offersAll(employee: Employee, serviceIds: string[]): boolean {
    if (employee.offersAllServices) return true;
    return serviceIds.every((id) => employee.serviceIds.includes(id));
  }

  /**
   * F4.4c — asignación automática ("sin preferencia"). Pregunta a
   * GetAvailability la ventana exacta `[start, start + duration)` con
   * limit=1: como el rango empieza en el inicio pedido, el primer slot
   * devuelto ES ese instante y su `employeeId` es el empleado libre.
   *
   * F4.5b: con `serviceIdsCsv` (grupo) se pide disponibilidad en modo
   * multi-servicio — el motor de F4.5a filtra empleados que no ofrecen
   * todos los servicios y usa la suma como ancho.
   *
   * Sin hueco (fuera de horario, festivo, todo ocupado o sin empleados
   * activos) → 409 `NO_EMPLOYEE_AVAILABLE`. La carrera con otra reserva
   * que se cuela al mismo empleado/slot la resuelve `@@unique` → 409
   * overlap; aquí no se reintenta (el cliente pide otra hora).
   */
  private async assignEmployee(
    tenantId: string,
    startTimeUTC: Date,
    duration: number,
    serviceIdsCsv?: string
  ): Promise<Employee> {
    const endTimeUTC = new Date(startTimeUTC.getTime() + duration * 60_000);
    let result: AvailabilityResult;
    try {
      result = await this.getAvailability.execute(
        tenantId,
        {
          ...(serviceIdsCsv ? { serviceIds: serviceIdsCsv } : { duration }),
          from: startTimeUTC.toISOString(),
          to: endTimeUTC.toISOString(),
          limit: 1,
        },
        new Date()
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(
        error instanceof Error ? error.message : 'Availability could not be computed'
      );
    }

    const slot = result.slots[0];
    const assignedId = slot?.employeeId;
    if (!slot || !assignedId || Date.parse(slot.startUTC) !== startTimeUTC.getTime()) {
      throw new ConflictError(NO_EMPLOYEE_MESSAGE, NO_EMPLOYEE_AVAILABLE);
    }

    const employee = await this.employeeRepository.findById(assignedId);
    if (!employee || employee.tenantId !== tenantId || !employee.isActive) {
      throw new ConflictError(NO_EMPLOYEE_MESSAGE, NO_EMPLOYEE_AVAILABLE);
    }
    logger.info({ tenantId, employeeId: employee.id }, 'CreateReservationUseCase: employee assigned');
    return employee;
  }
}
