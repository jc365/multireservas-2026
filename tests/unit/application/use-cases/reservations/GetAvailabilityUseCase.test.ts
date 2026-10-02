/**
 * @file GetAvailabilityUseCase.test.ts
 * @module tests/unit/application/use-cases/reservations
 *
 * F4.1a: los tres modos de ventana (ASAP / desde fecha / rango),
 * validaciones 400, paginación por `nextFrom` (último slot + 1 min),
 * horizonte de anticipación, ocupación por reservas, filtrado de
 * pasados, horario custom del employee y defaults del tenant.
 *
 * F4.4c "sin preferencia": sin `employeeId` se fusionan los slots de
 * todos los empleados activos y cada slot trae su `employeeId`.
 *
 * F4.5a (multi-servicio seguido): `serviceIds` exclusivo con
 * `duration`, suma de duraciones como ancho, validaciones de
 * servicios (tenant/inactivo/techo) y filtro de empleados capaces.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import GetAvailabilityUseCase, {
  type AvailabilityResult,
} from '../../../../../backend/src/application/use-cases/reservations/GetAvailabilityUseCase';
import Employee from '../../../../../backend/src/domain/entities/Employee';
import EmployeeName from '../../../../../backend/src/domain/value-objects/EmployeeName';
import Service from '../../../../../backend/src/domain/entities/Service';
import ServiceName from '../../../../../backend/src/domain/value-objects/ServiceName';
import type ITenantRepository from '../../../../../backend/src/application/interfaces/ITenantRepository';
import type IEmployeeRepository from '../../../../../backend/src/application/interfaces/IEmployeeRepository';
import type IReservationRepository from '../../../../../backend/src/application/interfaces/IReservationRepository';
import type IServiceRepository from '../../../../../backend/src/application/interfaces/IServiceRepository';

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const TENANT_RECORD = {
  id: 'tenant-demo',
  name: 'Tenant Demo',
  slug: 'demo',
  currency: 'EUR',
  timezone: 'UTC',
  settings: {},
  schedules: [
    { label: 'Todos', days: ALL_DAYS, start: '09:00', end: '17:00', breaks: [] },
  ],
  holidays: [],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const NOW = new Date('2026-10-14T08:00:00.000Z');

function makeEmployee(
  overrides: Partial<{
    id: string;
    customSchedule: Record<string, unknown> | null;
    customHolidays: Record<string, unknown> | null;
    isActive: boolean;
    tenantId: string;
    offersAllServices: boolean;
    serviceIds: string[];
  }> = {}
): Employee {
  return Employee.reconstitute({
    id: overrides.id ?? 'emp-1',
    tenantId: overrides.tenantId ?? 'tenant-demo',
    userId: null,
    name: EmployeeName.create('Ana Lopez'),
    email: null,
    phone: null,
    offersAllServices: overrides.offersAllServices ?? true,
    serviceIds: overrides.serviceIds ?? [],
    customSchedule: overrides.customSchedule ?? null,
    customHolidays: overrides.customHolidays ?? null,
    isActive: overrides.isActive ?? true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

function makeService(
  overrides: Partial<{
    id: string;
    tenantId: string;
    duration: number;
    isActive: boolean;
  }> = {}
): Service {
  return Service.reconstitute({
    id: overrides.id ?? 'svc-a',
    tenantId: overrides.tenantId ?? 'tenant-demo',
    name: ServiceName.create('Corte'),
    description: null,
    duration: overrides.duration ?? 15,
    price: 25,
    category: null,
    isActive: overrides.isActive ?? true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

describe('GetAvailabilityUseCase', () => {
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let employeeRepo: jest.Mocked<IEmployeeRepository>;
  let reservationRepo: jest.Mocked<IReservationRepository>;
  let serviceRepo: jest.Mocked<IServiceRepository>;
  let useCase: GetAvailabilityUseCase;

  beforeEach(() => {
    tenantRepo = {
      findByIdFull: vi.fn().mockResolvedValue({ ...TENANT_RECORD }),
    } as unknown as jest.Mocked<ITenantRepository>;
    employeeRepo = {
      findById: vi.fn().mockResolvedValue(makeEmployee()),
      findByTenantId: vi.fn().mockResolvedValue([makeEmployee()]),
    } as unknown as jest.Mocked<IEmployeeRepository>;
    reservationRepo = {
      findActiveRanges: vi.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<IReservationRepository>;
    serviceRepo = {
      findByIds: vi
        .fn()
        .mockResolvedValue([makeService(), makeService({ id: 'svc-b' })]),
    } as unknown as jest.Mocked<IServiceRepository>;
    useCase = new GetAvailabilityUseCase(tenantRepo, employeeRepo, reservationRepo, serviceRepo);
  });

  it('ASAP (sin from/to): now → now + advanceBookingLimit, limit por defecto', async () => {
    const result = await useCase.execute(
      'tenant-demo',
      { employeeId: 'emp-1', duration: 15 },
      NOW
    );

    expect(result.slots).toHaveLength(10);
    expect(result.hasMore).toBe(true);
    expect(result.slots[0].localStart).toBe('09:00');
    expect(Date.parse(result.slots[0].startUTC)).toBeGreaterThan(NOW.getTime());
    const expectedNextFrom = new Date(
      Date.parse(result.slots[9].startUTC) + 60_000
    ).toISOString();
    expect(result.nextFrom).toBe(expectedNextFrom);
  });

  it('desde fecha (from date-only sin to): el día entero disponible', async () => {
    const result = await useCase.execute(
      'tenant-demo',
      { employeeId: 'emp-1', duration: 15, from: '2026-10-15' },
      NOW
    );

    expect(result.slots).toHaveLength(10);
    expect(result.hasMore).toBe(true);
    expect(result.slots[0].localStart).toBe('09:00');
    expect(result.slots[0].startUTC.startsWith('2026-10-15')).toBe(true);
  });

  it('rango (from+to el mismo día): 32 slots con limit 50 y sin hasMore', async () => {
    const result = await useCase.execute(
      'tenant-demo',
      { employeeId: 'emp-1', duration: 15, from: '2026-10-15', to: '2026-10-15', limit: 50 },
      NOW
    );

    expect(result.slots).toHaveLength(32);
    expect(result.hasMore).toBe(false);
    expect(result.nextFrom).toBeUndefined();
    expect(result.slots.every((slot) => slot.startUTC.startsWith('2026-10-15'))).toBe(true);
    expect(result.slots[31].localEnd).toBe('17:00');
  });

  it('to sin from → 400', async () => {
    await expect(
      useCase.execute(
        'tenant-demo',
        { employeeId: 'emp-1', duration: 15, to: '2026-10-20' },
        NOW
      )
    ).rejects.toThrow('to requires from');
  });

  it('duration no múltiplo de slotDuration → 400', async () => {
    await expect(
      useCase.execute('tenant-demo', { employeeId: 'emp-1', duration: 17 }, NOW)
    ).rejects.toThrow('duration must be a multiple of slotDuration');
  });

  it('duration ausente o no entero → 400', async () => {
    await expect(
      useCase.execute('tenant-demo', { employeeId: 'emp-1' }, NOW)
    ).rejects.toThrow('duration is required');
    await expect(
      useCase.execute('tenant-demo', { employeeId: 'emp-1', duration: 'abc' }, NOW)
    ).rejects.toThrow('duration must be a positive integer');
  });

  it('employeeId no string (array) → 400', async () => {
    await expect(
      useCase.execute(
        'tenant-demo',
        { employeeId: ['emp-1', 'emp-2'] as unknown as string, duration: 15 },
        NOW
      )
    ).rejects.toThrow('employeeId must be a string');
  });

  it('employee de otro tenant o inexistente → 404', async () => {
    employeeRepo.findById.mockResolvedValue(makeEmployee({ tenantId: 'tenant-other' }));
    await expect(
      useCase.execute('tenant-demo', { employeeId: 'emp-1', duration: 15 }, NOW)
    ).rejects.toThrow('Employee not found');

    employeeRepo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute('tenant-demo', { employeeId: 'emp-x', duration: 15 }, NOW)
    ).rejects.toThrow('Employee not found');
  });

  it('paginación: page2 con from = nextFrom continúa sin solapes ni huecos', async () => {
    const page1 = await useCase.execute(
      'tenant-demo',
      { employeeId: 'emp-1', duration: 15, from: '2026-10-15', limit: 10 },
      NOW
    );
    const page2 = await useCase.execute(
      'tenant-demo',
      { employeeId: 'emp-1', duration: 15, from: page1.nextFrom, limit: 10 },
      NOW
    );

    expect(page1.slots).toHaveLength(10);
    expect(page2.slots).toHaveLength(10);
    const last1 = Date.parse(page1.slots[9].startUTC);
    const first2 = Date.parse(page2.slots[0].startUTC);
    expect(first2).toBeGreaterThan(last1);
    expect(first2 - last1).toBe(15 * 60_000);
    const starts = new Set([...page1.slots, ...page2.slots].map((s) => s.startUTC));
    expect(starts.size).toBe(20);
  });

  it('la reserva activa del employee ocupa su slot', async () => {
    reservationRepo.findActiveRanges.mockResolvedValue([
      { start: new Date('2026-10-15T09:00:00.000Z'), end: new Date('2026-10-15T09:15:00.000Z') },
    ]);

    const result = await useCase.execute(
      'tenant-demo',
      { employeeId: 'emp-1', duration: 15, from: '2026-10-15', limit: 5 },
      NOW
    );

    expect(result.slots[0].localStart).toBe('09:15');
    expect(result.slots.some((slot) => slot.localStart === '09:00')).toBe(false);
    expect(reservationRepo.findActiveRanges).toHaveBeenCalledWith(
      'tenant-demo',
      'emp-1',
      expect.any(Date),
      expect.any(Date)
    );
  });

  it('slots pasados no aparecen (now inyectado)', async () => {
    const result = await useCase.execute(
      'tenant-demo',
      { employeeId: 'emp-1', duration: 15, from: '2026-10-15', limit: 50 },
      new Date('2026-10-15T12:00:00.000Z')
    );

    expect(result.slots.every((slot) => Date.parse(slot.startUTC) > Date.parse('2026-10-15T12:00:00.000Z'))).toBe(
      true
    );
    expect(result.slots[0].localStart).toBe('12:15');
  });

  it('limit inválido → 400; limit por encima del máximo → 400', async () => {
    await expect(
      useCase.execute('tenant-demo', { employeeId: 'emp-1', duration: 15, limit: 0 }, NOW)
    ).rejects.toThrow('limit must be a positive integer');
    await expect(
      useCase.execute('tenant-demo', { employeeId: 'emp-1', duration: 15, limit: 60 }, NOW)
    ).rejects.toThrow('limit must be at most 50');
  });

  it('limit ausente → availabilityBatchSize del tenant', async () => {
    tenantRepo.findByIdFull.mockResolvedValue({
      ...TENANT_RECORD,
      settings: { availabilityBatchSize: 5 },
    });

    const result = await useCase.execute(
      'tenant-demo',
      { employeeId: 'emp-1', duration: 15 },
      NOW
    );
    expect(result.slots).toHaveLength(5);
  });

  it('horizonte: advanceBookingLimit recorta el to', async () => {
    tenantRepo.findByIdFull.mockResolvedValue({
      ...TENANT_RECORD,
      settings: { advanceBookingLimit: 1 },
    });

    const result = await useCase.execute(
      'tenant-demo',
      { employeeId: 'emp-1', duration: 15, limit: 50 },
      NOW
    );

    const horizon = NOW.getTime() + 24 * 60 * 60 * 1000;
    expect(result.slots.length).toBe(32);
    expect(result.slots.every((slot) => Date.parse(slot.endUTC) <= horizon)).toBe(true);
  });

  it('from más allá del horizonte → sin slots', async () => {
    tenantRepo.findByIdFull.mockResolvedValue({
      ...TENANT_RECORD,
      settings: { advanceBookingLimit: 1 },
    });

    const result = await useCase.execute(
      'tenant-demo',
      { employeeId: 'emp-1', duration: 15, from: '2030-01-01' },
      NOW
    );
    expect(result).toEqual({ slots: [], hasMore: false, duration: 15 });
  });

  it('customSchedule del employee ({blocks}) reemplaza al tenant', async () => {
    employeeRepo.findById.mockResolvedValue(
      makeEmployee({
        customSchedule: {
          blocks: [{ label: 'Custom', days: ALL_DAYS, start: '10:00', end: '12:00', breaks: [] }],
        },
      })
    );

    const result = await useCase.execute(
      'tenant-demo',
      { employeeId: 'emp-1', duration: 15, from: '2026-10-15', to: '2026-10-15', limit: 50 },
      NOW
    );

    expect(result.slots).toHaveLength(8);
    expect(result.slots[0].localStart).toBe('10:00');
    expect(result.slots[7].localEnd).toBe('12:00');
  });

  it('customSchedule con shape desconocido → 400', async () => {
    employeeRepo.findById.mockResolvedValue(
      makeEmployee({ customSchedule: { foo: 1 } as Record<string, unknown> })
    );

    await expect(
      useCase.execute('tenant-demo', { employeeId: 'emp-1', duration: 15 }, NOW)
    ).rejects.toThrow('employee customSchedule must be an array of schedule blocks');
  });

  it('employee inactivo → respuesta vacía (sin error)', async () => {
    employeeRepo.findById.mockResolvedValue(makeEmployee({ isActive: false }));

    const result = await useCase.execute(
      'tenant-demo',
      { employeeId: 'emp-1', duration: 15 },
      NOW
    );
    expect(result).toEqual({ slots: [], hasMore: false, duration: 15 });
    expect(reservationRepo.findActiveRanges).not.toHaveBeenCalled();
  });

  it('festivos del tenant excluyen el día', async () => {
    tenantRepo.findByIdFull.mockResolvedValue({
      ...TENANT_RECORD,
      holidays: [{ label: 'Puente', date: '2026-10-15', recurring: false }],
    });

    const result = await useCase.execute(
      'tenant-demo',
      { employeeId: 'emp-1', duration: 15, from: '2026-10-15', to: '2026-10-15', limit: 50 },
      NOW
    );
    expect(result.slots).toEqual([]);
  });

  it('tenant inexistente → 404', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(null);
    await expect(
      useCase.execute('tenant-demo', { employeeId: 'emp-1', duration: 15 }, NOW)
    ).rejects.toThrow('Tenant not found');
  });

  // ── F4.4c "sin preferencia": sin employeeId ─────────────

  const MORNING_ONLY = {
    id: 'emp-1',
    customSchedule: {
      blocks: [{ label: 'Mañana', days: ALL_DAYS, start: '09:00', end: '11:00', breaks: [] }],
    },
  };

  function useAllDayEmployees() {
    employeeRepo.findByTenantId.mockResolvedValue([
      makeEmployee(MORNING_ONLY),
      makeEmployee({ id: 'emp-2' }),
    ]);
  }

  it('sin employeeId → fusiona los slots de los activos y trae employeeId por slot', async () => {
    useAllDayEmployees();

    const result = await useCase.execute(
      'tenant-demo',
      { duration: 15, from: '2026-10-15', to: '2026-10-15', limit: 50 },
      NOW
    );

    expect(result.hasMore).toBe(false);
    expect(result.slots).toHaveLength(32);
    expect(result.slots[0]).toMatchObject({ localStart: '09:00', employeeId: 'emp-1' });
    expect(result.slots[7]).toMatchObject({ localStart: '10:45', employeeId: 'emp-1' });
    expect(result.slots[8]).toMatchObject({ localStart: '11:00', employeeId: 'emp-2' });
    expect(result.slots[31]).toMatchObject({ localEnd: '17:00', employeeId: 'emp-2' });
    expect(reservationRepo.findActiveRanges).toHaveBeenCalledWith(
      'tenant-demo',
      'emp-1',
      expect.any(Date),
      expect.any(Date)
    );
    expect(reservationRepo.findActiveRanges).toHaveBeenCalledWith(
      'tenant-demo',
      'emp-2',
      expect.any(Date),
      expect.any(Date)
    );
  });

  it('sin employeeId: la ocupación de un empleado cede su slot al siguiente', async () => {
    employeeRepo.findByTenantId.mockResolvedValue([
      makeEmployee({ id: 'emp-1' }),
      makeEmployee({ id: 'emp-2' }),
    ]);
    reservationRepo.findActiveRanges.mockImplementation(
      async (_tenantId: string, employeeId: string) =>
        employeeId === 'emp-1'
          ? [
              {
                start: new Date('2026-10-15T09:00:00.000Z'),
                end: new Date('2026-10-15T09:15:00.000Z'),
              },
            ]
          : []
    );

    const result = await useCase.execute(
      'tenant-demo',
      { duration: 15, from: '2026-10-15', to: '2026-10-15', limit: 50 },
      NOW
    );

    expect(result.slots[0]).toMatchObject({ localStart: '09:00', employeeId: 'emp-2' });
    expect(result.slots[1]).toMatchObject({ localStart: '09:15', employeeId: 'emp-1' });
    expect(result.slots).toHaveLength(32);
  });

  it('sin employeeId: paginación por nextFrom sobre la fusión', async () => {
    useAllDayEmployees();

    const page1 = await useCase.execute(
      'tenant-demo',
      { duration: 15, from: '2026-10-15', limit: 10 },
      NOW
    );
    const page2 = await useCase.execute(
      'tenant-demo',
      { duration: 15, from: page1.nextFrom, limit: 10 },
      NOW
    );

    expect(page1.slots).toHaveLength(10);
    expect(page1.hasMore).toBe(true);
    expect(page2.slots).toHaveLength(10);
    const starts = new Set([...page1.slots, ...page2.slots].map((slot) => slot.startUTC));
    expect(starts.size).toBe(20);
    expect(page1.slots.every((slot) => Boolean(slot.employeeId))).toBe(true);
  });

  it('sin employeeId y sin empleados activos → slots: []', async () => {
    employeeRepo.findByTenantId.mockResolvedValue([]);

    const result = await useCase.execute(
      'tenant-demo',
      { duration: 15, from: '2026-10-15', to: '2026-10-15', limit: 50 },
      NOW
    );

    expect(result).toEqual({ slots: [], hasMore: false, duration: 15 });
    expect(reservationRepo.findActiveRanges).not.toHaveBeenCalled();
  });

  it('sin employeeId: los empleados inactivos no aportan huecos', async () => {
    employeeRepo.findByTenantId.mockResolvedValue([
      makeEmployee({ id: 'emp-1', isActive: false }),
      makeEmployee({ id: 'emp-2', isActive: false }),
    ]);

    const result = await useCase.execute('tenant-demo', { duration: 15 }, NOW);

    expect(result).toEqual({ slots: [], hasMore: false, duration: 15 });
    expect(reservationRepo.findActiveRanges).not.toHaveBeenCalled();
  });

  it('sin employeeId: sigue validando duration y el par to/from', async () => {
    await expect(
      useCase.execute('tenant-demo', { duration: 17 }, NOW)
    ).rejects.toThrow('duration must be a multiple of slotDuration');
    await expect(
      useCase.execute('tenant-demo', { duration: 15, to: '2026-10-20' }, NOW)
    ).rejects.toThrow('to requires from');
  });

  describe('F4.5a: serviceIds (multi-servicio seguido)', () => {
    const WINDOW = { from: '2026-10-15', to: '2026-10-15', limit: 50 };

    it('suma las duraciones: ancho de slot = total y respuesta con duration', async () => {
      const result = await useCase.execute(
        'tenant-demo',
        { serviceIds: 'svc-a,svc-b', ...WINDOW },
        NOW
      );

      expect(result.duration).toBe(30);
      expect(result.hasMore).toBe(false);
      expect(result.slots.length).toBeGreaterThan(0);
      expect(result.slots[0].localStart).toBe('09:00');
      expect(result.slots[0].localEnd).toBe('09:30');
      for (const slot of result.slots) {
        expect(Date.parse(slot.endUTC) - Date.parse(slot.startUTC)).toBe(30 * 60_000);
      }
      expect(result.slots.every((slot) => slot.employeeId === 'emp-1')).toBe(true);
    });

    it('serviceIds + duration a la vez → 400', async () => {
      await expect(
        useCase.execute('tenant-demo', { serviceIds: 'svc-a', duration: 15 }, NOW)
      ).rejects.toThrow('serviceIds and duration must not be used together');
    });

    it('serviceIds repetido en la query (?a&b llega como array) → 400', async () => {
      await expect(
        useCase.execute(
          'tenant-demo',
          { serviceIds: ['svc-a', 'svc-b'] as unknown as string, ...WINDOW },
          NOW
        )
      ).rejects.toThrow('serviceIds must be a string');
    });

    it('serviceIds vacío o solo comas → 400', async () => {
      await expect(
        useCase.execute('tenant-demo', { serviceIds: ' , ', ...WINDOW }, NOW)
      ).rejects.toThrow('serviceIds is required');
    });

    it('sin serviceIds y sin duration → 400 (duration sigue siendo obligatorio)', async () => {
      await expect(
        useCase.execute('tenant-demo', { ...WINDOW }, NOW)
      ).rejects.toThrow('duration is required');
    });

    it('servicio inexistente o de otro tenant → 404', async () => {
      serviceRepo.findByIds.mockResolvedValue([makeService()]);
      await expect(
        useCase.execute('tenant-demo', { serviceIds: 'svc-a,svc-x', ...WINDOW }, NOW)
      ).rejects.toThrow('Service not found');

      serviceRepo.findByIds.mockResolvedValue([
        makeService({ id: 'svc-foreign', tenantId: 'tenant-other' }),
      ]);
      await expect(
        useCase.execute(
          'tenant-demo',
          { serviceIds: 'svc-foreign', ...WINDOW },
          NOW
        )
      ).rejects.toThrow('Service not found');
    });

    it('servicio inactivo → 400', async () => {
      serviceRepo.findByIds.mockResolvedValue([makeService({ isActive: false })]);
      await expect(
        useCase.execute('tenant-demo', { serviceIds: 'svc-a', ...WINDOW }, NOW)
      ).rejects.toThrow('service must be active');
    });

    it('total por encima de maxServiceDuration → 400', async () => {
      tenantRepo.findByIdFull.mockResolvedValue({
        ...TENANT_RECORD,
        settings: { maxServiceDuration: 15 },
      });

      await expect(
        useCase.execute('tenant-demo', { serviceIds: 'svc-a,svc-b', ...WINDOW }, NOW)
      ).rejects.toThrow('serviceIds total duration must be at most 15 minutes');
    });

    it('total igual a maxServiceDuration sí se permite (límite inclusivo)', async () => {
      tenantRepo.findByIdFull.mockResolvedValue({
        ...TENANT_RECORD,
        settings: { maxServiceDuration: 30 },
      });

      const result = await useCase.execute(
        'tenant-demo',
        { serviceIds: 'svc-a,svc-b', ...WINDOW },
        NOW
      );
      expect(result.duration).toBe(30);
      expect(result.slots.length).toBeGreaterThan(0);
    });

    it('ids duplicados cuentan una vez por aparición (svc-a,svc-a → 30)', async () => {
      const result = await useCase.execute(
        'tenant-demo',
        { serviceIds: 'svc-a,svc-a', ...WINDOW },
        NOW
      );
      expect(result.duration).toBe(30);
      expect(serviceRepo.findByIds).toHaveBeenCalledWith(['svc-a']);
    });

    it('employeeId concreto que no ofrece todos los servicios → sin huecos', async () => {
      employeeRepo.findById.mockResolvedValue(
        makeEmployee({ offersAllServices: false, serviceIds: ['svc-a'] })
      );

      const result = await useCase.execute(
        'tenant-demo',
        { employeeId: 'emp-1', serviceIds: 'svc-a,svc-b', ...WINDOW },
        NOW
      );

      expect(result).toEqual({ slots: [], hasMore: false, duration: 30 });
      expect(reservationRepo.findActiveRanges).not.toHaveBeenCalled();
    });

    it('employeeId concreto que sí los ofrece calcula con normalidad', async () => {
      employeeRepo.findById.mockResolvedValue(
        makeEmployee({ offersAllServices: false, serviceIds: ['svc-a', 'svc-b'] })
      );

      const result = await useCase.execute(
        'tenant-demo',
        { employeeId: 'emp-1', serviceIds: 'svc-a,svc-b', ...WINDOW },
        NOW
      );

      expect(result.duration).toBe(30);
      expect(result.slots.length).toBeGreaterThan(0);
      expect(result.slots[0].employeeId).toBe('emp-1');
    });

    it('sin employeeId solo aportan huecos los empleados capaces', async () => {
      employeeRepo.findByTenantId.mockResolvedValue([
        makeEmployee({ id: 'emp-1', offersAllServices: false, serviceIds: ['svc-a'] }),
        makeEmployee({ id: 'emp-2' }),
      ]);

      const result = await useCase.execute(
        'tenant-demo',
        { serviceIds: 'svc-a,svc-b', ...WINDOW },
        NOW
      );

      expect(result.slots.length).toBeGreaterThan(0);
      expect(result.slots.every((slot) => slot.employeeId === 'emp-2')).toBe(true);
    });

    it('modo duration: el filtro de capacidad NO aplica (comportamiento previo)', async () => {
      employeeRepo.findById.mockResolvedValue(
        makeEmployee({ offersAllServices: false, serviceIds: [] })
      );

      const result = await useCase.execute(
        'tenant-demo',
        { employeeId: 'emp-1', duration: 15, ...WINDOW },
        NOW
      );

      expect(result.duration).toBe(15);
      expect(result.slots.length).toBeGreaterThan(0);
    });

    it('resuelve los servicios con findByIds destruplicando la lista', async () => {
      await useCase.execute('tenant-demo', { serviceIds: 'svc-b, svc-a ,svc-b', ...WINDOW }, NOW);

      expect(serviceRepo.findByIds).toHaveBeenCalledWith(['svc-b', 'svc-a']);
    });
  });
});
