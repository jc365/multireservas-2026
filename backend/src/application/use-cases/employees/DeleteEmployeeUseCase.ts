/**
 * @file DeleteEmployeeUseCase.ts
 * @module application/use-cases/employees
 */

import type IEmployeeRepository from '../../interfaces/IEmployeeRepository';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';

export default class DeleteEmployeeUseCase {
  constructor(
    private readonly employeeRepository: IEmployeeRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  /**
   * Soft delete (F3.2): `isActive = false`, no borra la fila ni la M2M.
   */
  async execute(id: string, tenantId: string, deletedBy: string): Promise<void> {
    logger.info({ id, tenantId, deletedBy }, 'DeleteEmployeeUseCase: starting');

    const existing = await this.employeeRepository.findById(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error('Employee not found');
    }

    await this.employeeRepository.deactivate(id);

    await this.bitacoraService.log({
      userId: deletedBy,
      action: 'delete_employee',
      entityType: 'employee',
      entityId: id,
      metadata: { name: existing.name.getValue() },
    });

    logger.info({ id }, 'DeleteEmployeeUseCase: completed');
  }
}
