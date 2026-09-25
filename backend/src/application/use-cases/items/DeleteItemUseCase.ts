/**
 * @file DeleteItemUseCase.ts
 * @module application/use-cases/items
 */

import IItemRepository from '../../interfaces/IItemRepository';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';

export default class DeleteItemUseCase {
  constructor(
    private readonly itemRepository: IItemRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(id: string, deletedBy: string): Promise<void> {
    logger.info({ id, deletedBy }, 'DeleteItemUseCase: starting');

    const existing = await this.itemRepository.findById(id);
    if (!existing) {
      throw new Error('Item not found');
    }

    await this.itemRepository.delete(id);

    await this.bitacoraService.log({
      userId: deletedBy,
      action: 'delete_item',
      entityType: 'item',
      entityId: id,
    });

    logger.info({ id }, 'DeleteItemUseCase: completed');
  }
}
