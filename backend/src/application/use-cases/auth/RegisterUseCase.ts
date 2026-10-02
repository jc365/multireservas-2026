/**
 * @file RegisterUseCase.ts
 * @module application/use-cases/auth
 *
 * Registro público de tenant con owner (F4.4a, POST /auth/register).
 *
 * Flujo: valida filiación mínima (email, password ≥ 8, ownerName,
 * businessName) → email libre (409 USER_EMAIL_EXISTS) → slug
 * kebab-case auto-generado del businessName con sufijo -2/-3 en
 * colisión → crea tenant + owner en UNA transacción (repository
 * `createWithOwner`) con `settings.email_verification = { token,
 * expiresAt }` (24h) → JWT de auto-login (role=owner) → bitácora →
 * email de verificación (provider console por defecto).
 *
 * Carreras de unicidad (email/slug): se pre-comprueban y el
 * P2002 de Prisma se mapea al 409 correspondiente.
 */

import IUserRepository from '../../interfaces/IUserRepository';
import ITenantRepository, {
  type CreateTenantWithOwnerInput,
} from '../../interfaces/ITenantRepository';
import { type RegisterInput, type RegisterOutput } from '../../dtos';
import Tenant from '../../../domain/entities/Tenant';
import Email from '../../../domain/value-objects/Email';
import FullName from '../../../domain/value-objects/FullName';
import genUUID from '../../../domain/utils/genUUID';
import genToken from '../../../domain/utils/genToken';
import slugify from '../../../domain/utils/slugify';
import { generateToken } from '../../../infrastructure/middleware/auth';
import logger from '../../../infrastructure/logging/requestContext';
import HashService from '../../../infrastructure/security/HashService';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';
import { emailService as defaultEmailService } from '../../../infrastructure/email/EmailService';
import type EmailService from '../../../infrastructure/email/EmailService';
import { AppError, ConflictError, ValidationError } from '../../../infrastructure/errors';
import {
  SLUG_ALREADY_EXISTS,
  USER_EMAIL_EXISTS,
} from '../../../infrastructure/errors/mr-codes';

const MIN_PASSWORD_LENGTH = 8;
const MAX_SLUG_SUFFIX = 100;

interface UniqueViolationError {
  code?: string;
  meta?: { target?: unknown };
}

function isUniqueViolation(error: unknown): error is UniqueViolationError {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as UniqueViolationError).code === 'P2002'
  );
}

export default class RegisterUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tenantRepository: ITenantRepository,
    private readonly hashService: HashService,
    private readonly bitacoraService: BitacoraService,
    private readonly emailService: EmailService = defaultEmailService
  ) {}

  async execute(input: RegisterInput): Promise<RegisterOutput> {
    const { email, password, ownerName, businessName } = input;

    if (typeof email !== 'string' || email.trim().length === 0) {
      throw new ValidationError('email is required');
    }
    if (typeof password !== 'string' || password.length === 0) {
      throw new ValidationError('password is required');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (typeof ownerName !== 'string' || ownerName.trim().length === 0) {
      throw new ValidationError('ownerName is required');
    }
    if (typeof businessName !== 'string' || businessName.trim().length === 0) {
      throw new ValidationError('businessName is required');
    }

    const trimmedEmail = email.trim();
    logger.info({ email: trimmedEmail }, 'RegisterUseCase: starting');

    // VOs de dominio (Email/FullName) → ValidationError (F4.2).
    let userEmail;
    let userName;
    try {
      userEmail = Email.create(trimmedEmail);
      userName = FullName.create(ownerName);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid register data');
    }

    const existingUser = await this.userRepository.findByEmail(trimmedEmail);
    if (existingUser) {
      logger.warn({ email: trimmedEmail }, 'RegisterUseCase: email already registered');
      throw new ConflictError('email is already registered', USER_EMAIL_EXISTS);
    }

    const baseSlug = slugify(businessName);
    let slug = baseSlug;
    let suffix = 2;
    while (await this.tenantRepository.findBySlug(slug)) {
      slug = `${baseSlug}-${suffix++}`;
      if (suffix > MAX_SLUG_SUFFIX) {
        slug = `${baseSlug}-${genToken(6).toLowerCase()}`;
        break;
      }
    }

    const tenantId = genUUID('ten');
    const ownerId = genUUID('usr');
    const verification = { token: genToken(32), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };

    // Dominio (Tenant.reconstitute valida name/settings/schedules).
    let tenant: Tenant;
    try {
      tenant = Tenant.reconstitute({
        id: tenantId,
        name: businessName,
        slug,
        currency: 'EUR',
        timezone: 'UTC',
        settings: { email_verification: verification },
        schedules: [],
        holidays: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid tenant data');
    }

    const config = tenant.toConfigRecord();
    const hashedPassword = await this.hashService.hash(password);

    const payload: CreateTenantWithOwnerInput = {
      tenant: {
        id: tenantId,
        name: config.name,
        slug,
        currency: config.currency,
        timezone: config.timezone,
        settings: config.settings,
        schedules: config.schedules,
        holidays: config.holidays,
      },
      owner: {
        id: ownerId,
        name: userName.getValue(),
        email: userEmail.getValue(),
        password: hashedPassword,
      },
    };

    let saved;
    try {
      saved = await this.tenantRepository.createWithOwner(payload);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isUniqueViolation(error)) {
        const target = JSON.stringify(error.meta?.target ?? '').toLowerCase();
        logger.warn({ target }, 'RegisterUseCase: unique violation race');
        if (target.includes('email')) {
          throw new ConflictError('email is already registered', USER_EMAIL_EXISTS);
        }
        if (target.includes('slug')) {
          throw new ConflictError('slug already exists', SLUG_ALREADY_EXISTS);
        }
      }
      throw error;
    }

    await this.bitacoraService.log({
      userId: saved.userId,
      action: 'create_tenant',
      tenantId: null,
      entityType: 'tenant',
      entityId: tenantId,
      metadata: { source: 'register', email: userEmail.getValue(), slug },
    });

    await this.emailService.sendVerificationEmail(userEmail.getValue(), verification.token);

    const token = generateToken(saved.userId, tenantId, 'owner');
    logger.info({ tenantId, userId: saved.userId }, 'RegisterUseCase: completed');
    return {
      token,
      userId: saved.userId,
      email: userEmail.getValue(),
      name: userName.getValue(),
      role: 'owner',
      tenantId,
    };
  }
}
