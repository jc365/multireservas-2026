/**
 * @file IClientRepository.ts
 * @module application/interfaces
 */

import Client from '../../domain/entities/Client';

/**
 * Interface for the repository operations related to clients
 * (interno: sin CRUD expuesto; FindOrCreate lo usa en reservas).
 */
export default interface IClientRepository {
  /**
   * Finds a client by its unique identifier.
   */
  findById(id: string): Promise<Client | null>;

  /**
   * Búsqueda principal (F3.3 #2): tenantId + phone.
   */
  findByTenantAndPhone(tenantId: string, phone: string): Promise<Client | null>;

  /**
   * Fallback (F3.3 #2): tenantId + email.
   */
  findByTenantAndEmail(tenantId: string, email: string): Promise<Client | null>;

  /**
   * Saves a client entity into the database (upsert).
   */
  save(client: Client): Promise<void>;
}
