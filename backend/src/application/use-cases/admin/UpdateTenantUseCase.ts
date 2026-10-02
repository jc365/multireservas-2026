/**
 * @file UpdateTenantUseCase.ts
 * @module application/use-cases/admin
 *
 * Edición total de un tenant cualquiera (F4.0 superficie A,
 * PUT /admin/tenants/:tenantId). Mismo contrato que PUT /tenants/me
 * (payload completo, un solo guardado) pero con action de bitácora
 * `update_tenant` y `tenantId` explícito (F0 #13).
 *
 * Valida todo vía `Tenant.withConfig()` antes de escribir: cualquier
 * error de validación lanza con mensaje apto para 400 y no toca la BD.
 */

import Tenant from '../../../domain/entities/Tenant';
import type ITenantRepository from '../../interfaces/ITenantRepository';
import { type UpdateTenantConfigInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';
import { NotFoundError, AppError, ValidationError } from '../../../infrastructure/errors';
import { TENANT_NOT_FOUND } from '../../../infrastructure/errors/mr-codes';
import { preserveEmailVerification } from '../../../domain/value-objects/TenantSettings';

export default class UpdateTenantUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(
    tenantId: string,
    input: UpdateTenantConfigInput,
    updatedBy: string
  ): Promise<Tenant> {
    logger.info({ tenantId, updatedBy }, 'UpdateTenantUseCase: starting');

    const record = await this.tenantRepository.findByIdFull(tenantId);
    if (!record) {
      throw new NotFoundError('Tenant not found', TENANT_NOT_FOUND);
    }

    const existing = Tenant.reconstitute(record);
    // withConfig valida el payload del body → ValidationError (F4.2)
    // F4.4a: `email_verification` es clave de sistema — el PUT del
    // admin la conserva (no la inyecta ni la borra): el estado de
    // verificación solo cambia en register/verify/resend.
    let updated: Tenant;
    try {
      updated = existing.withConfig({
        name: input.name,
        currency: input.currency,
        timezone: input.timezone,
        settings: preserveEmailVerification(input.settings, record.settings),
        schedules: input.schedules,
        holidays: input.holidays,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid tenant config');
    }

    const saved = await this.tenantRepository.saveConfig(tenantId, updated.toConfigRecord());

    await this.bitacoraService.log({
      userId: updatedBy,
      action: 'update_tenant',
      tenantId,
      entityType: 'tenant',
      entityId: tenantId,
      metadata: {
        name: updated.name,
        currency: updated.currency,
        timezone: updated.timezone,
        schedules: updated.schedules.length,
        holidays: updated.holidays.length,
      },
    });

    logger.info({ tenantId }, 'UpdateTenantUseCase: completed');
    return Tenant.reconstitute(saved);
  }
}
