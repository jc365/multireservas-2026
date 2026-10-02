/**
 * @file ResendVerificationUseCase.test.ts
 * @module tests/unit/application/use-cases/auth
 *
 * Reenvío del email de verificación (F4.4a): rota el token, envía
 * al owner y hace no-op silencioso si ya está verificado.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import ResendVerificationUseCase from '../../../../../backend/src/application/use-cases/auth/ResendVerificationUseCase';
import type ITenantRepository from '../../../../../backend/src/application/interfaces/ITenantRepository';
import type { TenantFullRecord } from '../../../../../backend/src/application/interfaces/ITenantRepository';
import type IUserRepository from '../../../../../backend/src/application/interfaces/IUserRepository';
import type EmailService from '../../../../../backend/src/infrastructure/email/EmailService';
import User from '../../../../../backend/src/domain/entities/User';
import Email from '../../../../../backend/src/domain/value-objects/Email';
import FullName from '../../../../../backend/src/domain/value-objects/FullName';
import { NotFoundError } from '../../../../../backend/src/infrastructure/errors';

const OLD_TOKEN = 'old-token-00000000000000000000000';
const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

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

describe('ResendVerificationUseCase', () => {
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let userRepo: jest.Mocked<IUserRepository>;
  let emailService: { sendVerificationEmail: ReturnType<typeof vi.fn> };
  let useCase: ResendVerificationUseCase;

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
    userRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findOwnerByTenantId: vi.fn().mockResolvedValue(
        User.create(FullName.create('Owner Demo'), Email.create('owner@test.com'), 'hash', 'usr-owner', 'owner', 'tenant-demo')
      ),
      findAll: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    emailService = { sendVerificationEmail: vi.fn().mockResolvedValue(true) };
    useCase = new ResendVerificationUseCase(
      tenantRepo,
      userRepo,
      emailService as unknown as EmailService
    );
  });

  it('pendiente → rota el token y reenvía al owner', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(
      makeRecord({ email_verification: { token: OLD_TOKEN, expiresAt: FUTURE } })
    );

    const result = await useCase.execute('tenant-demo');

    expect(result).toEqual({ sent: true });
    const [, config] = tenantRepo.saveConfig.mock.calls[0];
    const settings = config.settings as {
      email_verification?: { token: string; expiresAt: string };
    };
    expect(settings.email_verification).toBeDefined();
    expect(settings.email_verification!.token).not.toBe(OLD_TOKEN);
    expect(Date.parse(settings.email_verification!.expiresAt)).toBeGreaterThan(Date.now());

    expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
      'owner@test.com',
      settings.email_verification!.token
    );
  });

  it('ya verificado (sin clave) → no-op silencioso { sent: false }', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(makeRecord({ slotDuration: 30 }));

    const result = await useCase.execute('tenant-demo');

    expect(result).toEqual({ sent: false });
    expect(tenantRepo.saveConfig).not.toHaveBeenCalled();
    expect(userRepo.findOwnerByTenantId).not.toHaveBeenCalled();
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('el provider devuelve false → { sent: false } (200 igualmente)', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(
      makeRecord({ email_verification: { token: OLD_TOKEN, expiresAt: FUTURE } })
    );
    emailService.sendVerificationEmail.mockResolvedValue(false);

    const result = await useCase.execute('tenant-demo');

    expect(result).toEqual({ sent: false });
    expect(tenantRepo.saveConfig).toHaveBeenCalledTimes(1);
  });

  it('tenant inexistente → 404 TENANT_NOT_FOUND', async () => {
    tenantRepo.findByIdFull.mockResolvedValue(null);

    const error = await useCase.execute('nope').catch((e) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.status).toBe(404);
    expect(error.code).toBe('TENANT_NOT_FOUND');
  });
});
