/**
 * @file DeleteConfigUseCase.ts
 * @module application/use-cases/config
 */

import IConfigRepository from '../../interfaces/IConfigRepository';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';

export class DeleteConfigUseCase {
  constructor(
    private readonly configRepository: IConfigRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(key: string, deletedBy?: string) {
    logger.info({ key }, 'DeleteConfigUseCase: starting');

    const existing = await this.configRepository.findByKey(key);
    if (!existing) {
      throw new Error(`Config "${key}" not found`);
    }

    await this.configRepository.delete(key);

    await this.bitacoraService.log({
      userId: deletedBy || 'system',
      action: 'delete_config',
      metadata: { key },
    });

    logger.info({ key }, 'DeleteConfigUseCase: completed');
  }
}
