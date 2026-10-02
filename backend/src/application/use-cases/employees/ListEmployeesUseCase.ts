/**
 * @file ListEmployeesUseCase.ts
 * @module application/use-cases/employees
 */

import Employee from '../../../domain/entities/Employee';
import type IEmployeeRepository from '../../interfaces/IEmployeeRepository';
import logger from '../../../infrastructure/logging/requestContext';

export interface ListEmployeesOptions {
  requesterId: string;
  requesterRole?: string;
  includeInactive?: boolean;
}

export default class ListEmployeesUseCase {
  constructor(private readonly employeeRepository: IEmployeeRepository) {}

  /**
   * Lista los empleados activos del tenant (`includeInactive` solo lo
   * honra owner). El rol `employee` solo ve su propio registro
   * (filtrado por `userId` — DoD F3.2).
   */
  async execute(tenantId: string, options: ListEmployeesOptions): Promise<Employee[]> {
    logger.info({ tenantId, requesterRole: options.requesterRole }, 'ListEmployeesUseCase: starting');

    // F4.0: el admin supervisa el tenant completo desde la superficie A
    // (GET /admin/tenants/:tenantId/employees) → honra inactivos igual
    // que el owner.
    const includeInactive =
      options.includeInactive === true &&
      (options.requesterRole === 'owner' || options.requesterRole === 'admin');
    let employees = await this.employeeRepository.findByTenantId(tenantId, { includeInactive });

    if (options.requesterRole === 'employee') {
      employees = employees.filter((employee) => employee.userId === options.requesterId);
    }

    logger.info({ tenantId, count: employees.length }, 'ListEmployeesUseCase: completed');
    return employees;
  }
}
