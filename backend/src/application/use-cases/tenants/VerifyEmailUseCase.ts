/**
 * @file VerifyEmailUseCase.ts
 * @module application/use-cases/tenants
 *
 * Verificación de email del tenant (F4.4a, POST
 * /tenants/verify-email). Valida el token contra
 * `settings.email_verification` del tenant del usuario logueado:
 *
 * - sin clave (ya verificado) o token distinto → 400
 *   EMAIL_VERIFICATION_INVALID_TOKEN (comparación constante en el
 *   tiempo).
 * - caducado (> 24h) → 400 EMAIL_VERIFICATION_EXPIRED.
 * - válido → ELIMINA la clave (preserva el resto de settings) en un
 *   solo write y devuelve el tenant completo (mismo shape que GET
 *   /tenants/me).
 */

import Tenant from '../../../domain/entities/Tenant';
import type ITenantRepository from '../../interfaces/ITenantRepository';
import { type VerifyEmailInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import { AppError, NotFoundError, ValidationError } from '../../../infrastructure/errors';
import {
  TENANT_NOT_FOUND,
  EMAIL_VERIFICATION_INVALID_TOKEN,
  EMAIL_VERIFICATION_EXPIRED,
} from '../../../infrastructure/errors/mr-codes';
import { tokensMatch } from '../verification';

function plainSettings(raw: unknown): Record<string, unknown> {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

export default class VerifyEmailUseCase {
  constructor(private readonly tenantRepository: ITenantRepository) {}

  async execute(tenantId: string, input: VerifyEmailInput): Promise<Tenant> {
    if (!input || typeof input.token !== 'string' || input.token.length === 0) {
      throw new ValidationError('token is required');
    }

    logger.info({ tenantId }, 'VerifyEmailUseCase: starting');

    const record = await this.tenantRepository.findByIdFull(tenantId);
    if (!record) {
      throw new NotFoundError('Tenant not found', TENANT_NOT_FOUND);
    }

    const existing = Tenant.reconstitute(record);
    const pending = existing.settings.emailVerification;
    if (!pending || !tokensMatch(pending.token, input.token)) {
      logger.warn({ tenantId }, 'VerifyEmailUseCase: invalid token');
      throw new ValidationError(
        'verification token is invalid',
        EMAIL_VERIFICATION_INVALID_TOKEN
      );
    }
    if (Date.parse(pending.expiresAt) < Date.now()) {
      logger.warn({ tenantId }, 'VerifyEmailUseCase: expired token');
      throw new ValidationError(
        'verification token has expired',
        EMAIL_VERIFICATION_EXPIRED
      );
    }

    const stripped = plainSettings(record.settings);
    delete stripped.email_verification;

    let updated: Tenant;
    try {
      updated = existing.withConfig({
        name: existing.name,
        currency: existing.currency,
        timezone: existing.timezone,
        settings: stripped,
        schedules: record.schedules,
        holidays: record.holidays,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(
        error instanceof Error ? error.message : 'Invalid tenant config'
      );
    }

    const saved = await this.tenantRepository.saveConfig(
      tenantId,
      updated.toConfigRecord()
    );

    logger.info({ tenantId }, 'VerifyEmailUseCase: completed');
    return Tenant.reconstitute(saved);
  }
}
