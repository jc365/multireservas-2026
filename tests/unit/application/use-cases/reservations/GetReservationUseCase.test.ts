/**
 * @file GetReservationUseCase.test.ts
 * @module tests/unit/application/use-cases/reservations
 *
 * Aislamiento cross-tenant (F3.3 #14): otro tenant → not found.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import GetReservationUseCase from '../../../../../backend/src/application/use-cases/reservations/GetReservationUseCase';
import Reservation from '../../../../../backend/src/domain/entities/Reservation';
import type IReservationRepository from '../../../../../backend/src/application/interfaces/IReservationRepository';
import type { ReservationWithRelations } from '../../../../../backend/src/application/interfaces/IReservationRepository';

function makeView(tenantId: string): ReservationWithRelations {
  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  start.setUTCHours(10, 0, 0, 0);
  const reservation = Reservation.create({
    id: 'res-1',
    tenantId,
    clientId: 'cli-1',
    employeeId: 'emp-1',
    serviceId: 'svc-1',
    date: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())),
    startTimeUTC: start,
    duration: 30,
    timezone: 'UTC',
  });
  return { reservation, client: null, employee: null, service: null };
}

describe('GetReservationUseCase', () => {
  let useCase: GetReservationUseCase;
  let repo: jest.Mocked<IReservationRepository>;

  beforeEach(() => {
    repo = {
      findById: vi.fn().mockResolvedValue(makeView('tenant-demo')),
      findByTenantId: vi.fn(),
      findByActiveKey: vi.fn(),
      findByCancelToken: vi.fn(),
      save: vi.fn(),
    } as unknown as jest.Mocked<IReservationRepository>;
    useCase = new GetReservationUseCase(repo);
  });

  it('reserva del tenant → la devuelve', async () => {
    const view = await useCase.execute('res-1', 'tenant-demo');
    expect(view.reservation.id).toBe('res-1');
    expect(repo.findById).toHaveBeenCalledWith('res-1');
  });

  it('reserva inexistente → throw not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(useCase.execute('res-404', 'tenant-demo')).rejects.toThrow('Reservation not found');
  });

  it('reserva de otro tenant → throw not found (no filtra existencia)', async () => {
    repo.findById.mockResolvedValue(makeView('tenant-other'));
    await expect(useCase.execute('res-1', 'tenant-demo')).rejects.toThrow('Reservation not found');
  });
});
