/**
 * @file ListTenantsUseCase.ts
 * @module application/use-cases/admin
 *
 * Lista resumido de todos los tenants (F4.0 superficie A,
 * GET /admin/tenants). Solo lectura — no registra bitácora.
 */

import type ITenantRepository from '../../interfaces/ITenantRepository';
import type { TenantSummaryRecord } from '../../interfaces/ITenantRepository';
import logger from '../../../infrastructure/logging/requestContext';

export default class ListTenantsUseCase {
  constructor(private readonly tenantRepository: ITenantRepository) {}

  async execute(): Promise<TenantSummaryRecord[]> {
    logger.info({}, 'ListTenantsUseCase: starting');
    const tenants = await this.tenantRepository.findAllSummaries();
    logger.info({ count: tenants.length }, 'ListTenantsUseCase: completed');
    return tenants;
  }
}
