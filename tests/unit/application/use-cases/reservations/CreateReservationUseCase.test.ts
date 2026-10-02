/**
 * @file CreateReservationUseCase.test.ts
 * @module tests/unit/application/use-cases/reservations
 *
 * Validaciones F3.3 #6: refs al tenant, employee/service activos,
 * fecha futura, duration == Service.duration, solapamiento (activeKey
 * + intervalos), cliente existente o interno y email de confirmación.
 *
 * F4.4c "sin preferencia": employeeId opcional → asignación por
 * disponibilidad (GetAvailability limit=1), 409 NO_EMPLOYEE_AVAILABLE
 * cuando nadie encaja y carrera P2002 → 409 overlap sin reintentos.
 *
 * F4.5b (multi-servicio): `serviceIds` construye N filas encadenadas
 * con `groupBookingId`, validación por ventana total, `saveMany`
 * transaccional, capacidad del empleado y respuesta con
 * `groupTotalPrice`.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import CreateReservationUseCase from '../../../../../backend/src/application/use-cases/reservations/CreateReservationUseCase';
import type GetAvailabilityUseCase from '../../../../../backend/src/application/use-cases/reservations/GetAvailabilityUseCase';
import FindOrCreateClientUseCase from '../../../../../backend/src/application/use-cases/clients/FindOrCreateClientUseCase';
import Reservation from '../../../../../backend/src/domain/entities/Reservation';
import Client from '../../../../../backend/src/domain/entities/Client';
import Employee from '../../../../../backend/src/domain/entities/Employee';
import EmployeeName from '../../../../../backend/src/domain/value-objects/EmployeeName';
import Service from '../../../../../backend/src/domain/entities/Service';
import ServiceName from '../../../../../backend/src/domain/value-objects/ServiceName';
import BookingSettings from '../../../../../backend/src/domain/value-objects/BookingSettings';
import type IReservationRepository from '../../../../../backend/src/application/interfaces/IReservationRepository';
import type { ReservationWithRelations } from '../../../../../backend/src/application/interfaces/IReservationRepository';
import type IEmployeeRepository from '../../../../../backend/src/application/interfaces/IEmployeeRepository';
import type IServiceRepository from '../../../../../backend/src/application/interfaces/IServiceRepository';
import type IClientRepository from '../../../../../backend/src/application/interfaces/IClientRepository';
import type ITenantRepository from '../../../../../backend/src/application/interfaces/ITenantRepository';
import type BitacoraService from '../../../../../backend/src/infrastructure/logging/BitacoraService';
import type EmailService from '../../../../../backend/src/infrastructure/email/EmailService';
import { NO_EMPLOYEE_AVAILABLE, RESERVATION_OVERLAP } from '../../../../../backend/src/infrastructure/errors/mr-codes';

const settings = BookingSettings.fromTenantSettings({});

function futureStart(hour = 10, daysAhead = 7): Date {
  const start = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  start.setUTCHours(hour, 0, 0, 0);
  return start;
}

function dayOf(start: Date): Date {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
}

function makeView(reservation: Reservation): ReservationWithRelations {
  return {
    reservation,
    client: { id: 'cli-1', firstName: 'Laura', lastName: 'Gómez', email: 'laura@example.com', phone: '+34600111222' },
    employee: { id: 'emp-1', name: 'Demo Employee', isActive: true },
    service: { id: 'svc-1', name: 'Haircut', duration: 30, price: 25 },
  };
}

function makeEmployee(id = 'emp-1', tenantId = 'tenant-demo', isActive = true): Employee {
  return Employee.create({ id, tenantId, name: EmployeeName.create('Demo Employee'), isActive });
}

function makeService(
  id = 'svc-1',
  tenantId = 'tenant-demo',
  isActive = true,
  duration = 30
): Service {
  return Service.create(
    { id, tenantId, name: ServiceName.create('Haircut'), duration, price: 25, isActive },
    settings
  );
}

function makeClient(): Client {
  return Client.create({
    id: 'cli-1',
    tenantId: 'tenant-demo',
    firstName: 'Laura',
    lastName: 'Gómez',
    phone: '+34600111222',
    email: 'laura@example.com',
  });
}

function makeInput(overrides: Record<string, unknown> = {}) {
  const start = futureStart(10);
  return {
    employeeId: 'emp-1',
    serviceId: 'svc-1',
    date: start.toISOString().slice(0, 10),
    startTimeUTC: start.toISOString(),
    client: {
      firstName: 'Laura',
      lastName: 'Gómez',
      phone: '+34600111222',
      email: 'laura@example.com',
    },
    ...overrides,
  };
}

describe('CreateReservationUseCase', () => {
  let useCase: CreateReservationUseCase;
  let reservationRepo: jest.Mocked<IReservationRepository>;
  let employeeRepo: jest.Mocked<IEmployeeRepository>;
  let serviceRepo: jest.Mocked<IServiceRepository>;
  let clientRepo: jest.Mocked<IClientRepository>;
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let findOrCreateClient: jest.Mocked<FindOrCreateClientUseCase>;
  let getAvailability: jest.Mocked<GetAvailabilityUseCase>;
  let bitacoraService: jest.Mocked<BitacoraService>;
  let emailService: jest.Mocked<EmailService>;
  let lastSaved: Reservation | null;
  let savedRows: Reservation[];

  beforeEach(() => {
    lastSaved = null;
    savedRows = [];
    reservationRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn().mockResolvedValue([]),
      findByActiveKey: vi.fn().mockResolvedValue(null),
      findByCancelToken: vi.fn().mockResolvedValue(null),
      findActiveRanges: vi.fn().mockResolvedValue([]),
      findByGroupBookingId: vi.fn().mockResolvedValue([]),
      findGroupTotals: vi.fn().mockResolvedValue({}),
      save: vi.fn(async (reservation: Reservation) => {
        lastSaved = reservation;
      }),
      saveMany: vi.fn(async (reservations: Reservation[]) => {
        savedRows = reservations;
        lastSaved = reservations[0] ?? null;
      }),
    };
    employeeRepo = { findById: vi.fn().mockResolvedValue(makeEmployee()), findByTenantId: vi.fn(), save: vi.fn() } as unknown as jest.Mocked<IEmployeeRepository>;
    serviceRepo = { findById: vi.fn().mockResolvedValue(makeService()), findByTenantId: vi.fn(), findByIds: vi.fn(), save: vi.fn() } as unknown as jest.Mocked<IServiceRepository>;
    clientRepo = { findById: vi.fn().mockResolvedValue(null), findByTenantAndPhone: vi.fn(), findByTenantAndEmail: vi.fn(), save: vi.fn() } as unknown as jest.Mocked<IClientRepository>;
    tenantRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'tenant-demo', settings: {}, timezone: 'UTC' }),
      save: vi.fn(),
    } as unknown as jest.Mocked<ITenantRepository>;
    findOrCreateClient = {
      execute: vi.fn().mockResolvedValue(makeClient()),
    } as unknown as jest.Mocked<FindOrCreateClientUseCase>;
    getAvailability = {
      execute: vi.fn().mockResolvedValue({ slots: [], hasMore: false }),
    } as unknown as jest.Mocked<GetAvailabilityUseCase>;
    bitacoraService = { log: vi.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<BitacoraService>;
    emailService = { send: vi.fn().mockResolvedValue(true) } as unknown as jest.Mocked<EmailService>;
    reservationRepo.findById.mockImplementation(async () => (lastSaved ? makeView(lastSaved) : null));

    useCase = new CreateReservationUseCase(
      reservationRepo,
      employeeRepo,
      serviceRepo,
      clientRepo,
      tenantRepo,
      findOrCreateClient,
      getAvailability,
      bitacoraService,
      emailService
    );
  });

  it('crea una reserva confirmed con cliente interno, activeKey, cancelToken, bitacora y email', async () => {
    const view = await useCase.execute(makeInput(), 'tenant-demo', 'usr-owner');

    expect(view.reservation.id.startsWith('res-')).toBe(true);
    expect(view.reservation.status).toBe('confirmed');
    expect(view.reservation.activeKey).toBeTruthy();
    expect(view.reservation.cancelToken).toHaveLength(21);
    expect(findOrCreateClient.execute).toHaveBeenCalledTimes(1);
    expect(reservationRepo.save).toHaveBeenCalledTimes(1);
    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'usr-owner', action: 'create_reservation', entityType: 'reservation' })
    );
    expect(emailService.send).toHaveBeenCalledTimes(1);
    const emailArg = emailService.send.mock.calls[0][0];
    expect(emailArg.to).toBe('laura@example.com');
    expect(emailArg.subject).toContain('Haircut');
    expect(emailArg.text).toContain('/reservations/cancel/');
  });

  it('sin email en el cliente → no envía email', async () => {
    findOrCreateClient.execute.mockResolvedValue(
      Client.create({ tenantId: 'tenant-demo', firstName: 'Laura', lastName: 'Gómez', phone: '+34600111222' })
    );

    await useCase.execute(makeInput({ client: { firstName: 'Laura', lastName: 'Gómez', phone: '+34600111222' } }), 'tenant-demo', 'usr-owner');

    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('clientId existente del tenant → lo usa sin llamar a findOrCreate', async () => {
    clientRepo.findById.mockResolvedValue(makeClient());

    const view = await useCase.execute(makeInput({ client: undefined, clientId: 'cli-1' }), 'tenant-demo', 'usr-owner');

    expect(findOrCreateClient.execute).not.toHaveBeenCalled();
    expect(view.reservation.clientId).toBe('cli-1');
    expect(clientRepo.findById).toHaveBeenCalledWith('cli-1');
  });

  it('clientId de otro tenant → throw y no guarda', async () => {
    clientRepo.findById.mockResolvedValue(
      Client.create({ tenantId: 'tenant-other', firstName: 'Otro', lastName: 'Cliente', phone: '+34600000000' })
    );

    await expect(
      useCase.execute(makeInput({ client: undefined, clientId: 'cli-foreign' }), 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('clientId does not reference a client of this tenant');
    expect(reservationRepo.save).not.toHaveBeenCalled();
  });

  it('sin client ni clientId → throw', async () => {
    await expect(
      useCase.execute(makeInput({ client: undefined }), 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('client or client data is required');
    expect(reservationRepo.save).not.toHaveBeenCalled();
  });

  it('employeeId de otro tenant → throw', async () => {
    employeeRepo.findById.mockResolvedValue(makeEmployee('emp-other', 'tenant-other'));

    await expect(useCase.execute(makeInput(), 'tenant-demo', 'usr-owner')).rejects.toThrow(
      'employeeId does not reference an employee of this tenant'
    );
    expect(reservationRepo.save).not.toHaveBeenCalled();
  });

  it('employee inactivo → throw', async () => {
    employeeRepo.findById.mockResolvedValue(makeEmployee('emp-1', 'tenant-demo', false));

    await expect(useCase.execute(makeInput(), 'tenant-demo', 'usr-owner')).rejects.toThrow(
      'employee is not active'
    );
  });

  it('serviceId de otro tenant → throw', async () => {
    serviceRepo.findById.mockResolvedValue(makeService('svc-other', 'tenant-other'));

    await expect(useCase.execute(makeInput(), 'tenant-demo', 'usr-owner')).rejects.toThrow(
      'serviceId does not reference a service of this tenant'
    );
  });

  it('service inactivo → throw', async () => {
    serviceRepo.findById.mockResolvedValue(makeService('svc-1', 'tenant-demo', false));

    await expect(useCase.execute(makeInput(), 'tenant-demo', 'usr-owner')).rejects.toThrow(
      'service is not active'
    );
  });

  it('duration distinta a Service.duration → throw', async () => {
    await expect(useCase.execute(makeInput({ duration: 45 }), 'tenant-demo', 'usr-owner')).rejects.toThrow(
      'duration must match the service duration'
    );
    expect(reservationRepo.save).not.toHaveBeenCalled();
  });

  it('duration correcta explícita → la acepta', async () => {
    const view = await useCase.execute(makeInput({ duration: 30 }), 'tenant-demo', 'usr-owner');
    expect(view.reservation.duration).toBe(30);
  });

  it('fecha en el pasado → throw', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await expect(
      useCase.execute(
        makeInput({ date: past.toISOString().slice(0, 10), startTimeUTC: past.toISOString() }),
        'tenant-demo',
        'usr-owner'
      )
    ).rejects.toThrow('Reservation cannot be in the past');
    expect(reservationRepo.save).not.toHaveBeenCalled();
  });

  it('date con formato inválido → throw', async () => {
    await expect(useCase.execute(makeInput({ date: '05/10/2026' }), 'tenant-demo', 'usr-owner')).rejects.toThrow(
      'date must be a YYYY-MM-DD string'
    );
  });

  it('startTimeUTC inválido → throw', async () => {
    await expect(
      useCase.execute(makeInput({ startTimeUTC: 'nope' }), 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('startTimeUTC must be a valid ISO date');
  });

  it('mismo slot exacto (activeKey) → throw overlap', async () => {
    const base = futureStart(10);
    reservationRepo.findByActiveKey.mockResolvedValue(makeView(Reservation.create({
      tenantId: 'tenant-demo',
      clientId: 'cli-1',
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      date: dayOf(base),
      startTimeUTC: base,
      duration: 30,
      timezone: 'UTC',
    })));

    await expect(useCase.execute(makeInput(), 'tenant-demo', 'usr-owner')).rejects.toThrow(
      'Reservation overlaps an existing reservation'
    );
    expect(reservationRepo.save).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });

  it('solapamiento parcial de intervalo → throw overlap', async () => {
    const base = futureStart(10);
    const existing = Reservation.create({
      tenantId: 'tenant-demo',
      clientId: 'cli-1',
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      date: dayOf(base),
      startTimeUTC: base,
      duration: 60, // 10:00-11:00
      timezone: 'UTC',
    });
    reservationRepo.findByTenantId.mockResolvedValue([makeView(existing)]);

    // 10:30-11:00 → solapa con 10:00-11:00
    const start = new Date(base.getTime() + 30 * 60_000);
    await expect(
      useCase.execute(makeInput({ date: start.toISOString().slice(0, 10), startTimeUTC: start.toISOString() }), 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Reservation overlaps an existing reservation');
    expect(reservationRepo.save).not.toHaveBeenCalled();
  });

  it('consulta al repo con el filtro employeeId+date (el repo real filtra por empleado)', async () => {
    const view = await useCase.execute(makeInput(), 'tenant-demo', 'usr-owner');

    expect(reservationRepo.findByTenantId).toHaveBeenCalledWith('tenant-demo', {
      employeeId: 'emp-1',
      date: view.reservation.date.toISOString().slice(0, 10),
    });
    expect(view.reservation.status).toBe('confirmed');
  });

  it('carrera P2002 sobre activeKey → se traduce en overlap', async () => {
    reservationRepo.save.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    );

    await expect(useCase.execute(makeInput(), 'tenant-demo', 'usr-owner')).rejects.toThrow(
      'Reservation overlaps an existing reservation'
    );
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });

  it('status pendiente explícito → pending', async () => {
    const view = await useCase.execute(makeInput({ status: 'pending' }), 'tenant-demo', 'usr-owner');
    expect(view.reservation.status).toBe('pending');
    expect(view.reservation.activeKey).toBeTruthy();
  });

  it('status terminal en create → throw', async () => {
    await expect(
      useCase.execute(makeInput({ status: 'cancelled' as 'pending' }), 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Reservation status must be pending or confirmed');
  });

  it('usa el timezone del tenant cuando no viene en el input', async () => {
    tenantRepo.findById.mockResolvedValue({ id: 'tenant-demo', settings: {}, timezone: 'Europe/Madrid' });

    await useCase.execute(makeInput(), 'tenant-demo', 'usr-owner');

    expect(lastSaved!.timezone).toBe('Europe/Madrid');
  });

  it('el timezone del input tiene prioridad sobre el del tenant', async () => {
    tenantRepo.findById.mockResolvedValue({ id: 'tenant-demo', settings: {}, timezone: 'Europe/Madrid' });

    await useCase.execute(makeInput({ timezone: 'America/New_York' }), 'tenant-demo', 'usr-owner');

    expect(lastSaved!.timezone).toBe('America/New_York');
  });

  it('pasa startTimeUTC como visitAt a findOrCreateClient (F3.3.1)', async () => {
    const view = await useCase.execute(makeInput(), 'tenant-demo', 'usr-owner');

    expect(findOrCreateClient.execute).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-demo',
      view.reservation.startTimeUTC
    );
  });

  it('el email que falla no bloquea la creación', async () => {
    emailService.send.mockRejectedValueOnce(new Error('smtp down'));

    const view = await useCase.execute(makeInput(), 'tenant-demo', 'usr-owner');

    expect(view.reservation.id).toBeTruthy();
    expect(reservationRepo.save).toHaveBeenCalledTimes(1);
    expect(bitacoraService.log).toHaveBeenCalledTimes(1);
  });

  // ── F4.4c "sin preferencia": asignación automática ──────

  function availabilityAt(employeeId: string, start: Date) {
    return {
      slots: [
        {
          startUTC: start.toISOString(),
          endUTC: new Date(start.getTime() + 30 * 60_000).toISOString(),
          localStart: '10:00',
          localEnd: '10:30',
          employeeId,
        },
      ],
      hasMore: false,
    };
  }

  function preferencelessInput(start: Date) {
    return makeInput({
      employeeId: undefined,
      date: start.toISOString().slice(0, 10),
      startTimeUTC: start.toISOString(),
    });
  }

  it('sin employeeId → asigna el empleado devuelto por GET /availability (F4.4c)', async () => {
    const start = futureStart(10);
    employeeRepo.findById.mockImplementation(async (id: string) => makeEmployee(id));
    getAvailability.execute.mockResolvedValue(availabilityAt('emp-2', start));

    const view = await useCase.execute(preferencelessInput(start), 'tenant-demo', 'usr-owner');

    expect(view.reservation.employeeId).toBe('emp-2');
    expect(getAvailability.execute).toHaveBeenCalledWith(
      'tenant-demo',
      {
        duration: 30,
        from: start.toISOString(),
        to: new Date(start.getTime() + 30 * 60_000).toISOString(),
        limit: 1,
      },
      expect.any(Date)
    );
    expect(reservationRepo.save).toHaveBeenCalledTimes(1);
  });

  it('employeeId en blanco → también asigna automáticamente', async () => {
    const start = futureStart(10);
    getAvailability.execute.mockResolvedValue(availabilityAt('emp-1', start));

    const view = await useCase.execute(
      { ...preferencelessInput(start), employeeId: '   ' },
      'tenant-demo',
      'usr-owner'
    );

    expect(view.reservation.employeeId).toBe('emp-1');
  });

  it('sin employeeId y ningún empleado libre → 409 NO_EMPLOYEE_AVAILABLE sin guardar', async () => {
    const start = futureStart(10);
    getAvailability.execute.mockResolvedValue({ slots: [], hasMore: false });

    await expect(
      useCase.execute(preferencelessInput(start), 'tenant-demo', 'usr-owner')
    ).rejects.toMatchObject({ status: 409, code: NO_EMPLOYEE_AVAILABLE });
    expect(reservationRepo.save).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });

  it('asignación con el slot devuelto desfasado → 409 (no confía en un start distinto)', async () => {
    const start = futureStart(10);
    getAvailability.execute.mockResolvedValue({
      slots: [
        {
          startUTC: new Date(start.getTime() + 15 * 60_000).toISOString(),
          endUTC: new Date(start.getTime() + 45 * 60_000).toISOString(),
          localStart: '10:15',
          localEnd: '10:45',
          employeeId: 'emp-1',
        },
      ],
      hasMore: false,
    });

    await expect(
      useCase.execute(preferencelessInput(start), 'tenant-demo', 'usr-owner')
    ).rejects.toMatchObject({ status: 409, code: NO_EMPLOYEE_AVAILABLE });
    expect(reservationRepo.save).not.toHaveBeenCalled();
  });

  it('carrera: el mismo empleado/slot asignado a la vez → P2002 → 409 overlap, sin reintentos', async () => {
    const start = futureStart(10);
    getAvailability.execute.mockResolvedValue(availabilityAt('emp-1', start));
    reservationRepo.save.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    );

    await expect(
      useCase.execute(preferencelessInput(start), 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Reservation overlaps an existing reservation');
    expect(getAvailability.execute).toHaveBeenCalledTimes(1);
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });

  it('si GET /availability falla (error genérico) → 400 y no guarda', async () => {
    getAvailability.execute.mockRejectedValue(new Error('duration must be a multiple of slotDuration'));

    await expect(
      useCase.execute(preferencelessInput(futureStart(10)), 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('duration must be a multiple of slotDuration');
    expect(reservationRepo.save).not.toHaveBeenCalled();
  });

  // ── F4.5b: multi-servicio seguido (grupos) ───────────────

  describe('F4.5b: serviceIds → grupo de reservas', () => {
    function mockTwoServices() {
      serviceRepo.findById.mockImplementation(async (id: string) => {
        if (id === 'svc-1') return makeService('svc-1', 'tenant-demo', true, 30);
        if (id === 'svc-2') return makeService('svc-2', 'tenant-demo', true, 15);
        return null;
      });
    }

    function groupInput(start: Date, overrides: Record<string, unknown> = {}) {
      return makeInput({
        serviceIds: ['svc-1', 'svc-2'],
        date: start.toISOString().slice(0, 10),
        startTimeUTC: start.toISOString(),
        ...overrides,
      });
    }

    function partialEmployee(serviceIds: string[], id = 'emp-1'): Employee {
      return Employee.create({
        id,
        tenantId: 'tenant-demo',
        name: EmployeeName.create('Demo Employee'),
        offersAllServices: false,
        serviceIds,
      });
    }

    it('2 servicios → saveMany con 2 filas, mismo grupo, inicio encadenado y total', async () => {
      mockTwoServices();
      const start = futureStart(10);

      const view = await useCase.execute(groupInput(start), 'tenant-demo', 'usr-owner');

      expect(reservationRepo.saveMany).toHaveBeenCalledTimes(1);
      expect(reservationRepo.save).not.toHaveBeenCalled();
      expect(savedRows).toHaveLength(2);

      const [first, second] = savedRows;
      expect(first.groupBookingId).toBeTruthy();
      expect(first.groupBookingId).toBe(second.groupBookingId);
      expect(first.serviceId).toBe('svc-1');
      expect(second.serviceId).toBe('svc-2');
      expect(first.duration).toBe(30);
      expect(second.duration).toBe(15);
      expect(second.startTimeUTC.getTime()).toBe(first.startTimeUTC.getTime() + 30 * 60_000);
      expect(first.startTimeUTC.getTime()).toBe(start.getTime());
      expect(second.date.getTime()).toBe(first.date.getTime());
      expect(first.activeKey).toBeTruthy();
      expect(second.activeKey).toBeTruthy();
      expect(first.activeKey).not.toBe(second.activeKey);
      expect(first.status).toBe('confirmed');

      expect(view.reservation.id).toBe(first.id);
      expect(view.reservation.groupBookingId).toBe(first.groupBookingId);
      expect(view.groupTotalPrice).toBe(50);

      expect(bitacoraService.log).toHaveBeenCalledTimes(1);
      expect(bitacoraService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'create_reservation', entityId: first.groupBookingId })
      );
    });

    it('1 email por grupo con servicios, total y token de la primera fila', async () => {
      mockTwoServices();

      await useCase.execute(groupInput(futureStart(10)), 'tenant-demo', 'usr-owner');

      expect(emailService.send).toHaveBeenCalledTimes(1);
      const arg = emailService.send.mock.calls[0][0];
      expect(arg.text).toContain('Services:');
      expect(arg.text).toContain('Total: 50');
      expect(arg.text).toContain(savedRows[0].cancelToken);
    });

    it('bloque que cruza medianoche → date por fila (día local distinto)', async () => {
      mockTwoServices();
      const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      start.setUTCHours(23, 45, 0, 0);

      await useCase.execute(groupInput(start), 'tenant-demo', 'usr-owner');

      expect(savedRows).toHaveLength(2);
      expect(savedRows[1].date.getTime() - savedRows[0].date.getTime()).toBe(86_400_000);
      expect(savedRows[1].startTimeUTC.getTime()).toBe(
        savedRows[0].startTimeUTC.getTime() + 30 * 60_000
      );
    });

    it('serviceIds con longitud 1 → reserva simple SIN grupo', async () => {
      const view = await useCase.execute(
        makeInput({ serviceIds: ['svc-1'] }),
        'tenant-demo',
        'usr-owner'
      );

      expect(reservationRepo.save).toHaveBeenCalledTimes(1);
      expect(reservationRepo.saveMany).not.toHaveBeenCalled();
      expect(view.reservation.groupBookingId).toBeNull();
      expect(view.groupTotalPrice).toBeUndefined();
    });

    it('serviceId clásico (sin serviceIds) → sigue creando 1 fila sin grupo', async () => {
      const view = await useCase.execute(makeInput(), 'tenant-demo', 'usr-owner');

      expect(reservationRepo.save).toHaveBeenCalledTimes(1);
      expect(reservationRepo.saveMany).not.toHaveBeenCalled();
      expect(view.reservation.groupBookingId).toBeNull();
    });

    it('serviceIds que no es un array → 400; vacío → 400', async () => {
      await expect(
        useCase.execute(
          makeInput({ serviceIds: 'svc-1,svc-2' as unknown as string[] }),
          'tenant-demo',
          'usr-owner'
        )
      ).rejects.toThrow('serviceIds must be an array of strings');

      await expect(
        useCase.execute(makeInput({ serviceIds: [] }), 'tenant-demo', 'usr-owner')
      ).rejects.toThrow('serviceIds is required');

      expect(reservationRepo.saveMany).not.toHaveBeenCalled();
    });

    it('servicio de otro tenant → 400 sin persistir', async () => {
      serviceRepo.findById.mockImplementation(async (id: string) =>
        id === 'svc-2'
          ? makeService('svc-2', 'tenant-other', true, 15)
          : makeService('svc-1', 'tenant-demo', true, 30)
      );

      await expect(
        useCase.execute(groupInput(futureStart(10)), 'tenant-demo', 'usr-owner')
      ).rejects.toThrow('serviceId does not reference a service of this tenant');
      expect(reservationRepo.saveMany).not.toHaveBeenCalled();
      expect(reservationRepo.save).not.toHaveBeenCalled();
    });

    it('servicio inactivo → 400 sin persistir', async () => {
      serviceRepo.findById.mockImplementation(async (id: string) =>
        id === 'svc-2'
          ? makeService('svc-2', 'tenant-demo', false, 15)
          : makeService('svc-1', 'tenant-demo', true, 30)
      );

      await expect(
        useCase.execute(groupInput(futureStart(10)), 'tenant-demo', 'usr-owner')
      ).rejects.toThrow('service is not active');
      expect(reservationRepo.saveMany).not.toHaveBeenCalled();
    });

    it('duration distinto de la suma → 400', async () => {
      mockTwoServices();

      await expect(
        useCase.execute(groupInput(futureStart(10), { duration: 30 }), 'tenant-demo', 'usr-owner')
      ).rejects.toThrow('duration must match the total service duration');
      expect(reservationRepo.saveMany).not.toHaveBeenCalled();
    });

    it('total por encima de maxServiceDuration del tenant → 400', async () => {
      mockTwoServices();
      tenantRepo.findById.mockResolvedValue({
        id: 'tenant-demo',
        settings: { maxServiceDuration: 30 },
        timezone: 'UTC',
      });

      await expect(
        useCase.execute(groupInput(futureStart(10)), 'tenant-demo', 'usr-owner')
      ).rejects.toThrow('serviceIds total duration must be at most 30 minutes');
      expect(reservationRepo.saveMany).not.toHaveBeenCalled();
    });

    it('employeeId explícito que no ofrece todos los servicios → 400', async () => {
      mockTwoServices();
      employeeRepo.findById.mockResolvedValue(partialEmployee(['svc-1']));

      await expect(
        useCase.execute(groupInput(futureStart(10)), 'tenant-demo', 'usr-owner')
      ).rejects.toThrow('employee does not offer all the requested services');
      expect(reservationRepo.saveMany).not.toHaveBeenCalled();
    });

    it('employeeId explícito con los servicios conectados → crea el grupo', async () => {
      mockTwoServices();
      employeeRepo.findById.mockResolvedValue(partialEmployee(['svc-1', 'svc-2']));

      await useCase.execute(groupInput(futureStart(10)), 'tenant-demo', 'usr-owner');

      expect(savedRows).toHaveLength(2);
      expect(savedRows[0].employeeId).toBe('emp-1');
    });

    it('sin preferencia → disponibilidad en modo serviceIds con ventana total', async () => {
      mockTwoServices();
      const start = futureStart(10);
      employeeRepo.findById.mockImplementation(async (id: string) => makeEmployee(id));
      getAvailability.execute.mockResolvedValue(availabilityAt('emp-2', start));

      const view = await useCase.execute(
        { ...preferencelessInput(start), serviceIds: ['svc-1', 'svc-2'] },
        'tenant-demo',
        'usr-owner'
      );

      expect(getAvailability.execute).toHaveBeenCalledWith(
        'tenant-demo',
        {
          serviceIds: 'svc-1,svc-2',
          from: start.toISOString(),
          to: new Date(start.getTime() + 45 * 60_000).toISOString(),
          limit: 1,
        },
        expect.any(Date)
      );
      expect(view.reservation.employeeId).toBe('emp-2');
      expect(view.reservation.groupBookingId).toBeTruthy();
      expect(savedRows).toHaveLength(2);
    });

    it('sin preferencia y sin hueco → 409 NO_EMPLOYEE_AVAILABLE sin persistir', async () => {
      mockTwoServices();
      getAvailability.execute.mockResolvedValue({ slots: [], hasMore: false });

      await expect(
        useCase.execute(
          { ...preferencelessInput(futureStart(10)), serviceIds: ['svc-1', 'svc-2'] },
          'tenant-demo',
          'usr-owner'
        )
      ).rejects.toMatchObject({ status: 409, code: NO_EMPLOYEE_AVAILABLE });
      expect(reservationRepo.saveMany).not.toHaveBeenCalled();
      expect(bitacoraService.log).not.toHaveBeenCalled();
    });

    it('solape dentro de la ventana total → 409 y 0 filas creadas', async () => {
      mockTwoServices();
      reservationRepo.findActiveRanges.mockResolvedValue([
        { start: new Date(), end: new Date(Date.now() + 60_000) },
      ]);

      await expect(
        useCase.execute(groupInput(futureStart(10)), 'tenant-demo', 'usr-owner')
      ).rejects.toMatchObject({ status: 409, code: RESERVATION_OVERLAP });
      expect(reservationRepo.saveMany).not.toHaveBeenCalled();
      expect(reservationRepo.save).not.toHaveBeenCalled();
      expect(bitacoraService.log).not.toHaveBeenCalled();
    });

    it('activeKey de una fila ya ocupado → 409 y 0 filas creadas', async () => {
      mockTwoServices();
      reservationRepo.findByActiveKey.mockResolvedValueOnce({
        reservation: savedRows[0],
      } as unknown as ReservationWithRelations);

      await expect(
        useCase.execute(groupInput(futureStart(10)), 'tenant-demo', 'usr-owner')
      ).rejects.toMatchObject({ status: 409, code: RESERVATION_OVERLAP });
      expect(reservationRepo.saveMany).not.toHaveBeenCalled();
    });

    it('P2002 en saveMany → 409 y nada persiste (sin bitácora ni email)', async () => {
      mockTwoServices();
      reservationRepo.saveMany.mockRejectedValueOnce(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
      );

      await expect(
        useCase.execute(groupInput(futureStart(10)), 'tenant-demo', 'usr-owner')
      ).rejects.toThrow('Reservation overlaps an existing reservation');
      expect(bitacoraService.log).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
      expect(reservationRepo.save).not.toHaveBeenCalled();
    });

    it('serviceIds duplicados → cuenta el tramo una vez por aparición', async () => {
      mockTwoServices();

      await useCase.execute(
        groupInput(futureStart(10), { serviceIds: ['svc-1', 'svc-1'] }),
        'tenant-demo',
        'usr-owner'
      );

      expect(savedRows).toHaveLength(2);
      expect(savedRows[1].startTimeUTC.getTime()).toBe(
        savedRows[0].startTimeUTC.getTime() + 30 * 60_000
      );
      expect(savedRows[0].activeKey).not.toBe(savedRows[1].activeKey);
      expect(savedRows[0].groupBookingId).toBe(savedRows[1].groupBookingId);
    });
  });
});
