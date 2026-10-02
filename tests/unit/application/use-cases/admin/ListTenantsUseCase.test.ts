/**
 * @file ListTenantsUseCase.test.ts
 * @module tests/unit/application/use-cases/admin
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import ListTenantsUseCase from '../../../../../backend/src/application/use-cases/admin/ListTenantsUseCase';
import type {
  ITenantRepository,
  TenantSummaryRecord,
} from '../../../../../backend/src/application/interfaces/ITenantRepository';

const summaries: TenantSummaryRecord[] = [
  {
    id: 'tenant-demo',
    name: 'Tenant Demo',
    slug: 'demo',
    currency: 'EUR',
    timezone: 'UTC',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'tenant-off',
    name: 'Tenant Off',
    slug: null,
    currency: 'EUR',
    timezone: 'UTC',
    isActive: false,
    createdAt: new Date('2026-02-01T00:00:00Z'),
  },
];

describe('ListTenantsUseCase', () => {
  let tenantRepo: jest.Mocked<ITenantRepository>;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByIdFull: vi.fn(),
      findAllSummaries: vi.fn().mockResolvedValue(summaries),
      findBySlug: vi.fn(),
      create: vi.fn(),
      updateActive: vi.fn(),
      saveConfig: vi.fn(),
    } as unknown as jest.Mocked<ITenantRepository>;
  });

  it('devuelve el resumen de todos los tenants', async () => {
    const useCase = new ListTenantsUseCase(tenantRepo);
    const result = await useCase.execute();

    expect(tenantRepo.findAllSummaries).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'tenant-demo', slug: 'demo', isActive: true });
    expect(result[1]).toMatchObject({ id: 'tenant-off', isActive: false });
  });

  it('lista vacía si no hay tenants', async () => {
    tenantRepo.findAllSummaries.mockResolvedValue([] as never);
    const useCase = new ListTenantsUseCase(tenantRepo);

    expect(await useCase.execute()).toEqual([]);
  });
});
