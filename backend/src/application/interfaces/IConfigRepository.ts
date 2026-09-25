/**
 * @file IConfigRepository.ts
 * @module application/interfaces
 */

import Config from '../../domain/entities/Config';

export default interface IConfigRepository {
  findByKey(key: string): Promise<Config | null>;
  findByCategory(category: string): Promise<Config[]>;
  findAll(): Promise<Config[]>;
  save(config: Config): Promise<void>;
  delete(key: string): Promise<void>;
}
