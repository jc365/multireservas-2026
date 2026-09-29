/**
 * @file DeleteServiceUseCase.ts
 * @module application/use-cases/services
 */

import IServiceRepository from '../../interfaces/IServiceRepository';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';

export default class DeleteServiceUseCase {
  constructor(
    private readonly serviceRepository: IServiceRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(id: string, tenantId: string, deletedBy: string): Promise<void> {
    logger.info({ id, tenantId, deletedBy }, 'DeleteServiceUseCase: starting');

    const existing = await this.serviceRepository.findById(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error('Service not found');
    }

    await this.serviceRepository.delete(id);

    await this.bitacoraService.log({
      userId: deletedBy,
      action: 'delete_service',
      entityType: 'service',
      entityId: id,
      metadata: { name: existing.name.getValue() },
    });

    logger.info({ id }, 'DeleteServiceUseCase: completed');
  }
}
