/**
 * @file IServiceRepository.ts
 * @module application/interfaces
 */

import Service from '../../domain/entities/Service';

/**
 * Interface for the repository operations related to services.
 */
export default interface IServiceRepository {
  /**
   * Finds a service by its unique identifier.
   */
  findById(id: string): Promise<Service | null>;

  /**
   * Finds all services of a tenant (ordered by createdAt desc).
   */
  findByTenantId(tenantId: string): Promise<Service[]>;

  /**
   * Finds services by ids (no filter de tenant; el caller valida).
   */
  findByIds(ids: string[]): Promise<Service[]>;

  /**
   * Saves a service entity into the database (upsert).
   */
  save(service: Service): Promise<void>;

  /**
   * Deletes a service by its unique identifier.
   */
  delete(id: string): Promise<void>;
}
