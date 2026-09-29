/**
 * @file GetServiceUseCase.ts
 * @module application/use-cases/services
 */

import Service from '../../../domain/entities/Service';
import IServiceRepository from '../../interfaces/IServiceRepository';
import logger from '../../../infrastructure/logging/requestContext';

export default class GetServiceUseCase {
  constructor(private readonly serviceRepository: IServiceRepository) {}

  /**
   * Devuelve el servicio solo si pertenece al tenant; en caso
   * contrario null (evita filtrar la existencia cross-tenant → 404).
   */
  async execute(id: string, tenantId: string): Promise<Service | null> {
    logger.info({ id, tenantId }, 'GetServiceUseCase: starting');
    const service = await this.serviceRepository.findById(id);
    if (!service || service.tenantId !== tenantId) {
      logger.warn({ id, tenantId }, 'GetServiceUseCase: not found (or foreign tenant)');
      return null;
    }
    return service;
  }
}
