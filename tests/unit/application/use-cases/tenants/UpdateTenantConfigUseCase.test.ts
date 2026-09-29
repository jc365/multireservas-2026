import { vi, describe, it, expect, beforeEach } from 'vitest';
import UpdateTenantConfigUseCase from '../../../../../backend/src/application/use-cases/tenants/UpdateTenantConfigUseCase';
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
  settings: { slotDuration: 30, requireClientPhone: false },
  schedules: [
    {
      label: 'Horario semanal',
      days: ['fri', 'mon'],
      start: '09:00',
      end: '18:00',
      breaks: [{ start: '13:00', end: '14:00' }],
    },
  ],
  holidays: [{ label: 'Navidad', date: '2026-12-25', recurring: true }],
};

describe('UpdateTenantConfigUseCase', () => {
  let useCase: UpdateTenantConfigUseCase;
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let bitacoraService: jest.Mocked<BitacoraService>;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByIdFull: vi.fn().mockResolvedValue(originalRecord),
      saveConfig: vi.fn().mockImplementation(async (id, config) => ({
        ...originalRecord,
        ...config,
        schedules: config.schedules as TenantFullRecord['schedules'],
        holidays: config.holidays as TenantFullRecord['holidays'],
        updatedAt: new Date('2026-09-29T12:00:00Z'),
      })),
    };
    bitacoraService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BitacoraService>;
    useCase = new UpdateTenantConfigUseCase(tenantRepo, bitacoraService);
  });

  it('valida todo, guarda en un solo write y registra bitácora', async () => {
    const tenant = await useCase.execute('tenant-demo', validInput, 'usr-owner');

    expect(tenantRepo.saveConfig).toHaveBeenCalledTimes(1);
    const [tenantId, config] = tenantRepo.saveConfig.mock.calls[0];
    expect(tenantId).toBe('tenant-demo');
    expect(config.name).toBe('Renombrado');
    expect(config.currency).toBe('USD');
    expect(config.timezone).toBe('America/New_York');
    expect(config.settings).toMatchObject({
      slotDuration: 30,
      requireClientPhone: false,
      requireClientEmail: false,
      clientDataRetention: 'nextMonth',
      defaultLanguage: 'en',
    });
    const schedules = config.schedules as Array<{ days: string[]; rrule: string }>;
    expect(schedules[0].days).toEqual(['mon', 'fri']);
    expect(schedules[0].rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,FR');
    const holidays = config.holidays as Array<{ rrule: string }>;
    expect(holidays[0].rrule).toBe('RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25');

    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr-owner',
        action: 'update_tenant_config',
        entityType: 'tenant',
        entityId: 'tenant-demo',
        metadata: expect.objectContaining({ name: 'Renombrado', slotDuration: 30 }),
      })
    );

    expect(tenant.name).toBe('Renombrado');
    expect(tenant.settings.slotDuration).toBe(30);
    expect(tenant.updatedAt).toEqual(new Date('2026-09-29T12:00:00Z'));
  });

  it('la rrule se regenera aunque el input traiga una rrule ajena', async () => {
    await useCase.execute(
      'tenant-demo',
      {
        ...validInput,
        schedules: [
          {
            label: 'X',
            days: ['sat'],
            start: '10:00',
            end: '14:00',
            breaks: [],
            rrule: 'RRULE:FREQ=DAILY',
          },
        ],
      },
      'usr-owner'
    );

    const [, config] = tenantRepo.saveConfig.mock.calls[0];
    const schedules = config.schedules as Array<{ rrule: string }>;
    expect(schedules[0].rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=SA');
  });

  it('payload inválido → throw y NO escribe ni registra bitácora', async () => {
    await expect(
      useCase.execute(
        'tenant-demo',
        { ...validInput, settings: { slotDuration: 20 } },
        'usr-owner'
      )
    ).rejects.toThrow('slotDuration must be one of 15, 30, 45 or 60');
    expect(tenantRepo.saveConfig).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();

    await expect(
      useCase.execute('tenant-demo', { ...validInput, timezone: 'bad/zone' }, 'usr-owner')
    ).rejects.toThrow('timezone must be a valid IANA time zone');
    await expect(
      useCase.execute(
        'tenant-demo',
        {
          ...validInput,
          schedules: [
            { label: 'X', days: ['mon'], start: '18:00', end: '09:00', breaks: [] },
          ],
        },
        'usr-owner'
      )
    ).rejects.toThrow('schedule start must be before schedule end');
    expect(tenantRepo.saveConfig).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });

  it('tenant inexistente → throw Tenant not found', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(null);

    await expect(
      useCase.execute('tenant-ghost', validInput, 'usr-owner')
    ).rejects.toThrow('Tenant not found');
    expect(tenantRepo.saveConfig).not.toHaveBeenCalled();
  });
});
