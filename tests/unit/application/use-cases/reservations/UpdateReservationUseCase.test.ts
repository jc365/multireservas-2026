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
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import UpdateReservationUseCase from '../../../../../backend/src/application/use-cases/reservations/UpdateReservationUseCase';
import Reservation from '../../../../../backend/src/domain/entities/Reservation';
import type IReservationRepository from '../../../../../backend/src/application/interfaces/IReservationRepository';
import type { ReservationWithRelations } from '../../../../../backend/src/application/interfaces/IReservationRepository';
import type BitacoraService from '../../../../../backend/src/infrastructure/logging/BitacoraService';

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

describe('UpdateReservationUseCase', () => {
  let useCase: UpdateReservationUseCase;
  let repo: jest.Mocked<IReservationRepository>;
  let bitacoraService: jest.Mocked<BitacoraService>;
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
      save: vi.fn(async (reservation: Reservation) => {
        current = reservation;
      }),
      saveMany: vi.fn(async (reservations: Reservation[]) => {
        savedMany = reservations;
        const mine = reservations.find((row) => row.id === current.id);
        if (mine) current = mine;
      }),
    } as unknown as jest.Mocked<IReservationRepository>;
    bitacoraService = { log: vi.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<BitacoraService>;
    useCase = new UpdateReservationUseCase(repo, bitacoraService);
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
});
