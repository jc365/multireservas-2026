import { vi, describe, it, expect, beforeEach } from 'vitest';
import GetServiceUseCase from '../../../../../backend/src/application/use-cases/services/GetServiceUseCase';
import Service from '../../../../../backend/src/domain/entities/Service';
import ServiceName from '../../../../../backend/src/domain/value-objects/ServiceName';
import BookingSettings from '../../../../../backend/src/domain/value-objects/BookingSettings';
import type IServiceRepository from '../../../../../backend/src/application/interfaces/IServiceRepository';

const settings = BookingSettings.fromTenantSettings({});

function makeService(tenantId: string, id = 'svc-1') {
  return Service.create(
    { id, tenantId, name: ServiceName.create('Classic Haircut'), duration: 30 },
    settings
  );
}

describe('GetServiceUseCase', () => {
  let useCase: GetServiceUseCase;
  let serviceRepo: jest.Mocked<IServiceRepository>;

  beforeEach(() => {
    serviceRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    useCase = new GetServiceUseCase(serviceRepo);
  });

  it('devuelve el servicio si pertenece al tenant', async () => {
    serviceRepo.findById.mockResolvedValue(makeService('tenant-demo'));

    const result = await useCase.execute('svc-1', 'tenant-demo');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('svc-1');
    expect(result?.tenantId).toBe('tenant-demo');
  });

  it('devuelve null si el servicio es de otro tenant (no filtra existencia)', async () => {
    serviceRepo.findById.mockResolvedValue(makeService('tenant-other'));

    const result = await useCase.execute('svc-1', 'tenant-demo');

    expect(result).toBeNull();
  });

  it('devuelve null si no existe', async () => {
    serviceRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute('svc-404', 'tenant-demo');

    expect(result).toBeNull();
  });
});
