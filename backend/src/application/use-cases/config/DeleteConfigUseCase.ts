/**
 * @file DeleteConfigUseCase.ts
 * @module application/use-cases/config
 */

import IConfigRepository from '../../interfaces/IConfigRepository';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';
import { NotFoundError } from '../../../infrastructure/errors';
import { CONFIG_NOT_FOUND } from '../../../infrastructure/errors/mr-codes';

export class DeleteConfigUseCase {
  constructor(
    private readonly configRepository: IConfigRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(key: string, deletedBy?: string) {
    logger.info({ key }, 'DeleteConfigUseCase: starting');

    const existing = await this.configRepository.findByKey(key);
    if (!existing) {
      throw new NotFoundError(`Config "${key}" not found`, CONFIG_NOT_FOUND);
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
