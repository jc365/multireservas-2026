/**
 * @file IEmployeeRepository.ts
 * @module application/interfaces
 */

import Employee from '../../domain/entities/Employee';

/**
 * Interface for the repository operations related to employees.
 */
export default interface IEmployeeRepository {
  /**
   * Finds an employee by its unique identifier (with its serviceIds).
   */
  findById(id: string): Promise<Employee | null>;

  /**
   * Finds all employees of a tenant (ordered by createdAt desc).
   * By default only active ones; `includeInactive` returns all.
   */
  findByTenantId(tenantId: string, options?: { includeInactive?: boolean }): Promise<Employee[]>;

  /**
   * Finds the employee linked to a userId (`Employee.userId` is unique 1:1).
   */
  findByUserId(userId: string): Promise<Employee | null>;

  /**
   * Saves an employee entity into the database (upsert + M2M set).
   */
  save(employee: Employee): Promise<void>;

  /**
   * Soft delete: sets `isActive = false` without touching the M2M.
   */
  deactivate(id: string): Promise<void>;
}
