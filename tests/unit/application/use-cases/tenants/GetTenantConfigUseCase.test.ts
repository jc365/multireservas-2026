import { vi, describe, it, expect, beforeEach } from 'vitest';
import GetTenantConfigUseCase from '../../../../../backend/src/application/use-cases/tenants/GetTenantConfigUseCase';
import type {
  ITenantRepository,
  TenantFullRecord,
} from '../../../../../backend/src/application/interfaces/ITenantRepository';

const fullRecord: TenantFullRecord = {
  id: 'tenant-demo',
  name: 'Tenant Demo',
  slug: 'demo',
  currency: 'EUR',
  timezone: 'Europe/Madrid',
  settings: {},
  schedules: [
    { label: 'Sábado', days: ['sat'], start: '10:00', end: '14:00', breaks: [] },
  ],
  holidays: [{ label: 'Navidad', date: '2026-12-25', recurring: true }],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-06-01T00:00:00Z'),
};

describe('GetTenantConfigUseCase', () => {
  let useCase: GetTenantConfigUseCase;
  let tenantRepo: jest.Mocked<ITenantRepository>;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByIdFull: vi.fn().mockResolvedValue(fullRecord),
      saveConfig: vi.fn(),
    };
    useCase = new GetTenantConfigUseCase(tenantRepo);
  });

  it('devuelve el tenant saneado con rrules derivadas', async () => {
    const tenant = await useCase.execute('tenant-demo');

    expect(tenantRepo.findByIdFull).toHaveBeenCalledWith('tenant-demo');
    expect(tenant.id).toBe('tenant-demo');
    expect(tenant.name).toBe('Tenant Demo');
    expect(tenant.currency).toBe('EUR');
    expect(tenant.timezone).toBe('Europe/Madrid');
    expect(tenant.slug).toBe('demo');
    expect(tenant.isActive).toBe(true);
    expect(tenant.settings.slotDuration).toBe(15);
    expect(tenant.schedules[0].rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=SA');
    expect(tenant.holidays[0].rrule).toBe('RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25');
    expect(tenant.schedules).toHaveLength(1);
    expect(tenant.holidays).toHaveLength(1);
  });

  it('tenant inexistente → throw Tenant not found', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(null);

    await expect(useCase.execute('tenant-ghost')).rejects.toThrow('Tenant not found');
  });
});
