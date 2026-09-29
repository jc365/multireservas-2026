import { vi, describe, it, expect, beforeEach } from 'vitest';
import DeleteServiceUseCase from '../../../../../backend/src/application/use-cases/services/DeleteServiceUseCase';
import Service from '../../../../../backend/src/domain/entities/Service';
import ServiceName from '../../../../../backend/src/domain/value-objects/ServiceName';
import BookingSettings from '../../../../../backend/src/domain/value-objects/BookingSettings';
import type IServiceRepository from '../../../../../backend/src/application/interfaces/IServiceRepository';
import type BitacoraService from '../../../../../backend/src/infrastructure/logging/BitacoraService';

const settings = BookingSettings.fromTenantSettings({});

function makeService(tenantId: string, id = 'svc-1') {
  return Service.create(
    { id, tenantId, name: ServiceName.create('Classic Haircut'), duration: 30 },
    settings
  );
}

describe('DeleteServiceUseCase', () => {
  let useCase: DeleteServiceUseCase;
  let serviceRepo: jest.Mocked<IServiceRepository>;
  let bitacoraService: jest.Mocked<BitacoraService>;

  beforeEach(() => {
    serviceRepo = {
      findById: vi.fn().mockResolvedValue(makeService('tenant-demo')),
      findByTenantId: vi.fn(),
      save: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    bitacoraService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BitacoraService>;
    useCase = new DeleteServiceUseCase(serviceRepo, bitacoraService);
  });

  it('elimina el servicio y registra bitacora', async () => {
    await useCase.execute('svc-1', 'tenant-demo', 'usr-owner');

    expect(serviceRepo.delete).toHaveBeenCalledWith('svc-1');
    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr-owner',
        action: 'delete_service',
        entityType: 'service',
        entityId: 'svc-1',
      })
    );
  });

  it('servicio inexistente → throw y no borra', async () => {
    serviceRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('svc-404', 'tenant-demo', 'usr-owner')).rejects.toThrow(
      'Service not found'
    );
    expect(serviceRepo.delete).not.toHaveBeenCalled();
  });

  it('servicio de otro tenant → throw y no borra', async () => {
    serviceRepo.findById.mockResolvedValue(makeService('tenant-other'));

    await expect(useCase.execute('svc-1', 'tenant-demo', 'usr-owner')).rejects.toThrow(
      'Service not found'
    );
    expect(serviceRepo.delete).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });
});
