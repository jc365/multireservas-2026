/**
 * @file IUserRepository.ts
 * @module application/interfaces
 */

import User from '../../domain/entities/User';

/**
 * Interface for the repository operations related to users.
 */
export default interface IUserRepository {
  /**
   * Finds a user by its unique identifier.
   * @param id - The unique identifier of the user.
   * @returns A Promise that resolves to the found user or null if not found.
   */
  findById(id: string): Promise<User | null>;

  /**
   * Finds a user by email address.
   * @param email - The email address of the user.
   * @returns A Promise that resolves to the found user or null if not found.
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Finds the oldest owner of a tenant (F4.4a — el reenvío del email
   * de verificación se envía al owner del tenant).
   */
  findOwnerByTenantId(tenantId: string): Promise<User | null>;

  /**
   * Finds all users.
   * @returns A Promise that resolves to an array of all users.
   */
  findAll(): Promise<User[]>;

  /**
   * Saves a user entity into the database.
   * @param user - The user entity to be saved.
   * @returns A Promise that resolves when the operation is completed.
   */
  save(user: User): Promise<void>;

  /**
   * Deletes a user by its unique identifier.
   * @param id - The unique identifier of the user.
   * @returns A Promise that resolves when the deletion is completed.
   */
  delete(id: string): Promise<void>;
}


