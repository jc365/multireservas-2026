/**
 * @file CreateEmployeeUseCase.ts
 * @module application/use-cases/employees
 */

import Employee from '../../../domain/entities/Employee';
import EmployeeName from '../../../domain/value-objects/EmployeeName';
import IEmployeeRepository from '../../interfaces/IEmployeeRepository';
import IServiceRepository from '../../interfaces/IServiceRepository';
import IUserRepository from '../../interfaces/IUserRepository';
import ITenantRepository from '../../interfaces/ITenantRepository';
import { CreateEmployeeInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../../infrastructure/errors';
import { USER_ID_ALREADY_LINKED, TENANT_NOT_FOUND } from '../../../infrastructure/errors/mr-codes';
import { assertEmailVerified, type RequesterInfo } from '../verification';

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export default class CreateEmployeeUseCase {
  constructor(
    private readonly employeeRepository: IEmployeeRepository,
    private readonly serviceRepository: IServiceRepository,
    private readonly userRepository: IUserRepository,
    private readonly tenantRepository: ITenantRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(
    input: CreateEmployeeInput,
    tenantId: string,
    createdBy: string,
    requester?: RequesterInfo
  ): Promise<Employee> {
    logger.info({ tenantId, name: input.name, createdBy }, 'CreateEmployeeUseCase: starting');

    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Tenant not found', TENANT_NOT_FOUND);
    }

    // F4.4a: sin verificar email → 403 (admin exento).
    assertEmailVerified(tenant.settings, requester);

    let name;
    try {
      name = EmployeeName.create(input.name);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid employee name');
    }
    const email = normalizeOptional(input.email);
    const phone = normalizeOptional(input.phone);
    const userId = normalizeOptional(input.userId ?? null);
    const offersAllServices = input.offersAllServices ?? true;

    if (userId) {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new ValidationError('userId does not reference an existing user');
      }
      if (user.tenantId !== tenantId) {
        throw new ValidationError('userId must belong to the same tenant');
      }
      const linked = await this.employeeRepository.findByUserId(userId);
      if (linked) {
        throw new ConflictError('userId is already linked to another employee', USER_ID_ALREADY_LINKED);
      }
    }

    let serviceIds = (input.serviceIds ?? []).filter((id) => typeof id === 'string' && id.trim().length > 0);
    if (offersAllServices) {
      serviceIds = [];
    } else if (serviceIds.length > 0) {
      const services = await this.serviceRepository.findByIds(serviceIds);
      const validIds = new Set(
        services.filter((service) => service.tenantId === tenantId).map((service) => service.id)
      );
      if (serviceIds.some((id) => !validIds.has(id))) {
        throw new ValidationError('serviceIds must reference services of this tenant');
      }
    }

    let employee: Employee;
    try {
      employee = Employee.create({
        tenantId,
        name,
        email,
        phone,
        offersAllServices,
        serviceIds,
        customSchedule: input.customSchedule ?? null,
        customHolidays: input.customHolidays ?? null,
        userId,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid employee data');
    }

    await this.employeeRepository.save(employee);

    await this.bitacoraService.log({
      userId: createdBy,
      action: 'create_employee',
      entityType: 'employee',
      entityId: employee.id,
      metadata: { name: name.getValue(), offersAllServices: employee.offersAllServices, userId: employee.userId },
    });

    logger.info({ employeeId: employee.id }, 'CreateEmployeeUseCase: completed');
    return employee;
  }
}
