/**
 * @file ListReservationsUseCase.test.ts
 * @module tests/unit/application/use-cases/reservations
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import ListReservationsUseCase from '../../../../../backend/src/application/use-cases/reservations/ListReservationsUseCase';
import Reservation from '../../../../../backend/src/domain/entities/Reservation';
import type IReservationRepository from '../../../../../backend/src/application/interfaces/IReservationRepository';
import type { ReservationWithRelations } from '../../../../../backend/src/application/interfaces/IReservationRepository';

function makeView(id: string): ReservationWithRelations {
  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  start.setUTCHours(10, 0, 0, 0);
  const reservation = Reservation.create({
    id,
    tenantId: 'tenant-demo',
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

describe('ListReservationsUseCase', () => {
  let useCase: ListReservationsUseCase;
  let repo: jest.Mocked<IReservationRepository>;

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      findByTenantId: vi.fn().mockResolvedValue([makeView('res-1'), makeView('res-2')]),
      findByActiveKey: vi.fn(),
      findByCancelToken: vi.fn(),
      save: vi.fn(),
    } as unknown as jest.Mocked<IReservationRepository>;
    useCase = new ListReservationsUseCase(repo);
  });

  it('lista reservas del tenant sin filtros', async () => {
    const views = await useCase.execute('tenant-demo');

    expect(views).toHaveLength(2);
    expect(repo.findByTenantId).toHaveBeenCalledWith('tenant-demo', undefined);
  });

  it('pasa los filtros al repositorio', async () => {
    await useCase.execute('tenant-demo', {
      status: 'confirmed',
      date: '2026-10-05',
      employeeId: 'emp-1',
      clientId: 'cli-1',
      limit: 10,
    });

    expect(repo.findByTenantId).toHaveBeenCalledWith('tenant-demo', {
      status: 'confirmed',
      date: '2026-10-05',
      employeeId: 'emp-1',
      clientId: 'cli-1',
      limit: 10,
    });
  });

  it('acepta todos los status válidos', async () => {
    for (const status of ['pending', 'confirmed', 'cancelled', 'completed', 'no_show']) {
      await expect(useCase.execute('tenant-demo', { status })).resolves.toBeDefined();
    }
  });

  it('status inválido → throw', async () => {
    await expect(useCase.execute('tenant-demo', { status: 'bogus' })).rejects.toThrow(
      'Reservation status must be pending, confirmed, cancelled, completed or no_show'
    );
    expect(repo.findByTenantId).not.toHaveBeenCalled();
  });

  it('date con formato inválido → throw', async () => {
    await expect(useCase.execute('tenant-demo', { date: '05/10/2026' })).rejects.toThrow(
      'date must be a YYYY-MM-DD string'
    );
    expect(repo.findByTenantId).not.toHaveBeenCalled();
  });

  it('pasa el rango from/to al repositorio (F4.3)', async () => {
    await useCase.execute('tenant-demo', { from: '2026-10-05', to: '2026-10-11' });

    expect(repo.findByTenantId).toHaveBeenCalledWith('tenant-demo', {
      from: '2026-10-05',
      to: '2026-10-11',
    });
  });

  it('acepta from sin to (rango abierto)', async () => {
    await useCase.execute('tenant-demo', { from: '2026-10-05' });

    expect(repo.findByTenantId).toHaveBeenCalledWith('tenant-demo', { from: '2026-10-05' });
  });

  it('from con formato inválido → throw', async () => {
    await expect(useCase.execute('tenant-demo', { from: '05/10/2026' })).rejects.toThrow(
      'from must be a YYYY-MM-DD string'
    );
    expect(repo.findByTenantId).not.toHaveBeenCalled();
  });

  it('to con formato inválido → throw', async () => {
    await expect(useCase.execute('tenant-demo', { to: '2026/10/11' })).rejects.toThrow(
      'to must be a YYYY-MM-DD string'
    );
    expect(repo.findByTenantId).not.toHaveBeenCalled();
  });

  it('from > to → throw', async () => {
    await expect(
      useCase.execute('tenant-demo', { from: '2026-10-11', to: '2026-10-05' })
    ).rejects.toThrow('from must be before or equal to to');
    expect(repo.findByTenantId).not.toHaveBeenCalled();
  });
});
