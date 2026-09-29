import { vi, describe, it, expect, beforeEach } from 'vitest';
import ListEmployeesUseCase from '../../../../../backend/src/application/use-cases/employees/ListEmployeesUseCase';
import Employee from '../../../../../backend/src/domain/entities/Employee';
import EmployeeName from '../../../../../backend/src/domain/value-objects/EmployeeName';
import type IEmployeeRepository from '../../../../../backend/src/application/interfaces/IEmployeeRepository';

function makeEmployee(userId: string | null, id = 'emp-1', tenantId = 'tenant-demo'): Employee {
  return Employee.create({
    id,
    tenantId,
    name: EmployeeName.create('Employee Demo'),
    userId,
  });
}

describe('ListEmployeesUseCase', () => {
  let useCase: ListEmployeesUseCase;
  let employeeRepo: jest.Mocked<IEmployeeRepository>;

  beforeEach(() => {
    employeeRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn().mockResolvedValue([]),
      findByUserId: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
      deactivate: vi.fn(),
    };
    useCase = new ListEmployeesUseCase(employeeRepo);
  });

  it('owner lista los empleados activos del tenant', async () => {
    employeeRepo.findByTenantId.mockResolvedValue([makeEmployee('user-employee-1')]);

    const result = await useCase.execute('tenant-demo', {
      requesterId: 'usr-owner',
      requesterRole: 'owner',
    });

    expect(employeeRepo.findByTenantId).toHaveBeenCalledWith('tenant-demo', { includeInactive: false });
    expect(result).toHaveLength(1);
    expect(result[0].name.getValue()).toBe('Employee Demo');
  });

  it('owner con includeInactive → incluye inactivos', async () => {
    await useCase.execute('tenant-demo', {
      requesterId: 'usr-owner',
      requesterRole: 'owner',
      includeInactive: true,
    });

    expect(employeeRepo.findByTenantId).toHaveBeenCalledWith('tenant-demo', { includeInactive: true });
  });

  it('includeInactive solo lo honra owner (employee → false)', async () => {
    await useCase.execute('tenant-demo', {
      requesterId: 'usr-employee',
      requesterRole: 'employee',
      includeInactive: true,
    });

    expect(employeeRepo.findByTenantId).toHaveBeenCalledWith('tenant-demo', { includeInactive: false });
  });

  it('employee solo ve su propio registro (self-view, DoD F3.2)', async () => {
    employeeRepo.findByTenantId.mockResolvedValue([
      makeEmployee('usr-employee', 'emp-self'),
      makeEmployee('usr-other', 'emp-other'),
      makeEmployee(null, 'emp-unlinked'),
    ]);

    const result = await useCase.execute('tenant-demo', {
      requesterId: 'usr-employee',
      requesterRole: 'employee',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('emp-self');
  });

  it('employee sin registro vinculado → lista vacía', async () => {
    employeeRepo.findByTenantId.mockResolvedValue([
      makeEmployee('usr-other', 'emp-other'),
      makeEmployee(null, 'emp-unlinked'),
    ]);

    const result = await useCase.execute('tenant-demo', {
      requesterId: 'usr-employee',
      requesterRole: 'employee',
    });

    expect(result).toEqual([]);
  });

  it('rol desconocido no se filtra (solo tenant)', async () => {
    employeeRepo.findByTenantId.mockResolvedValue([
      makeEmployee('usr-a', 'emp-a'),
      makeEmployee('usr-b', 'emp-b'),
    ]);

    const result = await useCase.execute('tenant-demo', {
      requesterId: 'usr-client',
      requesterRole: 'client',
    });

    expect(result).toHaveLength(2);
  });
});
