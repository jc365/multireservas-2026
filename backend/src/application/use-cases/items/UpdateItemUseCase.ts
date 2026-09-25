/**
 * @file UpdateItemUseCase.ts
 * @module application/use-cases/items
 */

import Item, { type ItemStatus } from '../../../domain/entities/Item';
import ItemTitle from '../../../domain/value-objects/ItemTitle';
import IItemRepository from '../../interfaces/IItemRepository';
import { UpdateItemInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';

export default class UpdateItemUseCase {
  constructor(
    private readonly itemRepository: IItemRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(id: string, input: UpdateItemInput, updatedBy: string): Promise<Item> {
    logger.info({ id, updatedBy }, 'UpdateItemUseCase: starting');

    const existing = await this.itemRepository.findById(id);
    if (!existing) {
      throw new Error('Item not found');
    }

    const updates: { title?: ItemTitle; description?: string | null; status?: ItemStatus } = {};

    if (input.title !== undefined) {
      updates.title = ItemTitle.create(input.title);
    }
    if (input.description !== undefined) {
      updates.description = input.description;
    }
    if (input.status !== undefined) {
      updates.status = input.status;
    }

    const updated = existing.withUpdates(updates);
    await this.itemRepository.save(updated);

    await this.bitacoraService.log({
      userId: updatedBy,
      action: 'update_item',
      entityType: 'item',
      entityId: id,
      metadata: input as Record<string, unknown>,
    });

    logger.info({ id }, 'UpdateItemUseCase: completed');
    return updated;
  }
}
