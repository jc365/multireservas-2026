/**
 * @file UpdateTenantUseCase.test.ts
 * @module tests/unit/application/use-cases/admin
 *
 * F4.0 superficie A: PUT /admin/tenants/:tenantId — edición total
 * con action `update_tenant` y tenantId explícito en bitácora (F0 #13).
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import UpdateTenantUseCase from '../../../../../backend/src/application/use-cases/admin/UpdateTenantUseCase';
import type {
  ITenantRepository,
  TenantFullRecord,
} from '../../../../../backend/src/application/interfaces/ITenantRepository';
import type BitacoraService from '../../../../../backend/src/infrastructure/logging/BitacoraService';

const originalRecord: TenantFullRecord = {
  id: 'tenant-demo',
  name: 'Tenant Demo',
  slug: 'demo',
  currency: 'EUR',
  timezone: 'UTC',
  settings: { requireClientPhone: true },
  schedules: [],
  holidays: [],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-06-01T00:00:00Z'),
};

const validInput = {
  name: 'Renombrado',
  currency: 'USD',
  timezone: 'America/New_York',
  settings: { slotDuration: 30 },
  schedules: [
    {
      label: 'Horario semanal',
      days: ['mon', 'fri'],
      start: '09:00',
      end: '18:00',
      breaks: [{ start: '13:00', end: '14:00' }],
    },
  ],
  holidays: [{ label: 'Navidad', date: '2026-12-25', recurring: true }],
};

describe('UpdateTenantUseCase', () => {
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let bitacoraService: jest.Mocked<BitacoraService>;
  let useCase: UpdateTenantUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByIdFull: vi.fn().mockResolvedValue(originalRecord),
      findAllSummaries: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      updateActive: vi.fn(),
      saveConfig: vi.fn().mockImplementation(async (id, config) => ({
        ...originalRecord,
        ...config,
        updatedAt: new Date('2026-09-29T12:00:00Z'),
      })),
    } as unknown as jest.Mocked<ITenantRepository>;
    bitacoraService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BitacoraService>;
    useCase = new UpdateTenantUseCase(tenantRepo, bitacoraService);
  });

  it('guarda en un solo write y registra update_tenant con tenantId (F0 #13)', async () => {
    const tenant = await useCase.execute('tenant-demo', validInput, 'usr-admin');

    expect(tenantRepo.saveConfig).toHaveBeenCalledTimes(1);
    const [tenantId, config] = tenantRepo.saveConfig.mock.calls[0];
    expect(tenantId).toBe('tenant-demo');
    expect(config.name).toBe('Renombrado');
    expect(config.currency).toBe('USD');
    expect(config.timezone).toBe('America/New_York');

    expect(tenant.name).toBe('Renombrado');
    expect(tenant.schedules).toHaveLength(1);
    expect(tenant.schedules[0].getValue().rrule).toContain('BYDAY=MO,FR');

    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr-admin',
        action: 'update_tenant',
        tenantId: 'tenant-demo',
        entityType: 'tenant',
        entityId: 'tenant-demo',
      })
    );
  });

  it('payload inválido (zona horaria) → lanza y NO toca la BD', async () => {
    await expect(
      useCase.execute('tenant-demo', { ...validInput, timezone: 'Marte/Olympus' }, 'usr-admin')
    ).rejects.toThrow();
    expect(tenantRepo.saveConfig).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });

  it('tenant inexistente → Tenant not found y NO escribe', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(null as never);

    await expect(useCase.execute('tenant-ghost', validInput, 'usr-admin')).rejects.toThrow(
      'Tenant not found'
    );
    expect(tenantRepo.saveConfig).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });

  it('el admin SÍ puede editar availabilityBatchSize (F4.1a)', async () => {
    await useCase.execute(
      'tenant-demo',
      { ...validInput, settings: { availabilityBatchSize: 20, advanceBookingLimit: 7 } },
      'usr-admin'
    );

    const [, config] = tenantRepo.saveConfig.mock.calls[0];
    expect(config.settings).toMatchObject({
      availabilityBatchSize: 20,
      advanceBookingLimit: 7,
    });
  });

  it('el admin con availabilityBatchSize inválido → lanza (validación estricta, F4.1a)', async () => {
    await expect(
      useCase.execute(
        'tenant-demo',
        { ...validInput, settings: { availabilityBatchSize: 999 } },
        'usr-admin'
      )
    ).rejects.toThrow('availabilityBatchSize must be an integer between 1 and 50');
    expect(tenantRepo.saveConfig).not.toHaveBeenCalled();
  });
});
