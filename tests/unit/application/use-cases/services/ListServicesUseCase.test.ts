import { vi, describe, it, expect, beforeEach } from 'vitest';
import ListServicesUseCase from '../../../../../backend/src/application/use-cases/services/ListServicesUseCase';
import Service from '../../../../../backend/src/domain/entities/Service';
import ServiceName from '../../../../../backend/src/domain/value-objects/ServiceName';
import BookingSettings from '../../../../../backend/src/domain/value-objects/BookingSettings';
import type IServiceRepository from '../../../../../backend/src/application/interfaces/IServiceRepository';

const settings = BookingSettings.fromTenantSettings({});

describe('ListServicesUseCase', () => {
  let useCase: ListServicesUseCase;
  let serviceRepo: jest.Mocked<IServiceRepository>;

  beforeEach(() => {
    serviceRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      delete: vi.fn(),
    };
    useCase = new ListServicesUseCase(serviceRepo);
  });

  it('lista los servicios del tenant indicado', async () => {
    const service = Service.create(
      { tenantId: 'tenant-demo', name: ServiceName.create('Classic Haircut'), duration: 30 },
      settings
    );
    serviceRepo.findByTenantId.mockResolvedValue([service]);

    const result = await useCase.execute('tenant-demo');

    expect(serviceRepo.findByTenantId).toHaveBeenCalledWith('tenant-demo');
    expect(result).toHaveLength(1);
    expect(result[0].name.getValue()).toBe('Classic Haircut');
  });

  it('devuelve array vacío si el tenant no tiene servicios', async () => {
    const result = await useCase.execute('tenant-empty');
    expect(result).toEqual([]);
  });
});
