/**
 * @file RegisterUseCase.test.ts
 * @module tests/unit/application/use-cases/auth
 *
 * Registro público (F4.4a): validaciones, colisión de email,
 * transacción tenant+owner, slug auto y email de verificación.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import RegisterUseCase from '../../../../../backend/src/application/use-cases/auth/RegisterUseCase';
import type IUserRepository from '../../../../../backend/src/application/interfaces/IUserRepository';
import type ITenantRepository from '../../../../../backend/src/application/interfaces/ITenantRepository';
import type {
  TenantFullRecord,
  CreateTenantWithOwnerInput,
} from '../../../../../backend/src/application/interfaces/ITenantRepository';
import type HashService from '../../../../../backend/src/infrastructure/security/HashService';
import type BitacoraService from '../../../../../backend/src/infrastructure/logging/BitacoraService';
import type EmailService from '../../../../../backend/src/infrastructure/email/EmailService';
import { ConflictError, ValidationError } from '../../../../../backend/src/infrastructure/errors';
import { decodePayload } from '../../../../helpers/jwt';

const fullTenant: TenantFullRecord = {
  id: 'ten-x',
  name: 'Mi Café Peluquería',
  slug: 'mi-cafe-peluqueria',
  currency: 'EUR',
  timezone: 'UTC',
  settings: {},
  schedules: [],
  holidays: [],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const validInput = {
  email: 'newowner@test.com',
  password: 'secret123',
  ownerName: 'New Owner',
  businessName: 'Mi Café Peluquería',
};

describe('RegisterUseCase', () => {
  let userRepository: jest.Mocked<IUserRepository>;
  let tenantRepository: jest.Mocked<ITenantRepository>;
  let hashService: jest.Mocked<HashService>;
  let bitacoraService: jest.Mocked<BitacoraService>;
  let emailService: { sendVerificationEmail: ReturnType<typeof vi.fn> };
  let useCase: RegisterUseCase;

  beforeEach(() => {
    userRepository = {
      findById: vi.fn(),
      findByEmail: vi.fn().mockResolvedValue(null),
      findOwnerByTenantId: vi.fn(),
      findAll: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    tenantRepository = {
      findById: vi.fn(),
      findByIdFull: vi.fn(),
      findAllSummaries: vi.fn(),
      findBySlug: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      createWithOwner: vi.fn().mockResolvedValue({ tenant: fullTenant, userId: 'usr-new' }),
      updateActive: vi.fn(),
      saveConfig: vi.fn(),
    };
    hashService = {
      hash: vi.fn().mockResolvedValue('$2b$hashed'),
      compare: vi.fn(),
    } as unknown as jest.Mocked<HashService>;
    bitacoraService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BitacoraService>;
    emailService = { sendVerificationEmail: vi.fn().mockResolvedValue(true) };
    useCase = new RegisterUseCase(
      userRepository,
      tenantRepository,
      hashService,
      bitacoraService,
      emailService as unknown as EmailService
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('crea tenant + owner (transacción), envía email y devuelve JWT de owner', async () => {
    const result = await useCase.execute(validInput);

    expect(result.role).toBe('owner');
    expect(result.userId).toBe('usr-new');
    expect(result.tenantId).toMatch(/^ten-/);
    expect(result.email).toBe('newowner@test.com');

    const payload = decodePayload(result.token);
    expect(payload).toMatchObject({ userId: 'usr-new', tenantId: result.tenantId, role: 'owner' });

    expect(tenantRepository.createWithOwner).toHaveBeenCalledTimes(1);
    const input = tenantRepository.createWithOwner.mock.calls[0][0] as CreateTenantWithOwnerInput;
    expect(input.tenant.id).toBe(result.tenantId);
    expect(input.tenant.slug).toBe('mi-cafe-peluqueria');
    expect(input.owner).toEqual({
      id: expect.stringMatching(/^usr-/),
      name: 'New Owner',
      email: 'newowner@test.com',
      password: '$2b$hashed',
    });

    const settings = input.tenant.settings as { email_verification?: { token: string; expiresAt: string } };
    expect(settings.email_verification?.token).toEqual(expect.any(String));
    expect(Date.parse(settings.email_verification!.expiresAt)).toBeGreaterThan(Date.now());

    expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
      'newowner@test.com',
      settings.email_verification!.token
    );
    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: expect.stringMatching(/^usr-/),
        action: 'create_tenant',
        metadata: expect.objectContaining({ source: 'register', email: 'newowner@test.com' }),
      })
    );
  });

  it('email ya registrado → 409 USER_EMAIL_EXISTS y no toca la BD', async () => {
    userRepository.findByEmail.mockResolvedValue({ id: 'usr-existing' } as never);

    const error = await useCase.execute(validInput).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('USER_EMAIL_EXISTS');
    expect(tenantRepository.createWithOwner).not.toHaveBeenCalled();
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('password corta → 400 (mínimo 8 caracteres)', async () => {
    const error = await useCase.execute({ ...validInput, password: 'short' }).catch((e) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.status).toBe(400);
    expect(error.message).toContain('at least 8 characters');
    expect(tenantRepository.createWithOwner).not.toHaveBeenCalled();
  });

  it.each(['email', 'password', 'ownerName', 'businessName'] as const)(
    '%s ausente/vacío → 400',
    async (field) => {
      await expect(
        useCase.execute({ ...validInput, [field]: '' })
      ).rejects.toThrow(`${field} is required`);
      expect(tenantRepository.createWithOwner).not.toHaveBeenCalled();
    }
  );

  it('email con formato inválido → 400', async () => {
    await expect(
      useCase.execute({ ...validInput, email: 'no-es-email' })
    ).rejects.toThrow('Invalid email format');
  });

  it('slug en colisión → sufijo -2', async () => {
    tenantRepository.findBySlug.mockImplementation(async (slug: string) =>
      slug === 'mi-cafe-peluqueria' ? ({ id: 'ten-other' } as never) : null
    );

    await useCase.execute(validInput);

    const input = tenantRepository.createWithOwner.mock.calls[0][0] as CreateTenantWithOwnerInput;
    expect(input.tenant.slug).toBe('mi-cafe-peluqueria-2');
  });

  it('carrera P2002 en email → 409 USER_EMAIL_EXISTS', async () => {
    tenantRepository.createWithOwner.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['email'] },
    });

    const error = await useCase.execute(validInput).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('USER_EMAIL_EXISTS');
  });

  it('carrera P2002 en slug → 409 SLUG_ALREADY_EXISTS', async () => {
    tenantRepository.createWithOwner.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['slug'] },
    });

    const error = await useCase.execute(validInput).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('SLUG_ALREADY_EXISTS');
  });
});
