/**
 * @file ListItemsUseCase.ts
 * @module application/use-cases/items
 */

import Item from '../../../domain/entities/Item';
import IItemRepository from '../../interfaces/IItemRepository';
import logger from '../../../infrastructure/logging/requestContext';

export default class ListItemsUseCase {
  constructor(private readonly itemRepository: IItemRepository) {}

  async execute(): Promise<Item[]> {
    logger.info({}, 'ListItemsUseCase: starting');
    const items = await this.itemRepository.findAll();
    logger.info({ count: items.length }, 'ListItemsUseCase: completed');
    return items;
  }
}
