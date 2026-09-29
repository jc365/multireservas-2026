/**
 * @file ListServicesUseCase.ts
 * @module application/use-cases/services
 */

import Service from '../../../domain/entities/Service';
import IServiceRepository from '../../interfaces/IServiceRepository';
import logger from '../../../infrastructure/logging/requestContext';

export default class ListServicesUseCase {
  constructor(private readonly serviceRepository: IServiceRepository) {}

  async execute(tenantId: string): Promise<Service[]> {
    logger.info({ tenantId }, 'ListServicesUseCase: starting');
    const services = await this.serviceRepository.findByTenantId(tenantId);
    logger.info({ tenantId, count: services.length }, 'ListServicesUseCase: completed');
    return services;
  }
}
