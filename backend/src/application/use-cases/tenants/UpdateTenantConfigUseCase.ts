/**
 * @file UpdateTenantConfigUseCase.ts
 * @module application/use-cases/tenants
 *
 * Actualización total de la configuración del tenant en un solo
 * guardado (F3.4 #10). Valida todo (perfil + settings + schedules +
 * holidays) vía `Tenant.withConfig()` antes de escribir: cualquier
 * error de validación lanza con mensaje apto para 400 y no toca la
 * BD. Registra bitácora `update_tenant_config`.
 */

import Tenant from '../../../domain/entities/Tenant';
import type ITenantRepository from '../../interfaces/ITenantRepository';
import { type UpdateTenantConfigInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';

export default class UpdateTenantConfigUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(
    tenantId: string,
    input: UpdateTenantConfigInput,
    updatedBy: string
  ): Promise<Tenant> {
    logger.info({ tenantId, updatedBy }, 'UpdateTenantConfigUseCase: starting');

    const record = await this.tenantRepository.findByIdFull(tenantId);
    if (!record) {
      throw new Error('Tenant not found');
    }

    const existing = Tenant.reconstitute(record);
    const updated = existing.withConfig({
      name: input.name,
      currency: input.currency,
      timezone: input.timezone,
      settings: input.settings,
      schedules: input.schedules,
      holidays: input.holidays,
    });

    const saved = await this.tenantRepository.saveConfig(tenantId, updated.toConfigRecord());

    await this.bitacoraService.log({
      userId: updatedBy,
      action: 'update_tenant_config',
      entityType: 'tenant',
      entityId: tenantId,
      metadata: {
        name: updated.name,
        currency: updated.currency,
        timezone: updated.timezone,
        slotDuration: updated.settings.slotDuration,
        schedules: updated.schedules.length,
        holidays: updated.holidays.length,
      },
    });

    logger.info({ tenantId }, 'UpdateTenantConfigUseCase: completed');
    return Tenant.reconstitute(saved);
  }
}
