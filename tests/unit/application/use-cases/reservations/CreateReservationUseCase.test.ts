/**
 * @file CreateReservationUseCase.test.ts
 * @module tests/unit/application/use-cases/reservations
 *
 * Validaciones F3.3 #6: refs al tenant, employee/service activos,
 * fecha futura, duration == Service.duration, solapamiento (activeKey
 * + intervalos), cliente existente o interno y email de confirmación.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import CreateReservationUseCase from '../../../../../backend/src/application/use-cases/reservations/CreateReservationUseCase';
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

function makeService(id = 'svc-1', tenantId = 'tenant-demo', isActive = true): Service {
  return Service.create(
    { id, tenantId, name: ServiceName.create('Haircut'), duration: 30, price: 25, isActive },
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
  let bitacoraService: jest.Mocked<BitacoraService>;
  let emailService: jest.Mocked<EmailService>;
  let lastSaved: Reservation | null;

  beforeEach(() => {
    lastSaved = null;
    reservationRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn().mockResolvedValue([]),
      findByActiveKey: vi.fn().mockResolvedValue(null),
      findByCancelToken: vi.fn().mockResolvedValue(null),
      save: vi.fn(async (reservation: Reservation) => {
        lastSaved = reservation;
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
});
