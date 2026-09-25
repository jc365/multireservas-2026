/**
 * @file IItemRepository.ts
 * @module application/interfaces
 */

import Item from '../../domain/entities/Item';

/**
 * Interface for the repository operations related to items.
 */
export default interface IItemRepository {
  /**
   * Finds an item by its unique identifier.
   */
  findById(id: string): Promise<Item | null>;

  /**
   * Finds all items.
   */
  findAll(): Promise<Item[]>;

  /**
   * Finds items by creator user ID.
   */
  findByCreatedBy(createdBy: string): Promise<Item[]>;

  /**
   * Saves an item entity into the database.
   */
  save(item: Item): Promise<void>;

  /**
   * Deletes an item by its unique identifier.
   */
  delete(id: string): Promise<void>;
}
