import { vi, describe, it, expect, beforeEach } from 'vitest';
import UpdateEmployeeUseCase from '../../../../../backend/src/application/use-cases/employees/UpdateEmployeeUseCase';
import Employee from '../../../../../backend/src/domain/entities/Employee';
import EmployeeName from '../../../../../backend/src/domain/value-objects/EmployeeName';
import Service from '../../../../../backend/src/domain/entities/Service';
import ServiceName from '../../../../../backend/src/domain/value-objects/ServiceName';
import BookingSettings from '../../../../../backend/src/domain/value-objects/BookingSettings';
import type User from '../../../../../backend/src/domain/entities/User';
import type IEmployeeRepository from '../../../../../backend/src/application/interfaces/IEmployeeRepository';
import type IServiceRepository from '../../../../../backend/src/application/interfaces/IServiceRepository';
import type IUserRepository from '../../../../../backend/src/application/interfaces/IUserRepository';
import type BitacoraService from '../../../../../backend/src/infrastructure/logging/BitacoraService';

const settings = BookingSettings.fromTenantSettings({});

function makeService(id: string, tenantId: string): Service {
  return Service.create({ id, tenantId, name: ServiceName.create('Classic Haircut'), duration: 30 }, settings);
}

function makeUser(id: string, tenantId: string | null): User {
  return { id, tenantId } as unknown as User;
}

function makeEmployee(tenantId = 'tenant-demo'): Employee {
  return Employee.create({
    id: 'emp-1',
    tenantId,
    name: EmployeeName.create('Employee Demo'),
    userId: 'user-employee-1',
    offersAllServices: false,
    serviceIds: ['svc-1', 'svc-2'],
  });
}

describe('UpdateEmployeeUseCase', () => {
  let useCase: UpdateEmployeeUseCase;
  let employeeRepo: jest.Mocked<IEmployeeRepository>;
  let serviceRepo: jest.Mocked<IServiceRepository>;
  let userRepo: jest.Mocked<IUserRepository>;
  let bitacoraService: jest.Mocked<BitacoraService>;

  beforeEach(() => {
    employeeRepo = {
      findById: vi.fn().mockResolvedValue(makeEmployee()),
      findByTenantId: vi.fn(),
      findByUserId: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      deactivate: vi.fn().mockResolvedValue(undefined),
    };
    serviceRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findByIds: vi.fn().mockResolvedValue([makeService('svc-1', 'tenant-demo')]),
      save: vi.fn(),
      delete: vi.fn(),
    };
    userRepo = {
      findById: vi.fn().mockResolvedValue(makeUser('user-employee-1', 'tenant-demo')),
      findByEmail: vi.fn(),
      findAll: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    bitacoraService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BitacoraService>;
    useCase = new UpdateEmployeeUseCase(employeeRepo, serviceRepo, userRepo, bitacoraService);
  });

  it('actualiza los campos indicados y registra bitacora', async () => {
    const updated = await useCase.execute(
      'emp-1',
      { name: 'New Name', phone: '+34600000000', isActive: false },
      'tenant-demo',
      'usr-owner'
    );

    expect(updated.name.getValue()).toBe('New Name');
    expect(updated.phone).toBe('+34600000000');
    expect(updated.isActive).toBe(false);
    expect(updated.serviceIds).toEqual(['svc-1', 'svc-2']);
    expect(employeeRepo.save).toHaveBeenCalledTimes(1);
    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr-owner',
        action: 'update_employee',
        entityType: 'employee',
        entityId: 'emp-1',
      })
    );
  });

  it('empleado inexistente → throw y no guarda', async () => {
    employeeRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute('emp-404', { name: 'Nope' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Employee not found');
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('empleado de otro tenant → throw (igual que no encontrado)', async () => {
    employeeRepo.findById.mockResolvedValue(makeEmployee('tenant-other'));

    await expect(
      useCase.execute('emp-1', { name: 'Nope' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Employee not found');
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('pasar a offersAllServices = true limpia la M2M al guardar', async () => {
    const updated = await useCase.execute(
      'emp-1',
      { offersAllServices: true },
      'tenant-demo',
      'usr-owner'
    );

    expect(updated.offersAllServices).toBe(true);
    expect(updated.serviceIds).toEqual([]);
    expect(employeeRepo.save).toHaveBeenCalledWith(updated);
    expect(serviceRepo.findByIds).not.toHaveBeenCalled();
  });

  it('serviceIds nuevos validados contra el tenant', async () => {
    const updated = await useCase.execute(
      'emp-1',
      { serviceIds: ['svc-1'] },
      'tenant-demo',
      'usr-owner'
    );

    expect(serviceRepo.findByIds).toHaveBeenCalledWith(['svc-1']);
    expect(updated.serviceIds).toEqual(['svc-1']);
  });

  it('serviceIds de otro tenant → throw', async () => {
    serviceRepo.findByIds.mockResolvedValue([makeService('svc-foreign', 'tenant-other')]);

    await expect(
      useCase.execute('emp-1', { serviceIds: ['svc-foreign'] }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('serviceIds must reference services of this tenant');
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('userId inexistente → throw', async () => {
    userRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute('emp-1', { userId: 'usr-404' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('userId does not reference an existing user');
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('userId de otro tenant → throw', async () => {
    userRepo.findById.mockResolvedValue(makeUser('usr-other', 'tenant-other'));

    await expect(
      useCase.execute('emp-1', { userId: 'usr-other' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('userId must belong to the same tenant');
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('userId ya vinculado a otro empleado → throw (unique 1:1)', async () => {
    employeeRepo.findByUserId.mockResolvedValue(
      Employee.create({
        id: 'emp-other',
        tenantId: 'tenant-demo',
        name: EmployeeName.create('Other Employee'),
        userId: 'user-employee-1',
      })
    );

    await expect(
      useCase.execute('emp-1', { userId: 'user-employee-1' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('userId is already linked to another employee');
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('re-enviar el userId propio no cuenta como duplicado', async () => {
    employeeRepo.findByUserId.mockResolvedValue(makeEmployee());

    const updated = await useCase.execute(
      'emp-1',
      { userId: 'user-employee-1' },
      'tenant-demo',
      'usr-owner'
    );

    expect(updated.userId).toBe('user-employee-1');
    expect(employeeRepo.save).toHaveBeenCalledTimes(1);
  });

  it('userId undefined no cambia el vínculo existente', async () => {
    const updated = await useCase.execute('emp-1', { phone: '+34600000001' }, 'tenant-demo', 'usr-owner');

    expect(updated.userId).toBe('user-employee-1');
    expect(userRepo.findById).not.toHaveBeenCalled();
  });

  it('name inválido → throw', async () => {
    await expect(
      useCase.execute('emp-1', { name: 'ab' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Employee name must be at least 3 characters');
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('sin cambios de serviceIds no valida servicios', async () => {
    await useCase.execute('emp-1', { name: 'Renamed' }, 'tenant-demo', 'usr-owner');

    expect(serviceRepo.findByIds).not.toHaveBeenCalled();
  });
});
