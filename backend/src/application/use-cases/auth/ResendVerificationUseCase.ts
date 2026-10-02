/**
 * @file ResendVerificationUseCase.ts
 * @module application/use-cases/auth
 *
 * Reenvío del email de verificación (F4.4a, POST
 * /auth/resend-verification — autenticado). Regenera el token en la
 * misma clave `settings.email_verification` (nuevo expiresAt +24h) y
 * reenvía el email al owner del tenant con el mismo link.
 *
 * No-op silencioso si el tenant YA está verificado (sin clave):
 * devuelve `{ sent: false }` sin tocar la BD ni enviar nada.
 */

import Tenant from '../../../domain/entities/Tenant';
import type ITenantRepository from '../../interfaces/ITenantRepository';
import type IUserRepository from '../../interfaces/IUserRepository';
import { type ResendVerificationOutput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';
import { emailService as defaultEmailService } from '../../../infrastructure/email/EmailService';
import type EmailService from '../../../infrastructure/email/EmailService';
import { NotFoundError, AppError, ValidationError } from '../../../infrastructure/errors';
import { TENANT_NOT_FOUND } from '../../../infrastructure/errors/mr-codes';
import { createVerificationValue } from '../verification';

function plainSettings(raw: unknown): Record<string, unknown> {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

export default class ResendVerificationUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly userRepository: IUserRepository,
    private readonly emailService: EmailService = defaultEmailService
  ) {}

  async execute(tenantId: string): Promise<ResendVerificationOutput> {
    logger.info({ tenantId }, 'ResendVerificationUseCase: starting');

    const record = await this.tenantRepository.findByIdFull(tenantId);
    if (!record) {
      throw new NotFoundError('Tenant not found', TENANT_NOT_FOUND);
    }

    const existing = Tenant.reconstitute(record);
    if (!existing.settings.emailVerification) {
      logger.info({ tenantId }, 'ResendVerificationUseCase: already verified — no-op');
      return { sent: false };
    }

    const owner = await this.userRepository.findOwnerByTenantId(tenantId);
    if (!owner) {
      throw new NotFoundError('Owner user not found');
    }

    const verification = createVerificationValue();
    const withNewToken = plainSettings(record.settings);
    withNewToken.email_verification = verification;

    let updated: Tenant;
    try {
      updated = existing.withConfig({
        name: existing.name,
        currency: existing.currency,
        timezone: existing.timezone,
        settings: withNewToken,
        schedules: record.schedules,
        holidays: record.holidays,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(
        error instanceof Error ? error.message : 'Invalid tenant config'
      );
    }

    await this.tenantRepository.saveConfig(tenantId, updated.toConfigRecord());

    const sent = await this.emailService.sendVerificationEmail(
      owner.email.getValue(),
      verification.token
    );

    logger.info({ tenantId, sent }, 'ResendVerificationUseCase: completed');
    return { sent };
  }
}
