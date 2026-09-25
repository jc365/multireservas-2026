/**
 * @file UpsertConfigUseCase.ts
 * @module application/use-cases/config
 */

import Config from '../../../domain/entities/Config';
import IConfigRepository from '../../interfaces/IConfigRepository';
import { UpsertConfigInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';

export class UpsertConfigUseCase {
  constructor(
    private readonly configRepository: IConfigRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(input: UpsertConfigInput) {
    const { key, value, description, category, updatedBy } = input;

    logger.info({ key, category }, 'UpsertConfigUseCase: starting');

    const existing = await this.configRepository.findByKey(key);

    let config: Config;
    if (existing) {
      config = existing.withValue(value, updatedBy);
    } else {
      config = Config.create(key, value, description, category, updatedBy);
    }

    await this.configRepository.save(config);

    await this.bitacoraService.log({
      userId: updatedBy || 'system',
      action: existing ? 'update_config' : 'create_config',
      metadata: { key, category },
    });

    logger.info({ key }, 'UpsertConfigUseCase: completed');
    return config;
  }
}
