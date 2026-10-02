import { vi, describe, it, expect, beforeEach } from 'vitest';
import CreateServiceUseCase from '../../../../../backend/src/application/use-cases/services/CreateServiceUseCase';
import { ForbiddenError } from '../../../../../backend/src/infrastructure/errors';
import type IServiceRepository from '../../../../../backend/src/application/interfaces/IServiceRepository';
import type ITenantRepository from '../../../../../backend/src/application/interfaces/ITenantRepository';
import type BitacoraService from '../../../../../backend/src/infrastructure/logging/BitacoraService';

describe('CreateServiceUseCase', () => {
  let useCase: CreateServiceUseCase;
  let serviceRepo: jest.Mocked<IServiceRepository>;
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let bitacoraService: jest.Mocked<BitacoraService>;

  beforeEach(() => {
    serviceRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    tenantRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'tenant-demo', settings: {} }),
    };
    bitacoraService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BitacoraService>;
    useCase = new CreateServiceUseCase(serviceRepo, tenantRepo, bitacoraService);
  });

  it('crea un servicio en el tenant dado y lo guarda', async () => {
    const service = await useCase.execute(
      { name: 'Classic Haircut', duration: 30, price: 25, category: 'hair' },
      'tenant-demo',
      'usr-owner'
    );

    expect(service.id.startsWith('svc-')).toBe(true);
    expect(service.tenantId).toBe('tenant-demo');
    expect(service.name.getValue()).toBe('Classic Haircut');
    expect(service.duration).toBe(30);
    expect(service.price).toBe(25);
    expect(serviceRepo.save).toHaveBeenCalledTimes(1);
  });

  it('registra bitacora con action create_service', async () => {
    const service = await useCase.execute(
      { name: 'Classic Haircut', duration: 30 },
      'tenant-demo',
      'usr-owner'
    );

    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr-owner',
        action: 'create_service',
        entityType: 'service',
        entityId: service.id,
      })
    );
  });

  it('tenant inexistente → throw y no guarda', async () => {
    tenantRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ name: 'Classic Haircut', duration: 30 }, 'tenant-404', 'usr-owner')
    ).rejects.toThrow('Tenant not found');
    expect(serviceRepo.save).not.toHaveBeenCalled();
  });

  it('duration no múltiplo del slot del tenant → propaga el error', async () => {
    tenantRepo.findById.mockResolvedValue({ id: 'tenant-demo', settings: { slotDuration: 30 } });

    await expect(
      useCase.execute({ name: 'Classic Haircut', duration: 45 }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Service duration must be a multiple of 30 minutes');
    expect(serviceRepo.save).not.toHaveBeenCalled();
  });

  it('name demasiado corto → throw', async () => {
    await expect(
      useCase.execute({ name: 'ab', duration: 30 }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Service name must be at least 3 characters');
    expect(serviceRepo.save).not.toHaveBeenCalled();
  });

  it('normaliza description y category (vacíos → null, trim)', async () => {
    const service = await useCase.execute(
      { name: 'Classic Haircut', duration: 30, description: '  Cut & style  ', category: '  hair ' },
      'tenant-demo',
      'usr-owner'
    );

    expect(service.description).toBe('Cut & style');
    expect(service.category).toBe('hair');

    const empty = await useCase.execute(
      { name: 'Full Color', duration: 60, description: '   ', category: '' },
      'tenant-demo',
      'usr-owner'
    );

    expect(empty.description).toBeNull();
    expect(empty.category).toBeNull();
  });

  describe('bloqueo de email (F4.4a)', () => {
    const pendingSettings = {
      email_verification: { token: 'tok-abc', expiresAt: '2026-10-02T10:00:00.000Z' },
    };

    it('sin verificar + owner → 403 EMAIL_NOT_VERIFIED y NO guarda', async () => {
      tenantRepo.findById.mockResolvedValue({ id: 'tenant-demo', settings: pendingSettings });

      const error = await useCase
        .execute({ name: 'Classic Haircut', duration: 30 }, 'tenant-demo', 'usr-owner', { role: 'owner' })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.status).toBe(403);
      expect(error.code).toBe('EMAIL_NOT_VERIFIED');
      expect(serviceRepo.save).not.toHaveBeenCalled();
      expect(bitacoraService.log).not.toHaveBeenCalled();
    });

    it('sin verificar + admin (X-Tenant-Id) → exento, crea', async () => {
      tenantRepo.findById.mockResolvedValue({ id: 'tenant-demo', settings: pendingSettings });

      const service = await useCase.execute(
        { name: 'Classic Haircut', duration: 30 },
        'tenant-demo',
        'usr-admin',
        { role: 'admin', isImpersonating: true }
      );

      expect(service.id.startsWith('svc-')).toBe(true);
      expect(serviceRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
