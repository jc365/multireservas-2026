/**
 * @file GetEmployeeUseCase.ts
 * @module application/use-cases/employees
 */

import Employee from '../../../domain/entities/Employee';
import type IEmployeeRepository from '../../interfaces/IEmployeeRepository';
import logger from '../../../infrastructure/logging/requestContext';

export interface EmployeeRequester {
  id: string;
  role?: string;
}

export default class GetEmployeeUseCase {
  constructor(private readonly employeeRepository: IEmployeeRepository) {}

  /**
   * Devuelve el empleado solo si pertenece al tenant; en caso
   * contrario null (evita filtrar la existencia cross-tenant → 404).
   * El rol `employee` solo puede ver su propio registro (DoD F3.2);
   * un empleado inactivo se sigue devolviendo (soft delete).
   */
  async execute(id: string, tenantId: string, requester: EmployeeRequester): Promise<Employee | null> {
    logger.info({ id, tenantId, requesterRole: requester.role }, 'GetEmployeeUseCase: starting');
    const employee = await this.employeeRepository.findById(id);
    if (!employee || employee.tenantId !== tenantId) {
      logger.warn({ id, tenantId }, 'GetEmployeeUseCase: not found (or foreign tenant)');
      return null;
    }
    if (requester.role === 'employee' && employee.userId !== requester.id) {
      logger.warn({ id, requesterId: requester.id }, 'GetEmployeeUseCase: employee can only view self');
      return null;
    }
    return employee;
  }
}
