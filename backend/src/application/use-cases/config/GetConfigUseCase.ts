/**
 * @file GetConfigUseCase.ts
 * @module application/use-cases/config
 */

import IConfigRepository from '../../interfaces/IConfigRepository';
import logger from '../../../infrastructure/logging/requestContext';

export class GetConfigUseCase {
  constructor(private readonly configRepository: IConfigRepository) {}

  async execute(key: string) {
    logger.info({ key }, 'GetConfigUseCase: starting');
    const config = await this.configRepository.findByKey(key);
    logger.info({ key, found: !!config }, 'GetConfigUseCase: completed');
    return config;
  }
}

export class GetAllConfigUseCase {
  constructor(private readonly configRepository: IConfigRepository) {}

  async execute() {
    logger.info({}, 'GetAllConfigUseCase: starting');
    const configs = await this.configRepository.findAll();
    logger.info({ count: configs.length }, 'GetAllConfigUseCase: completed');
    return configs;
  }
}

export class GetConfigByCategoryUseCase {
  constructor(private readonly configRepository: IConfigRepository) {}

  async execute(category: string) {
    logger.info({ category }, 'GetConfigByCategoryUseCase: starting');
    const configs = await this.configRepository.findByCategory(category);
    logger.info({ category, count: configs.length }, 'GetConfigByCategoryUseCase: completed');
    return configs;
  }
}
