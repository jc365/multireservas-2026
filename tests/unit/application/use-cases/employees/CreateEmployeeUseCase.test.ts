import { vi, describe, it, expect, beforeEach } from 'vitest';
import CreateEmployeeUseCase from '../../../../../backend/src/application/use-cases/employees/CreateEmployeeUseCase';
import { ConflictError, ForbiddenError } from '../../../../../backend/src/infrastructure/errors';
import Employee from '../../../../../backend/src/domain/entities/Employee';
import EmployeeName from '../../../../../backend/src/domain/value-objects/EmployeeName';
import Service from '../../../../../backend/src/domain/entities/Service';
import ServiceName from '../../../../../backend/src/domain/value-objects/ServiceName';
import BookingSettings from '../../../../../backend/src/domain/value-objects/BookingSettings';
import type User from '../../../../../backend/src/domain/entities/User';
import type IEmployeeRepository from '../../../../../backend/src/application/interfaces/IEmployeeRepository';
import type IServiceRepository from '../../../../../backend/src/application/interfaces/IServiceRepository';
import type IUserRepository from '../../../../../backend/src/application/interfaces/IUserRepository';
import type ITenantRepository from '../../../../../backend/src/application/interfaces/ITenantRepository';
import type BitacoraService from '../../../../../backend/src/infrastructure/logging/BitacoraService';

const settings = BookingSettings.fromTenantSettings({});

function makeService(id: string, tenantId: string): Service {
  return Service.create({ id, tenantId, name: ServiceName.create('Classic Haircut'), duration: 30 }, settings);
}

function makeUser(id: string, tenantId: string | null): User {
  return { id, tenantId } as unknown as User;
}

describe('CreateEmployeeUseCase', () => {
  let useCase: CreateEmployeeUseCase;
  let employeeRepo: jest.Mocked<IEmployeeRepository>;
  let serviceRepo: jest.Mocked<IServiceRepository>;
  let userRepo: jest.Mocked<IUserRepository>;
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let bitacoraService: jest.Mocked<BitacoraService>;

  beforeEach(() => {
    employeeRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn().mockResolvedValue([]),
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
      findOwnerByTenantId: vi.fn(),
      findAll: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    tenantRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'tenant-demo', settings: {} }),
    } as unknown as jest.Mocked<ITenantRepository>;
    bitacoraService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BitacoraService>;
    useCase = new CreateEmployeeUseCase(
      employeeRepo,
      serviceRepo,
      userRepo,
      tenantRepo,
      bitacoraService
    );
  });

  it('crea un empleado en el tenant dado y lo guarda', async () => {
    const employee = await useCase.execute(
      { name: 'Employee Demo', email: 'emp@demo.com' },
      'tenant-demo',
      'usr-owner'
    );

    expect(employee.id.startsWith('emp-')).toBe(true);
    expect(employee.tenantId).toBe('tenant-demo');
    expect(employee.name.getValue()).toBe('Employee Demo');
    expect(employee.email).toBe('emp@demo.com');
    expect(employee.offersAllServices).toBe(true);
    expect(employee.serviceIds).toEqual([]);
    expect(employeeRepo.save).toHaveBeenCalledTimes(1);
  });

  it('registra bitacora con action create_employee', async () => {
    const employee = await useCase.execute({ name: 'Employee Demo' }, 'tenant-demo', 'usr-owner');

    expect(bitacoraService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr-owner',
        action: 'create_employee',
        entityType: 'employee',
        entityId: employee.id,
      })
    );
  });

  it('userId válido del tenant → FK asignada', async () => {
    const employee = await useCase.execute(
      { name: 'Employee Demo', userId: 'user-employee-1' },
      'tenant-demo',
      'usr-owner'
    );

    expect(userRepo.findById).toHaveBeenCalledWith('user-employee-1');
    expect(employee.userId).toBe('user-employee-1');
  });

  it('sin userId → null', async () => {
    const employee = await useCase.execute({ name: 'Employee Demo' }, 'tenant-demo', 'usr-owner');
    expect(employee.userId).toBeNull();
  });

  it('userId inexistente → throw y no guarda', async () => {
    userRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ name: 'Employee Demo', userId: 'usr-404' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('userId does not reference an existing user');
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('userId de otro tenant → throw y no guarda', async () => {
    userRepo.findById.mockResolvedValue(makeUser('usr-other', 'tenant-other'));

    await expect(
      useCase.execute({ name: 'Employee Demo', userId: 'usr-other' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('userId must belong to the same tenant');
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('userId ya vinculado a otro empleado → ConflictError 409 (unique 1:1)', async () => {
    const linked = Employee.create({
      id: 'emp-other',
      tenantId: 'tenant-demo',
      name: EmployeeName.create('Other Employee'),
      userId: 'user-employee-1',
    });
    employeeRepo.findByUserId.mockResolvedValue(linked);

    const error = await useCase
      .execute({ name: 'Employee Demo', userId: 'user-employee-1' }, 'tenant-demo', 'usr-owner')
      .then(() => null)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({
      status: 409,
      code: 'USER_ID_ALREADY_LINKED',
      message: 'userId is already linked to another employee',
    });
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('serviceIds con servicios del tenant → se conectan', async () => {
    const employee = await useCase.execute(
      { name: 'Employee Demo', offersAllServices: false, serviceIds: ['svc-1'] },
      'tenant-demo',
      'usr-owner'
    );

    expect(serviceRepo.findByIds).toHaveBeenCalledWith(['svc-1']);
    expect(employee.serviceIds).toEqual(['svc-1']);
    expect(employee.offersAllServices).toBe(false);
  });

  it('serviceIds de otro tenant → throw', async () => {
    serviceRepo.findByIds.mockResolvedValue([makeService('svc-foreign', 'tenant-other')]);

    await expect(
      useCase.execute(
        { name: 'Employee Demo', offersAllServices: false, serviceIds: ['svc-foreign'] },
        'tenant-demo',
        'usr-owner'
      )
    ).rejects.toThrow('serviceIds must reference services of this tenant');
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('serviceIds parcialmente ajenos → throw', async () => {
    serviceRepo.findByIds.mockResolvedValue([makeService('svc-1', 'tenant-demo')]);

    await expect(
      useCase.execute(
        { name: 'Employee Demo', offersAllServices: false, serviceIds: ['svc-1', 'svc-x'] },
        'tenant-demo',
        'usr-owner'
      )
    ).rejects.toThrow('serviceIds must reference services of this tenant');
  });

  it('offersAllServices = true ignora los serviceIds sin validar', async () => {
    const employee = await useCase.execute(
      { name: 'Employee Demo', offersAllServices: true, serviceIds: ['svc-junk'] },
      'tenant-demo',
      'usr-owner'
    );

    expect(serviceRepo.findByIds).not.toHaveBeenCalled();
    expect(employee.serviceIds).toEqual([]);
  });

  it('name demasiado corto → throw', async () => {
    await expect(
      useCase.execute({ name: 'ab' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Employee name must be at least 3 characters');
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('email inválido → throw', async () => {
    await expect(
      useCase.execute({ name: 'Employee Demo', email: 'nope' }, 'tenant-demo', 'usr-owner')
    ).rejects.toThrow('Employee email must be a valid email');
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('normaliza email/phone/userId (vacíos → null, trim)', async () => {
    const employee = await useCase.execute(
      { name: 'Employee Demo', email: '  emp@demo.com  ', phone: '   ', userId: '  user-employee-1 ' },
      'tenant-demo',
      'usr-owner'
    );

    expect(employee.email).toBe('emp@demo.com');
    expect(employee.phone).toBeNull();
    expect(employee.userId).toBe('user-employee-1');
  });

  describe('bloqueo de email (F4.4a)', () => {
    const pendingSettings = {
      email_verification: { token: 'tok-abc', expiresAt: '2026-10-02T10:00:00.000Z' },
    };

    it('sin verificar + owner → 403 EMAIL_NOT_VERIFIED y NO guarda', async () => {
      tenantRepo.findById.mockResolvedValue({ id: 'tenant-demo', settings: pendingSettings });

      const error = await useCase
        .execute({ name: 'Employee Demo' }, 'tenant-demo', 'usr-owner', { role: 'owner' })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.status).toBe(403);
      expect(error.code).toBe('EMAIL_NOT_VERIFIED');
      expect(employeeRepo.save).not.toHaveBeenCalled();
      expect(bitacoraService.log).not.toHaveBeenCalled();
    });

    it('sin verificar + admin (X-Tenant-Id) → exento, crea', async () => {
      tenantRepo.findById.mockResolvedValue({ id: 'tenant-demo', settings: pendingSettings });

      const employee = await useCase.execute(
        { name: 'Employee Demo' },
        'tenant-demo',
        'usr-admin',
        { role: 'admin', isImpersonating: true }
      );

      expect(employee.id.startsWith('emp-')).toBe(true);
      expect(employeeRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
