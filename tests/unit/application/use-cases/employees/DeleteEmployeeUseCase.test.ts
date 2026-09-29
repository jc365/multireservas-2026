import { vi, describe, it, expect, beforeEach } from 'vitest';
import DeleteEmployeeUseCase from '../../../../../backend/src/application/use-cases/employees/DeleteEmployeeUseCase';
import Employee from '../../../../../backend/src/domain/entities/Employee';
import EmployeeName from '../../../../../backend/src/domain/value-objects/EmployeeName';
import type IEmployeeRepository from '../../../../../backend/src/application/interfaces/IEmployeeRepository';
import type BitacoraService from '../../../../../backend/src/infrastructure/logging/BitacoraService';

function makeEmployee(tenantId: string, id = 'emp-1'): Employee {
  return Employee.create({ id, tenantId, name: EmployeeName.create('Employee Demo') });
}

describe('DeleteEmployeeUseCase', () => {
  let useCase: DeleteEmployeeUseCase;
  let employeeRepo: jest.Mocked<IEmployeeRepository>;
  let bitacoraService: jest.Mocked<BitacoraService>;

  beforeEach(() => {
    employeeRepo = {
      findById: vi.fn().mockResolvedValue(makeEmployee('tenant-demo')),
      findByTenantId: vi.fn(),
      findByUserId: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
      deactivate: vi.fn().mockResolvedValue(undefined),
    };
    bitacoraService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BitacoraService>;
    useCase = new DeleteEmployeeUseCase(employeeRepo, bitacoraService);
  });

  it('soft delete (deactivate) y registra bitacora', async () => {
    await useCase.execute('emp-1', 'tenant-demo', 'usr-owner');

    expect(employeeRepo.deactivate).toHaveBeenCalledWith('emp-1');
    expect(employeeRepo.save).not.toHaveBeenCalled();
    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr-owner',
        action: 'delete_employee',
        entityType: 'employee',
        entityId: 'emp-1',
      })
    );
  });

  it('empleado inexistente → throw y no desactiva', async () => {
    employeeRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('emp-404', 'tenant-demo', 'usr-owner')).rejects.toThrow(
      'Employee not found'
    );
    expect(employeeRepo.deactivate).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });

  it('empleado de otro tenant → throw y no desactiva', async () => {
    employeeRepo.findById.mockResolvedValue(makeEmployee('tenant-other'));

    await expect(useCase.execute('emp-1', 'tenant-demo', 'usr-owner')).rejects.toThrow(
      'Employee not found'
    );
    expect(employeeRepo.deactivate).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });
});
