/**
 * @file GetTenantUseCase.ts
 * @module application/use-cases/admin
 *
 * Detalle completo de un tenant cualquiera (F4.0 superficie A,
 * GET /admin/tenants/:tenantId). Sin bitácora (lectura).
 */

import Tenant from '../../../domain/entities/Tenant';
import type ITenantRepository from '../../interfaces/ITenantRepository';
import logger from '../../../infrastructure/logging/requestContext';
import { NotFoundError } from '../../../infrastructure/errors';
import { TENANT_NOT_FOUND } from '../../../infrastructure/errors/mr-codes';

export default class GetTenantUseCase {
  constructor(private readonly tenantRepository: ITenantRepository) {}

  async execute(tenantId: string): Promise<Tenant> {
    logger.info({ tenantId }, 'GetTenantUseCase: starting');
    const record = await this.tenantRepository.findByIdFull(tenantId);
    if (!record) {
      throw new NotFoundError('Tenant not found', TENANT_NOT_FOUND);
    }
    logger.info({ tenantId }, 'GetTenantUseCase: completed');
    return Tenant.reconstitute(record);
  }
}
