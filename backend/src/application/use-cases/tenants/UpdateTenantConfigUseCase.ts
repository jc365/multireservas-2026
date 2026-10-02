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
import { AppError, NotFoundError, ValidationError } from '../../../infrastructure/errors';
import { TENANT_NOT_FOUND } from '../../../infrastructure/errors/mr-codes';
import { preserveEmailVerification } from '../../../domain/value-objects/TenantSettings';
import { assertEmailVerified, type RequesterInfo } from '../verification';

/**
 * F4.1a: `availabilityBatchSize` es un ajuste interno del motor de
 * disponibilidad — el owner NO lo edita. El PUT del owner se filtra
 * aquí (no en el VO): se conserva el valor almacenado del tenant y, si
 * no existe aún, se omite para que caiga en el default del VO. El
 * admin (UpdateTenantUseCase) sí lo puede cambiar.
 *
 * F4.4a: `email_verification` es clave de sistema — el payload del
 * owner nunca la inyecta ni la borra; solo se conserva la previa
 * (register/verify/resend son los únicos escritores).
 *
 * F4.4c: `allowCustomerAssignment` solo lo escribe el owner desde su
 * formulario (TenantConfig). Si el PUT no lo trae (p. ej. el panel de
 * admin o un cliente API antiguo) se conserva el valor almacenado en
 * vez de caer en el default `true` y pisar la decisión del owner.
 */
function filterOwnerSettings(
  inputSettings: unknown,
  previousSettings: unknown
): unknown {
  if (
    inputSettings === null ||
    typeof inputSettings !== 'object' ||
    Array.isArray(inputSettings)
  ) {
    return inputSettings;
  }
  const filtered: Record<string, unknown> = {
    ...(inputSettings as Record<string, unknown>),
  };
  const previous =
    previousSettings !== null && typeof previousSettings === 'object' && !Array.isArray(previousSettings)
      ? (previousSettings as Record<string, unknown>)
      : null;
  if (previous && typeof previous.availabilityBatchSize === 'number') {
    filtered.availabilityBatchSize = previous.availabilityBatchSize;
  } else {
    delete filtered.availabilityBatchSize;
  }
  if (
    !('allowCustomerAssignment' in filtered) &&
    previous &&
    typeof previous.allowCustomerAssignment === 'boolean'
  ) {
    filtered.allowCustomerAssignment = previous.allowCustomerAssignment;
  }
  return preserveEmailVerification(filtered, previousSettings);
}

export default class UpdateTenantConfigUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(
    tenantId: string,
    input: UpdateTenantConfigInput,
    updatedBy: string,
    requester?: RequesterInfo
  ): Promise<Tenant> {
    logger.info({ tenantId, updatedBy }, 'UpdateTenantConfigUseCase: starting');

    const record = await this.tenantRepository.findByIdFull(tenantId);
    if (!record) {
      throw new NotFoundError('Tenant not found', TENANT_NOT_FOUND);
    }

    // F4.4a: sin verificar → 403 (admin exento). El GET sigue libre.
    assertEmailVerified(record.settings, requester);

    const existing = Tenant.reconstitute(record);
    // withConfig valida perfil + settings + schedules + holidays del
    // body: los errores son de validación de entrada → 400 (F4.2).
    let updated: Tenant;
    try {
      updated = existing.withConfig({
        name: input.name,
        currency: input.currency,
        timezone: input.timezone,
        settings: filterOwnerSettings(input.settings, record.settings),
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
