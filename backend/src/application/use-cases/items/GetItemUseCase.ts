/**
 * @file GetItemUseCase.ts
 * @module application/use-cases/items
 */

import Item from '../../../domain/entities/Item';
import IItemRepository from '../../interfaces/IItemRepository';
import logger from '../../../infrastructure/logging/requestContext';

export default class GetItemUseCase {
  constructor(private readonly itemRepository: IItemRepository) {}

  async execute(id: string): Promise<Item | null> {
    logger.info({ id }, 'GetItemUseCase: starting');
    const item = await this.itemRepository.findById(id);
    if (!item) {
      logger.warn({ id }, 'GetItemUseCase: not found');
    }
    return item;
  }
}
