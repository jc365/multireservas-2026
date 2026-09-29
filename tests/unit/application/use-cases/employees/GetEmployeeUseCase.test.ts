import { vi, describe, it, expect, beforeEach } from 'vitest';
import GetEmployeeUseCase from '../../../../../backend/src/application/use-cases/employees/GetEmployeeUseCase';
import Employee from '../../../../../backend/src/domain/entities/Employee';
import EmployeeName from '../../../../../backend/src/domain/value-objects/EmployeeName';
import type IEmployeeRepository from '../../../../../backend/src/application/interfaces/IEmployeeRepository';

function makeEmployee(tenantId: string, userId: string | null, id = 'emp-1'): Employee {
  return Employee.create({ id, tenantId, name: EmployeeName.create('Employee Demo'), userId });
}

describe('GetEmployeeUseCase', () => {
  let useCase: GetEmployeeUseCase;
  let employeeRepo: jest.Mocked<IEmployeeRepository>;

  beforeEach(() => {
    employeeRepo = {
      findById: vi.fn().mockResolvedValue(makeEmployee('tenant-demo', 'usr-employee')),
      findByTenantId: vi.fn(),
      findByUserId: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
      deactivate: vi.fn(),
    };
    useCase = new GetEmployeeUseCase(employeeRepo);
  });

  it('owner ve un empleado de su tenant', async () => {
    const result = await useCase.execute('emp-1', 'tenant-demo', { id: 'usr-owner', role: 'owner' });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('emp-1');
  });

  it('empleado de otro tenant → null (no filtra existencia)', async () => {
    employeeRepo.findById.mockResolvedValue(makeEmployee('tenant-other', 'usr-employee'));

    const result = await useCase.execute('emp-1', 'tenant-demo', { id: 'usr-owner', role: 'owner' });
    expect(result).toBeNull();
  });

  it('empleado inexistente → null', async () => {
    employeeRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute('emp-404', 'tenant-demo', { id: 'usr-owner', role: 'owner' });
    expect(result).toBeNull();
  });

  it('rol employee ve su propio registro (userId coincide)', async () => {
    const result = await useCase.execute('emp-1', 'tenant-demo', {
      id: 'usr-employee',
      role: 'employee',
    });

    expect(result).not.toBeNull();
    expect(result?.userId).toBe('usr-employee');
  });

  it('rol employee no ve a otros → null', async () => {
    employeeRepo.findById.mockResolvedValue(makeEmployee('tenant-demo', 'usr-someone-else'));

    const result = await useCase.execute('emp-1', 'tenant-demo', {
      id: 'usr-employee',
      role: 'employee',
    });
    expect(result).toBeNull();
  });

  it('rol employee con registro sin vincular (userId null) → null', async () => {
    employeeRepo.findById.mockResolvedValue(makeEmployee('tenant-demo', null));

    const result = await useCase.execute('emp-1', 'tenant-demo', {
      id: 'usr-employee',
      role: 'employee',
    });
    expect(result).toBeNull();
  });

  it('owner ve un empleado inactivo (soft delete no oculta el detalle)', async () => {
    const inactive = Employee.create({
      id: 'emp-1',
      tenantId: 'tenant-demo',
      name: EmployeeName.create('Employee Demo'),
      isActive: false,
    });
    employeeRepo.findById.mockResolvedValue(inactive);

    const result = await useCase.execute('emp-1', 'tenant-demo', { id: 'usr-owner', role: 'owner' });
    expect(result?.isActive).toBe(false);
  });
});
