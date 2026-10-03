/**
 * @file UpdateReservationUseCase.test.ts
 * @module tests/unit/application/use-cases/reservations
 *
 * F3.3 #6: solo notes y status; reactivación revalida solapamiento;
 * cancelación desde aquí deja activeKey null y loguea cancel_reservation.
 *
 * F4.5b: `status: 'cancelled'` sobre una fila con `groupBookingId`
 * cancela el grupo entero en transacción (1 bitácora por grupo); el
 * resto de cambios (notes, completed, …) siguen tocando solo esa fila.
 *
 * F4.7a: reprogramación (date/startTimeUTC/employeeId) — simple,
 * grupo, validaciones, cancelToken regenerado y email con token nuevo.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import UpdateReservationUseCase from '../../../../../backend/src/application/use-cases/reservations/UpdateReservationUseCase';
import Reservation from '../../../../../backend/src/domain/entities/Reservation';
import type IReservationRepository from '../../../../../backend/src/application/interfaces/IReservationRepository';
import type { ReservationWithRelations } from '../../../../../backend/src/application/interfaces/IReservationRepository';
import type IEmployeeRepository from '../../../../../backend/src/application/interfaces/IEmployeeRepository';
import type IServiceRepository from '../../../../../backend/src/application/interfaces/IServiceRepository';
import type ITenantRepository from '../../../../../backend/src/application/interfaces/ITenantRepository';
import type BitacoraService from '../../../../../backend/src/infrastructure/logging/BitacoraService';
import type EmailService from '../../../../../backend/src/infrastructure/email/EmailService';

function futureStart(hour = 10, daysAhead = 7): Date {
  const start = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  start.setUTCHours(hour, 0, 0, 0);
  return start;
}

function makeReservation(overrides: Partial<Parameters<typeof Reservation.create>[0]> = {}): Reservation {
  const start = overrides.startTimeUTC ?? futureStart(10);
  return Reservation.create({
    id: 'res-1',
    tenantId: 'tenant-demo',
    clientId: 'cli-1',
    employeeId: 'emp-1',
    serviceId: 'svc-1',
    date: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())),
    startTimeUTC: start,
    duration: 30,
    timezone: 'UTC',
    ...overrides,
  });
}

function makeView(reservation: Reservation): ReservationWithRelations {
  return { reservation, client: null, employee: null, service: null };
}

function makeEmployee(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tenantId: 'tenant-demo',
    isActive: true,
    offersAllServices: true,
    serviceIds: [] as string[],
    name: { getValue: () => 'Employee Demo' },
    ...overrides,
  };
}

function makeService(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tenantId: 'tenant-demo',
    isActive: true,
    name: { getValue: () => `Service ${id}` },
    duration: 30,
    price: 25,
    ...overrides,
  };
}

describe('UpdateReservationUseCase', () => {
  let useCase: UpdateReservationUseCase;
  let repo: jest.Mocked<IReservationRepository>;
  let employeeRepo: jest.Mocked<IEmployeeRepository>;
  let serviceRepo: jest.Mocked<IServiceRepository>;
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let bitacoraService: jest.Mocked<BitacoraService>;
  let emailService: jest.Mocked<EmailService>;
  let current: Reservation;
  let groupRows: ReservationWithRelations[];
  let savedMany: Reservation[];

  beforeEach(() => {
    current = makeReservation();
    groupRows = [];
    savedMany = [];
    repo = {
      findById: vi.fn(async () => makeView(current)),
      findByTenantId: vi.fn().mockResolvedValue([]),
      findByActiveKey: vi.fn().mockResolvedValue(null),
      findByCancelToken: vi.fn(),
      findByGroupBookingId: vi.fn(async () => groupRows),
      findActiveRanges: vi.fn().mockResolvedValue([]),
      save: vi.fn(async (reservation: Reservation) => {
        current = reservation;
      }),
      saveMany: vi.fn(async (reservations: Reservation[]) => {
        savedMany = reservations;
        const mine = reservations.find((row) => row.id === current.id);
        if (mine) current = mine;
      }),
    } as unknown as jest.Mocked<IReservationRepository>;
    employeeRepo = {
      findById: vi.fn(async (id: string) =>
        id === 'emp-1' || id === 'emp-2' ? (makeEmployee(id) as never) : null
      ),
    } as unknown as jest.Mocked<IEmployeeRepository>;
    serviceRepo = {
      findById: vi.fn(async (id: string) =>
        id === 'svc-1' || id === 'svc-2' ? (makeService(id) as never) : null
      ),
    } as unknown as jest.Mocked<IServiceRepository>;
    tenantRepo = {
      findById: vi.fn(async () => ({ id: 'tenant-demo', timezone: 'UTC', settings: {} }) as never),
    } as unknown as jest.Mocked<ITenantRepository>;
    bitacoraService = { log: vi.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<BitacoraService>;
    emailService = { send: vi.fn().mockResolvedValue(true) } as unknown as jest.Mocked<EmailService>;
    useCase = new UpdateReservationUseCase(
      repo,
      employeeRepo,
      serviceRepo,
      tenantRepo,
      bitacoraService,
      emailService
    );
  });

  it('actualiza las notes y registra update_reservation', async () => {
    const view = await useCase.execute('res-1', { notes: 'llega tarde' }, 'tenant-demo', 'usr-owner');

    expect(view.reservation.notes).toBe('llega tarde');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update_reservation', entityType: 'reservation', entityId: 'res-1' })
    );
  });

  it('status a cancelled → activeKey null y action cancel_reservation', async () => {
    const view = await useCase.execute('res-1', { status: 'cancelled' }, 'tenant-demo', 'usr-owner');

    expect(view.reservation.status).toBe('cancelled');
    expect(view.reservation.activeKey).toBeNull();
    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cancel_reservation',
        metadata: expect.objectContaining({ status: 'cancelled' }),
      })
    );
  });

  it('status a completed → terminal con activeKey null', async () => {
    const view = await useCase.execute('res-1', { status: 'completed' }, 'tenant-demo', 'usr-owner');
    expect(view.reservation.status).toBe('completed');
    expect(view.reservation.activeKey).toBeNull();
  });

  it('reactivar cancelled → confirmed regenera activeKey (sin conflicto)', async () => {
    current = current.withStatus('cancelled');

    const view = await useCase.execute('res-1', { status: 'confirmed' }, 'tenant-demo', 'usr-owner');

    expect(view.reservation.status).toBe('confirmed');
    expect(view.reservation.activeKey).toBeTruthy();
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('reactivar con solapamiento de intervalo → throw overlap y no guarda', async () => {
    current = current.withStatus('cancelled');
    const conflict = makeReservation({ id: 'res-other', startTimeUTC: current.startTimeUTC, duration: 60 });
    repo.findByTenantId.mockResolvedValue([makeView(conflict)]);

    await expect(
      useCase.execute('res-1', { status: 'confirmed' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Reservation overlaps an existing reservation');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('reactivar con activeKey exacto de otra reserva → throw overlap', async () => {
    current = current.withStatus('cancelled');
    repo.findByActiveKey.mockResolvedValue(makeView(makeReservation({ id: 'res-other' })));

    await expect(
      useCase.execute('res-1', { status: 'confirmed' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Reservation overlaps an existing reservation');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('reactivar con el propio activeKey (misma reserva) → permitido', async () => {
    current = current.withStatus('cancelled');
    repo.findByActiveKey.mockResolvedValue(makeView(current));

    const view = await useCase.execute('res-1', { status: 'confirmed' }, 'tenant-demo', 'usr-owner');
    expect(view.reservation.status).toBe('confirmed');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('reserva inexistente → throw not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute('res-404', { notes: 'x' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Reservation not found');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('reserva de otro tenant → throw not found', async () => {
    const foreign = makeReservation({ tenantId: 'tenant-other' });
    repo.findById.mockResolvedValue(makeView(foreign));

    await expect(
      useCase.execute('res-1', { notes: 'x' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Reservation not found');
  });

  it('status inválido → error de la entity', async () => {
    await expect(
      useCase.execute('res-1', { status: 'bogus' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Reservation status must be pending, confirmed, cancelled, completed or no_show');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('sin cambios → devuelve la reserva sin guardar ni loguear', async () => {
    const view = await useCase.execute('res-1', {}, 'tenant-demo', 'usr-owner');

    expect(view.reservation.id).toBe('res-1');
    expect(repo.save).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });

  it('notes y status a la vez → ambos aplicados', async () => {
    const view = await useCase.execute(
      'res-1',
      { notes: 'nueva nota', status: 'no_show' },
      'tenant-demo',
      'usr-owner'
    );

    expect(view.reservation.notes).toBe('nueva nota');
    expect(view.reservation.status).toBe('no_show');
  });

  it('carrera P2002 al reactivar → se traduce en overlap', async () => {
    current = current.withStatus('cancelled');
    repo.save.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));

    await expect(
      useCase.execute('res-1', { status: 'confirmed' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Reservation overlaps an existing reservation');
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });

  describe('F4.5b: cancelación de grupo desde el PUT', () => {
    function groupFixture(options: { currentCancelled?: boolean } = {}) {
      current = makeReservation({ groupBookingId: 'grp-1', ...(options.currentCancelled ? { status: 'cancelled' as const } : {}) });
      const secondStart = futureStart(10);
      secondStart.setUTCHours(10, 30, 0, 0);
      const second = makeReservation({
        id: 'res-2',
        groupBookingId: 'grp-1',
        startTimeUTC: secondStart,
      });
      groupRows = [makeView(current), makeView(second)];
      return second;
    }

    it("status cancelled en una fila del grupo → cancela el grupo entero con 1 bitácora", async () => {
      groupFixture();

      const view = await useCase.execute('res-1', { status: 'cancelled' }, 'tenant-demo', 'usr-owner');

      expect(repo.findByGroupBookingId).toHaveBeenCalledWith('grp-1');
      expect(repo.saveMany).toHaveBeenCalledTimes(1);
      expect(repo.save).not.toHaveBeenCalled();
      expect(savedMany).toHaveLength(2);
      expect(savedMany.every((row) => row.status === 'cancelled' && row.activeKey === null)).toBe(true);
      expect(view.reservation.status).toBe('cancelled');
      expect(bitacoraService.log).toHaveBeenCalledTimes(1);
      expect(bitacoraService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'cancel_reservation',
          entityId: 'grp-1',
          metadata: expect.objectContaining({ groupBookingId: 'grp-1', cancelledCount: 2 }),
        })
      );
    });

    it('el grupo sin ninguna fila activa → 409 y nada persiste', async () => {
      groupFixture();
      const terminal = makeReservation({ id: 'res-2', status: 'cancelled' });
      repo.findByGroupBookingId.mockResolvedValue([makeView(terminal)]);

      await expect(
        useCase.execute('res-1', { status: 'cancelled' }, 'tenant-demo', 'usr-owner')
      ).rejects.toMatchObject({ status: 409, code: 'RESERVATION_INVALID_STATE' });
      expect(repo.saveMany).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
      expect(bitacoraService.log).not.toHaveBeenCalled();
    });

    it('notes en una fila del grupo → solo toca esa fila (sin saveMany)', async () => {
      groupFixture();

      const view = await useCase.execute('res-1', { notes: 'nota del grupo' }, 'tenant-demo', 'usr-owner');

      expect(view.reservation.notes).toBe('nota del grupo');
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.saveMany).not.toHaveBeenCalled();
      expect(repo.findByGroupBookingId).not.toHaveBeenCalled();
    });

    it('status completed en una fila del grupo → solo esa fila', async () => {
      groupFixture();

      const view = await useCase.execute('res-1', { status: 'completed' }, 'tenant-demo', 'usr-owner');

      expect(view.reservation.status).toBe('completed');
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.saveMany).not.toHaveBeenCalled();
      expect(savedMany).toHaveLength(0);
    });
  });

  describe('F4.7a: reprogramación', () => {
    function rescheduleInput(overrides: Record<string, unknown> = {}) {
      const start = futureStart(15);
      return {
        date: start.toISOString().slice(0, 10),
        startTimeUTC: start.toISOString(),
        ...overrides,
      };
    }

    function groupFixture(secondCancelled = false) {
      current = makeReservation({ groupBookingId: 'grp-1' });
      const secondStart = futureStart(10);
      secondStart.setUTCHours(10, 30, 0, 0);
      const second = makeReservation({
        id: 'res-2',
        groupBookingId: 'grp-1',
        startTimeUTC: secondStart,
        duration: 15,
        serviceId: 'svc-2',
        ...(secondCancelled ? { status: 'cancelled' as const } : {}),
      });
      groupRows = [makeView(current), makeView(second)];
      // findById debe responder por id: los tests de grupo apuntan a
      // filas concretas (res-1 o res-2), no siempre a `current`.
      repo.findById.mockImplementation(async (id: string) => {
        const found = groupRows.find((view) => view.reservation.id === id);
        return found ?? makeView(current);
      });
      return second;
    }

    it('simple → nueva hora, activeKey nuevo y cancelToken regenerado', async () => {
      const oldToken = current.cancelToken;
      const oldKey = current.activeKey;
      const oldStart = current.startTimeUTC;
      const start = futureStart(15);

      const view = await useCase.execute(
        'res-1',
        { date: start.toISOString().slice(0, 10), startTimeUTC: start.toISOString() },
        'tenant-demo',
        'usr-owner'
      );

      expect(view.reservation.startTimeUTC.getTime()).toBe(start.getTime());
      expect(view.reservation.date.toISOString().slice(0, 10)).toBe(start.toISOString().slice(0, 10));
      expect(view.reservation.activeKey).toBeTruthy();
      expect(view.reservation.activeKey).not.toBe(oldKey);
      expect(view.reservation.cancelToken).toBeTruthy();
      expect(view.reservation.cancelToken).not.toBe(oldToken);
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.saveMany).not.toHaveBeenCalled();
      expect(bitacoraService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'reschedule_reservation',
          entityType: 'reservation',
          entityId: 'res-1',
          metadata: {
            oldStart: oldStart.toISOString(),
            newStart: start.toISOString(),
            oldEmployeeId: 'emp-1',
            newEmployeeId: 'emp-1',
          },
        })
      );
    });

    it('simple → email con asunto "rescheduled" y token NUEVO (el viejo no aparece)', async () => {
      const oldToken = current.cancelToken as string;
      repo.findById.mockImplementation(async () => ({
        reservation: current,
        client: {
          id: 'cli-1',
          firstName: 'Laura',
          lastName: 'Gómez',
          email: 'laura@example.com',
          phone: '+34600111222',
        },
        employee: null,
        service: null,
      }));

      await useCase.execute('res-1', rescheduleInput(), 'tenant-demo', 'usr-owner');

      expect(emailService.send).toHaveBeenCalledTimes(1);
      const sent = emailService.send.mock.calls[0][0];
      expect(sent.to).toBe('laura@example.com');
      expect(sent.subject).toContain('Reservation rescheduled');
      expect(sent.text).toContain(`cancel/${current.cancelToken}`);
      expect(sent.text).not.toContain(oldToken);
      expect(current.cancelToken).not.toBe(oldToken);
    });

    it('fecha pasada → 400 y no guarda', async () => {
      const past = new Date(Date.now() - 3600 * 1000);

      await expect(
        useCase.execute(
          'res-1',
          { date: past.toISOString().slice(0, 10), startTimeUTC: past.toISOString() },
          'tenant-demo',
          'usr-owner'
        )
      ).rejects.toThrow('Reservation cannot be in the past');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('solape por ventana total → 409 y excluye las filas propias', async () => {
      repo.findActiveRanges.mockResolvedValue([{ start: new Date(), end: new Date() }]);

      await expect(
        useCase.execute('res-1', rescheduleInput(), 'tenant-demo', 'usr-owner')
      ).rejects.toMatchObject({ status: 409, code: 'RESERVATION_OVERLAP' });
      expect(repo.findActiveRanges).toHaveBeenCalledWith(
        'tenant-demo',
        'emp-1',
        expect.any(Date),
        expect.any(Date),
        ['res-1']
      );
      expect(repo.save).not.toHaveBeenCalled();
      expect(bitacoraService.log).not.toHaveBeenCalled();
    });

    it('date incoherente con startTimeUTC → DATE_START_TIME_MISMATCH', async () => {
      const start = futureStart(15);
      const wrongDate = new Date(start.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);

      await expect(
        useCase.execute(
          'res-1',
          { date: wrongDate, startTimeUTC: start.toISOString() },
          'tenant-demo',
          'usr-owner'
        )
      ).rejects.toMatchObject({ status: 400, code: 'DATE_START_TIME_MISMATCH' });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('solo date (sin startTimeUTC) → 400', async () => {
      await expect(
        useCase.execute('res-1', { date: '2030-01-01' }, 'tenant-demo', 'usr-owner')
      ).rejects.toThrow('date and startTimeUTC must be provided together to reschedule');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('reschedule + status a la vez → 400', async () => {
      await expect(
        useCase.execute('res-1', { ...rescheduleInput(), status: 'cancelled' }, 'tenant-demo', 'usr-owner')
      ).rejects.toThrow('status cannot be combined with a reschedule');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('employeeId de otro tenant → 400', async () => {
      await expect(
        useCase.execute('res-1', { ...rescheduleInput(), employeeId: 'emp-x' }, 'tenant-demo', 'usr-owner')
      ).rejects.toThrow('employeeId does not reference an employee of this tenant');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('employeeId sin capacidad para el servicio → 400', async () => {
      employeeRepo.findById.mockResolvedValue(
        makeEmployee('emp-2', { offersAllServices: false, serviceIds: ['otro-svc'] }) as never
      );

      await expect(
        useCase.execute('res-1', { ...rescheduleInput(), employeeId: 'emp-2' }, 'tenant-demo', 'usr-owner')
      ).rejects.toThrow('employee does not offer all the requested services');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('servicio ya no activo → 400', async () => {
      serviceRepo.findById.mockResolvedValue(
        makeService('svc-1', { isActive: false }) as never
      );

      await expect(
        useCase.execute('res-1', rescheduleInput(), 'tenant-demo', 'usr-owner')
      ).rejects.toThrow('service is not active');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('reserva cancelada → 409 RESERVATION_INVALID_STATE', async () => {
      current = current.withStatus('cancelled');

      await expect(
        useCase.execute('res-1', rescheduleInput(), 'tenant-demo', 'usr-owner')
      ).rejects.toMatchObject({ status: 409, code: 'RESERVATION_INVALID_STATE' });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('solo employeeId → conserva fecha/hora, cambia empleado y regenera token', async () => {
      const oldStart = current.startTimeUTC;
      const oldToken = current.cancelToken;

      const view = await useCase.execute(
        'res-1',
        { employeeId: 'emp-2' },
        'tenant-demo',
        'usr-owner'
      );

      expect(view.reservation.employeeId).toBe('emp-2');
      expect(view.reservation.startTimeUTC.getTime()).toBe(oldStart.getTime());
      expect(view.reservation.cancelToken).not.toBe(oldToken);
      expect(bitacoraService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'reschedule_reservation',
          metadata: expect.objectContaining({ oldEmployeeId: 'emp-1', newEmployeeId: 'emp-2' }),
        })
      );
    });

    it('notes + reschedule → aplica las notas en la fila reprogramada', async () => {
      const start = futureStart(15);

      const view = await useCase.execute(
        'res-1',
        {
          date: start.toISOString().slice(0, 10),
          startTimeUTC: start.toISOString(),
          notes: 'cambia a tarde',
        },
        'tenant-demo',
        'usr-owner'
      );

      expect(view.reservation.notes).toBe('cambia a tarde');
      expect(view.reservation.startTimeUTC.getTime()).toBe(start.getTime());
    });

    it('grupo → todas las filas activas reencadenadas, tokens nuevos y 1 bitácora', async () => {
      groupFixture();
      const oldTokens = groupRows.map((row) => row.reservation.cancelToken);
      const start = futureStart(15);

      const view = await useCase.execute(
        'res-1',
        { date: start.toISOString().slice(0, 10), startTimeUTC: start.toISOString() },
        'tenant-demo',
        'usr-owner'
      );

      expect(repo.findByGroupBookingId).toHaveBeenCalledWith('grp-1');
      expect(repo.saveMany).toHaveBeenCalledTimes(1);
      expect(repo.save).not.toHaveBeenCalled();
      expect(savedMany).toHaveLength(2);

      const row1 = savedMany[0];
      const row2 = savedMany[1];
      expect(row1.startTimeUTC.getTime()).toBe(start.getTime());
      expect(row2.startTimeUTC.getTime()).toBe(start.getTime() + 30 * 60_000);
      expect(row1.activeKey).toContain(start.toISOString().slice(0, 10));
      expect(row1.cancelToken).not.toBe(oldTokens[0]);
      expect(row2.cancelToken).not.toBe(oldTokens[1]);
      expect(row1.cancelToken).not.toBe(row2.cancelToken);

      expect(repo.findActiveRanges).toHaveBeenCalledWith(
        'tenant-demo',
        'emp-1',
        expect.any(Date),
        expect.any(Date),
        ['res-1', 'res-2']
      );
      expect(view.reservation.id).toBe('res-1');
      expect(bitacoraService.log).toHaveBeenCalledTimes(1);
      expect(bitacoraService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'reschedule_reservation',
          entityId: 'grp-1',
          metadata: expect.objectContaining({ groupId: 'grp-1' }),
        })
      );
    });

    it('grupo → la hora pedida marca la FILA OBJETIVO (la anterior se reencadena hacia atrás)', async () => {
      groupFixture();
      const start = futureStart(15);

      await useCase.execute(
        'res-2',
        { date: start.toISOString().slice(0, 10), startTimeUTC: start.toISOString() },
        'tenant-demo',
        'usr-owner'
      );

      expect(savedMany).toHaveLength(2);
      const row1 = savedMany.find((row) => row.id === 'res-1');
      const row2 = savedMany.find((row) => row.id === 'res-2');
      expect(row2?.startTimeUTC.getTime()).toBe(start.getTime());
      expect(row1?.startTimeUTC.getTime()).toBe(start.getTime() - 30 * 60_000);
    });

    it('grupo con una fila ya cancelada → solo se reprograma la activa', async () => {
      groupFixture(true);

      await useCase.execute('res-1', rescheduleInput(), 'tenant-demo', 'usr-owner');

      expect(repo.saveMany).toHaveBeenCalledTimes(1);
      expect(savedMany).toHaveLength(1);
      expect(savedMany[0].id).toBe('res-1');
      expect(savedMany[0].cancelToken).not.toBe(groupRows[0].reservation.cancelToken);
    });

    it('P2002 al persistir la reprogramación → 409 overlap', async () => {
      repo.save.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));

      await expect(
        useCase.execute('res-1', rescheduleInput(), 'tenant-demo', 'usr-owner')
      ).rejects.toMatchObject({ status: 409, code: 'RESERVATION_OVERLAP' });
      expect(bitacoraService.log).not.toHaveBeenCalled();
    });
  });
});
