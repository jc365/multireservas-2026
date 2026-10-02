/**
 * @file VerifyEmailUseCase.test.ts
 * @module tests/unit/application/use-cases/tenants
 *
 * Verificación de email (F4.4a): token válido/inválido/caducado y
 * eliminación de la clave preservando el resto de settings.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import VerifyEmailUseCase from '../../../../../backend/src/application/use-cases/tenants/VerifyEmailUseCase';
import type {
  ITenantRepository,
  TenantFullRecord,
} from '../../../../../backend/src/application/interfaces/ITenantRepository';
import {
  NotFoundError,
  ValidationError,
} from '../../../../../backend/src/infrastructure/errors';

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 1000).toISOString();

function makeRecord(settings: Record<string, unknown>): TenantFullRecord {
  return {
    id: 'tenant-demo',
    name: 'Tenant Demo',
    slug: 'demo',
    currency: 'EUR',
    timezone: 'UTC',
    settings,
    schedules: [],
    holidays: [],
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
  };
}

describe('VerifyEmailUseCase', () => {
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let useCase: VerifyEmailUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByIdFull: vi.fn(),
      findAllSummaries: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      createWithOwner: vi.fn(),
      updateActive: vi.fn(),
      saveConfig: vi.fn().mockImplementation(async (id, config) => ({
        ...makeRecord({}),
        id,
        name: config.name,
        currency: config.currency,
        timezone: config.timezone,
        settings: config.settings,
        schedules: config.schedules as TenantFullRecord['schedules'],
        holidays: config.holidays as TenantFullRecord['holidays'],
        updatedAt: new Date('2026-09-30T12:00:00Z'),
      })),
    };
    useCase = new VerifyEmailUseCase(tenantRepo);
  });

  it('token válido → elimina la clave y conserva el resto de settings', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(
      makeRecord({ slotDuration: 30, email_verification: { token: 'tok-abc', expiresAt: FUTURE } })
    );

    const tenant = await useCase.execute('tenant-demo', { token: 'tok-abc' });

    expect(tenantRepo.saveConfig).toHaveBeenCalledTimes(1);
    const [, config] = tenantRepo.saveConfig.mock.calls[0];
    const settings = config.settings as Record<string, unknown>;
    expect(settings.email_verification).toBeUndefined();
    expect(settings.slotDuration).toBe(30);

    expect(tenant.settings.emailVerification).toBeUndefined();
  });

  it('token distinto → 400 EMAIL_VERIFICATION_INVALID_TOKEN', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(
      makeRecord({ email_verification: { token: 'tok-abc', expiresAt: FUTURE } })
    );

    const error = await useCase.execute('tenant-demo', { token: 'otro' }).catch((e) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('EMAIL_VERIFICATION_INVALID_TOKEN');
    expect(tenantRepo.saveConfig).not.toHaveBeenCalled();
  });

  it('ya verificado (sin clave) → 400 EMAIL_VERIFICATION_INVALID_TOKEN', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(makeRecord({ slotDuration: 15 }));

    const error = await useCase.execute('tenant-demo', { token: 'tok-abc' }).catch((e) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe('EMAIL_VERIFICATION_INVALID_TOKEN');
    expect(tenantRepo.saveConfig).not.toHaveBeenCalled();
  });

  it('token válido pero caducado → 400 EMAIL_VERIFICATION_EXPIRED', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(
      makeRecord({ email_verification: { token: 'tok-abc', expiresAt: PAST } })
    );

    const error = await useCase.execute('tenant-demo', { token: 'tok-abc' }).catch((e) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('EMAIL_VERIFICATION_EXPIRED');
    expect(tenantRepo.saveConfig).not.toHaveBeenCalled();
  });

  it('token ausente en el body → 400 token is required', async () => {
    await expect(useCase.execute('tenant-demo', {} as never)).rejects.toThrow('token is required');
  });

  it('tenant inexistente → 404 TENANT_NOT_FOUND', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(null);

    const error = await useCase.execute('nope', { token: 'tok' }).catch((e) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.status).toBe(404);
    expect(error.code).toBe('TENANT_NOT_FOUND');
  });
});
