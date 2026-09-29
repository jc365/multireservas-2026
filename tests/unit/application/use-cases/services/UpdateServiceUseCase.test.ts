import { vi, describe, it, expect, beforeEach } from 'vitest';
import UpdateServiceUseCase from '../../../../../backend/src/application/use-cases/services/UpdateServiceUseCase';
import Service from '../../../../../backend/src/domain/entities/Service';
import ServiceName from '../../../../../backend/src/domain/value-objects/ServiceName';
import BookingSettings from '../../../../../backend/src/domain/value-objects/BookingSettings';
import type IServiceRepository from '../../../../../backend/src/application/interfaces/IServiceRepository';
import type ITenantRepository from '../../../../../backend/src/application/interfaces/ITenantRepository';
import type BitacoraService from '../../../../../backend/src/infrastructure/logging/BitacoraService';

const settings = BookingSettings.fromTenantSettings({});

function makeService(tenantId: string, id = 'svc-1') {
  return Service.create(
    { id, tenantId, name: ServiceName.create('Classic Haircut'), duration: 30 },
    settings
  );
}

describe('UpdateServiceUseCase', () => {
  let useCase: UpdateServiceUseCase;
  let serviceRepo: jest.Mocked<IServiceRepository>;
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let bitacoraService: jest.Mocked<BitacoraService>;

  beforeEach(() => {
    serviceRepo = {
      findById: vi.fn().mockResolvedValue(makeService('tenant-demo')),
      findByTenantId: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
    };
    tenantRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'tenant-demo', settings: {} }),
    };
    bitacoraService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BitacoraService>;
    useCase = new UpdateServiceUseCase(serviceRepo, tenantRepo, bitacoraService);
  });

  it('actualiza los campos indicados y registra bitacora', async () => {
    const updated = await useCase.execute(
      'svc-1',
      { name: 'Premium Haircut', price: 40, isActive: false },
      'tenant-demo',
      'usr-owner'
    );

    expect(updated.name.getValue()).toBe('Premium Haircut');
    expect(updated.price).toBe(40);
    expect(updated.isActive).toBe(false);
    expect(updated.duration).toBe(30);
    expect(serviceRepo.save).toHaveBeenCalledTimes(1);
    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr-owner',
        action: 'update_service',
        entityType: 'service',
        entityId: 'svc-1',
      })
    );
  });

  it('servicio inexistente → throw y no guarda', async () => {
    serviceRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute('svc-404', { name: 'Nope' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Service not found');
    expect(serviceRepo.save).not.toHaveBeenCalled();
  });

  it('servicio de otro tenant → throw (igual que no encontrado)', async () => {
    serviceRepo.findById.mockResolvedValue(makeService('tenant-other'));

    await expect(
      useCase.execute('svc-1', { name: 'Nope' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Service not found');
    expect(serviceRepo.save).not.toHaveBeenCalled();
  });

  it('duration no múltiplo del slot del tenant → propaga el error', async () => {
    tenantRepo.findById.mockResolvedValue({ id: 'tenant-demo', settings: { slotDuration: 30 } });

    await expect(
      useCase.execute('svc-1', { duration: 45 }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Service duration must be a multiple of 30 minutes');
    expect(serviceRepo.save).not.toHaveBeenCalled();
  });

  it('tenant inexistente → throw', async () => {
    tenantRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute('svc-1', { duration: 60 }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Tenant not found');
  });

  it('sin name no cambia el nombre (campos undefined se ignoran)', async () => {
    const updated = await useCase.execute('svc-1', { price: 10 }, 'tenant-demo', 'usr-owner');
    expect(updated.name.getValue()).toBe('Classic Haircut');
    expect(updated.price).toBe(10);
  });
});
