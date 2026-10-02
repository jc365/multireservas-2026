/**
 * @file SetTenantActiveUseCase.ts
 * @module application/use-cases/admin
 *
 * Activar/desactivar un tenant (F4.0 superficie A,
 * PATCH /admin/tenants/:tenantId/active). Soft delete: apagar el
 * tenant no borra datos.
 *
 * Bitácora (F0 #13, `tenantId` = tenant afectado):
 * - isActive=false → `delete_tenant` (soft delete).
 * - isActive=true  → `update_tenant` con metadata `{ isActive: true }`.
 */

import Tenant from '../../../domain/entities/Tenant';
import type ITenantRepository from '../../interfaces/ITenantRepository';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';
import { NotFoundError } from '../../../infrastructure/errors';
import { TENANT_NOT_FOUND } from '../../../infrastructure/errors/mr-codes';

export default class SetTenantActiveUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(tenantId: string, isActive: boolean, updatedBy: string): Promise<Tenant> {
    logger.info({ tenantId, isActive, updatedBy }, 'SetTenantActiveUseCase: starting');

    const record = await this.tenantRepository.findByIdFull(tenantId);
    if (!record) {
      throw new NotFoundError('Tenant not found', TENANT_NOT_FOUND);
    }

    const saved = await this.tenantRepository.updateActive(tenantId, isActive);

    await this.bitacoraService.log({
      userId: updatedBy,
      action: isActive ? 'update_tenant' : 'delete_tenant',
      tenantId,
      entityType: 'tenant',
      entityId: tenantId,
      metadata: { isActive, name: saved.name },
    });

    logger.info({ tenantId, isActive }, 'SetTenantActiveUseCase: completed');
    return Tenant.reconstitute(saved);
  }
}
