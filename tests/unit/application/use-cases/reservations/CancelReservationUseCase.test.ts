/**
 * @file CancelReservationUseCase.test.ts
 * @module tests/unit/application/use-cases/reservations
 *
 * F3.3 #10-#11: cancelación por id+tenant (con bitácora) y pública
 * por token (sin auth, sin bitácora). Sin límite de tiempo.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import CancelReservationUseCase from '../../../../../backend/src/application/use-cases/reservations/CancelReservationUseCase';
import Reservation from '../../../../../backend/src/domain/entities/Reservation';
import type IReservationRepository from '../../../../../backend/src/application/interfaces/IReservationRepository';
import type { ReservationWithRelations } from '../../../../../backend/src/application/interfaces/IReservationRepository';
import type BitacoraService from '../../../../../backend/src/infrastructure/logging/BitacoraService';

function makeReservation(overrides: Partial<Parameters<typeof Reservation.create>[0]> = {}): Reservation {
  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  start.setUTCHours(10, 0, 0, 0);
  return Reservation.create({
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
  return {
    reservation,
    client: { id: 'cli-1', firstName: 'Laura', lastName: 'Gómez', email: null, phone: '+34600111222' },
    employee: null,
    service: null,
  };
}

describe('CancelReservationUseCase', () => {
  let useCase: CancelReservationUseCase;
  let repo: jest.Mocked<IReservationRepository>;
  let bitacoraService: jest.Mocked<BitacoraService>;
  let current: Reservation;
  let saved: Reservation | null;

  beforeEach(() => {
    current = makeReservation({ cancelToken: 'token-para-cancelar-01' });
    saved = null;
    repo = {
      findById: vi.fn(async () => (saved ? makeView(saved) : makeView(current))),
      findByTenantId: vi.fn().mockResolvedValue([]),
      findByActiveKey: vi.fn().mockResolvedValue(null),
      findByCancelToken: vi.fn(async () => makeView(current)),
      save: vi.fn(async (reservation: Reservation) => {
        saved = reservation;
      }),
    } as unknown as jest.Mocked<IReservationRepository>;
    bitacoraService = { log: vi.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<BitacoraService>;
    useCase = new CancelReservationUseCase(repo, bitacoraService);
  });

  describe('execute (autenticado por id + tenant)', () => {
    it('cancela, limpia activeKey y registra cancel_reservation', async () => {
      const view = await useCase.execute('res-1', 'tenant-demo', 'usr-owner');

      expect(view.reservation.status).toBe('cancelled');
      expect(view.reservation.activeKey).toBeNull();
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(bitacoraService.log).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'usr-owner', action: 'cancel_reservation', entityType: 'reservation' })
      );
    });

    it('reserva inexistente → throw not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(useCase.execute('res-404', 'tenant-demo', 'usr-owner')).rejects.toThrow(
        'Reservation not found'
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('reserva de otro tenant → throw not found (aislamiento F3.3 #14)', async () => {
      repo.findById.mockResolvedValue(makeView(makeReservation({ tenantId: 'tenant-other' })));

      await expect(useCase.execute('res-1', 'tenant-demo', 'usr-owner')).rejects.toThrow(
        'Reservation not found'
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('ya cancelada → throw 409 (already)', async () => {
      repo.findById.mockResolvedValue(makeView(current.withStatus('cancelled')));

      await expect(useCase.execute('res-1', 'tenant-demo', 'usr-owner')).rejects.toThrow(
        'Reservation is already cancelled or finished'
      );
      expect(repo.save).not.toHaveBeenCalled();
      expect(bitacoraService.log).not.toHaveBeenCalled();
    });

    it('sin límite de tiempo: reservas pasadas también se pueden cancelar', async () => {
      const pastStart = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      current = makeReservation({ startTimeUTC: pastStart });

      const view = await useCase.execute('res-1', 'tenant-demo', 'usr-owner');
      expect(view.reservation.status).toBe('cancelled');
      expect(repo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeByToken (público sin auth)', () => {
    it('cancela por token sin registrar bitácora (no hay actor)', async () => {
      const view = await useCase.executeByToken('token-para-cancelar-01');

      expect(view.reservation.status).toBe('cancelled');
      expect(view.reservation.activeKey).toBeNull();
      expect(repo.findByCancelToken).toHaveBeenCalledWith('token-para-cancelar-01');
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(bitacoraService.log).not.toHaveBeenCalled();
    });

    it('token inválido → throw not found', async () => {
      repo.findByCancelToken.mockResolvedValue(null);

      await expect(useCase.executeByToken('token-malo')).rejects.toThrow('Reservation not found');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('token vacío → throw not found sin consultar el repo', async () => {
      await expect(useCase.executeByToken('')).rejects.toThrow('Reservation not found');
      expect(repo.findByCancelToken).not.toHaveBeenCalled();
    });

    it('ya cancelada por token → throw already', async () => {
      repo.findByCancelToken.mockResolvedValue(makeView(current.withStatus('cancelled')));

      await expect(useCase.executeByToken('token-para-cancelar-01')).rejects.toThrow(
        'Reservation is already cancelled or finished'
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('getByToken (GET público)', () => {
    it('devuelve la reserva para mostrarla antes de cancelar', async () => {
      const view = await useCase.getByToken('token-para-cancelar-01');
      expect(view?.reservation.id).toBe(current.id);
    });

    it('token inexistente → null', async () => {
      repo.findByCancelToken.mockResolvedValue(null);
      expect(await useCase.getByToken('x')).toBeNull();
    });

    it('token vacío → null sin consultar', async () => {
      expect(await useCase.getByToken('   ')).toBeNull();
      expect(repo.findByCancelToken).not.toHaveBeenCalled();
    });
  });
});
