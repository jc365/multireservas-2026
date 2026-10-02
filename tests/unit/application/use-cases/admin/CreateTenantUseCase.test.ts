/**
 * @file CreateTenantUseCase.test.ts
 * @module tests/unit/application/use-cases/admin
 *
 * F4.0 superficie A: POST /admin/tenants crea SOLO el tenant.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import CreateTenantUseCase from '../../../../../backend/src/application/use-cases/admin/CreateTenantUseCase';
import type {
  ITenantRepository,
  TenantFullRecord,
} from '../../../../../backend/src/application/interfaces/ITenantRepository';
import type BitacoraService from '../../../../../backend/src/infrastructure/logging/BitacoraService';

function emptyFullRecord(overrides: Partial<TenantFullRecord> = {}): TenantFullRecord {
  return {
    id: 'ten-new',
    name: 'Nuevo Tenant',
    slug: 'nuevo',
    currency: 'EUR',
    timezone: 'UTC',
    settings: {},
    schedules: [],
    holidays: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('CreateTenantUseCase', () => {
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let bitacoraService: jest.Mocked<BitacoraService>;
  let useCase: CreateTenantUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByIdFull: vi.fn(),
      findAllSummaries: vi.fn(),
      findBySlug: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(async (rec) => emptyFullRecord({ ...rec, createdAt: new Date(), updatedAt: new Date() })),
      updateActive: vi.fn(),
      saveConfig: vi.fn(),
    } as unknown as jest.Mocked<ITenantRepository>;
    bitacoraService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BitacoraService>;
    useCase = new CreateTenantUseCase(tenantRepo, bitacoraService);
  });

  it('crea el tenant con defaults (EUR/UTC, isActive, id con prefijo ten-) y registra create_tenant', async () => {
    const tenant = await useCase.execute({ name: 'Nuevo Tenant', slug: 'nuevo' }, 'usr-admin');

    expect(tenantRepo.create).toHaveBeenCalledTimes(1);
    const record = tenantRepo.create.mock.calls[0][0];
    expect(record.id).toMatch(/^ten-/);
    expect(record.name).toBe('Nuevo Tenant');
    expect(record.slug).toBe('nuevo');
    expect(record.currency).toBe('EUR');
    expect(record.timezone).toBe('UTC');

    expect(tenant.id).toBe(record.id);
    expect(tenant.isActive).toBe(true);

    // F0 #15: create_tenant es acción de plataforma → tenantId null
    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr-admin',
        action: 'create_tenant',
        tenantId: null,
        entityType: 'tenant',
        entityId: record.id,
      })
    );
  });

  it('slug se normaliza a minúsculas y se valida unicidad', async () => {
    tenantRepo.findBySlug.mockResolvedValue(null as never);
    const tenant = await useCase.execute({ name: 'X', slug: '  Mi-Tenant  ' }, 'usr-admin');

    expect(tenantRepo.findBySlug).toHaveBeenCalledWith('mi-tenant');
    expect(tenant.slug).toBe('mi-tenant');
  });

  it('slug duplicado → lanza slug already exists y NO crea', async () => {
    tenantRepo.findBySlug.mockResolvedValue({
      id: 'tenant-exists',
      name: 'Existe',
      slug: 'demo',
      currency: 'EUR',
      timezone: 'UTC',
      isActive: true,
      createdAt: new Date(),
    } as never);

    await expect(useCase.execute({ name: 'X', slug: 'demo' }, 'usr-admin')).rejects.toThrow(
      'slug already exists'
    );
    expect(tenantRepo.create).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });

  it('slug inválido (con espacios/mayúsculas no normalizables) → 400', async () => {
    await expect(useCase.execute({ name: 'X', slug: 'foo bar!' }, 'usr-admin')).rejects.toThrow(
      'slug must contain only lowercase letters, numbers and hyphens'
    );
    expect(tenantRepo.create).not.toHaveBeenCalled();
  });

  it('name vacío → name is required y NO crea', async () => {
    await expect(useCase.execute({ name: '   ' }, 'usr-admin')).rejects.toThrow('name is required');
    expect(tenantRepo.create).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });

  it('schedule inválido → lanza validación del dominio y NO crea', async () => {
    await expect(
      useCase.execute(
        {
          name: 'X',
          schedules: [{ label: 'Malo', days: ['lun'], start: '25:00', end: '10:00', breaks: [] }],
        },
        'usr-admin'
      )
    ).rejects.toThrow();
    expect(tenantRepo.create).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });

  it('sin slug → slug null', async () => {
    const tenant = await useCase.execute({ name: 'Sin Slug' }, 'usr-admin');
    expect(tenant.slug).toBeNull();
    expect(tenantRepo.findBySlug).not.toHaveBeenCalled();
  });
});
