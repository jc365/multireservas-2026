/**
 * @file GetTenantUseCase.test.ts
 * @module tests/unit/application/use-cases/admin
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import GetTenantUseCase from '../../../../../backend/src/application/use-cases/admin/GetTenantUseCase';
import type {
  ITenantRepository,
  TenantFullRecord,
} from '../../../../../backend/src/application/interfaces/ITenantRepository';

const record: TenantFullRecord = {
  id: 'tenant-demo',
  name: 'Tenant Demo',
  slug: 'demo',
  currency: 'EUR',
  timezone: 'UTC',
  settings: { requireClientPhone: true },
  schedules: [
    {
      label: 'Horario semanal',
      days: ['mon', 'tue'],
      start: '09:00',
      end: '18:00',
      breaks: [],
      rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU',
    },
  ],
  holidays: [{ label: 'Navidad', date: '2026-12-25', recurring: true, rrule: 'RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25' }],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-06-01T00:00:00Z'),
};

describe('GetTenantUseCase', () => {
  let tenantRepo: jest.Mocked<ITenantRepository>;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByIdFull: vi.fn().mockResolvedValue(record),
      findAllSummaries: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      updateActive: vi.fn(),
      saveConfig: vi.fn(),
    } as unknown as jest.Mocked<ITenantRepository>;
  });

  it('devuelve el tenant con config completa (settings/schedules/holidays)', async () => {
    const useCase = new GetTenantUseCase(tenantRepo);
    const tenant = await useCase.execute('tenant-demo');

    expect(tenantRepo.findByIdFull).toHaveBeenCalledWith('tenant-demo');
    expect(tenant.id).toBe('tenant-demo');
    expect(tenant.slug).toBe('demo');
    expect(tenant.settings.getValue()).toMatchObject({ requireClientPhone: true });
    expect(tenant.schedules).toHaveLength(1);
    expect(tenant.schedules[0].getValue().rrule).toContain('BYDAY=MO,TU');
    expect(tenant.holidays).toHaveLength(1);
  });

  it('tenant inexistente → lanza Tenant not found', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(null as never);
    const useCase = new GetTenantUseCase(tenantRepo);

    await expect(useCase.execute('tenant-ghost')).rejects.toThrow('Tenant not found');
  });
});
