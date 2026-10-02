/**
 * @file SetTenantActiveUseCase.test.ts
 * @module tests/unit/application/use-cases/admin
 *
 * F4.0 superficie A: PATCH /admin/tenants/:tenantId/active (soft delete).
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import SetTenantActiveUseCase from '../../../../../backend/src/application/use-cases/admin/SetTenantActiveUseCase';
import type {
  ITenantRepository,
  TenantFullRecord,
} from '../../../../../backend/src/application/interfaces/ITenantRepository';
import type BitacoraService from '../../../../../backend/src/infrastructure/logging/BitacoraService';

const record: TenantFullRecord = {
  id: 'tenant-demo',
  name: 'Tenant Demo',
  slug: 'demo',
  currency: 'EUR',
  timezone: 'UTC',
  settings: {},
  schedules: [],
  holidays: [],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-06-01T00:00:00Z'),
};

describe('SetTenantActiveUseCase', () => {
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let bitacoraService: jest.Mocked<BitacoraService>;
  let useCase: SetTenantActiveUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByIdFull: vi.fn().mockResolvedValue(record),
      findAllSummaries: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      updateActive: vi.fn().mockResolvedValue({ ...record, isActive: false }),
      saveConfig: vi.fn(),
    } as unknown as jest.Mocked<ITenantRepository>;
    bitacoraService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BitacoraService>;
    useCase = new SetTenantActiveUseCase(tenantRepo, bitacoraService);
  });

  it('isActive=false → soft delete con action delete_tenant y tenantId (F0 #13)', async () => {
    const tenant = await useCase.execute('tenant-demo', false, 'usr-admin');

    expect(tenantRepo.updateActive).toHaveBeenCalledWith('tenant-demo', false);
    expect(tenant.isActive).toBe(false);
    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr-admin',
        action: 'delete_tenant',
        tenantId: 'tenant-demo',
        entityType: 'tenant',
        entityId: 'tenant-demo',
        metadata: expect.objectContaining({ isActive: false }),
      })
    );
  });

  it('isActive=true → reactiva con action update_tenant', async () => {
    tenantRepo.updateActive.mockResolvedValue({ ...record, isActive: true } as never);

    const tenant = await useCase.execute('tenant-demo', true, 'usr-admin');

    expect(tenantRepo.updateActive).toHaveBeenCalledWith('tenant-demo', true);
    expect(tenant.isActive).toBe(true);
    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update_tenant',
        tenantId: 'tenant-demo',
        metadata: { isActive: true, name: 'Tenant Demo' },
      })
    );
  });

  it('tenant inexistente → Tenant not found y no escribe', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(null as never);

    await expect(useCase.execute('tenant-ghost', false, 'usr-admin')).rejects.toThrow(
      'Tenant not found'
    );
    expect(tenantRepo.updateActive).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });
});
