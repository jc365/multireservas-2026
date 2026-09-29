/**
 * @file GetTenantConfigUseCase.ts
 * @module application/use-cases/tenants
 *
 * Devuelve el tenant completo (perfil + settings + schedules +
 * holidays, F3.4 #9) sin empleados ni servicios. Usado por
 * `GET /tenants/me` (owner/employee) y por CreateReservation para
 * leer `requireClientPhone`/`requireClientEmail`.
 */

import Tenant from '../../../domain/entities/Tenant';
import type ITenantRepository from '../../interfaces/ITenantRepository';
import logger from '../../../infrastructure/logging/requestContext';

export default class GetTenantConfigUseCase {
  constructor(private readonly tenantRepository: ITenantRepository) {}

  async execute(tenantId: string): Promise<Tenant> {
    logger.info({ tenantId }, 'GetTenantConfigUseCase: starting');

    const record = await this.tenantRepository.findByIdFull(tenantId);
    if (!record) {
      throw new Error('Tenant not found');
    }

    const tenant = Tenant.reconstitute(record);
    logger.info({ tenantId }, 'GetTenantConfigUseCase: completed');
    return tenant;
  }
}
