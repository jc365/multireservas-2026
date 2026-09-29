/**
 * @file CreateEmployeeUseCase.ts
 * @module application/use-cases/employees
 */

import Employee from '../../../domain/entities/Employee';
import EmployeeName from '../../../domain/value-objects/EmployeeName';
import IEmployeeRepository from '../../interfaces/IEmployeeRepository';
import IServiceRepository from '../../interfaces/IServiceRepository';
import IUserRepository from '../../interfaces/IUserRepository';
import { CreateEmployeeInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';

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
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(input: CreateEmployeeInput, tenantId: string, createdBy: string): Promise<Employee> {
    logger.info({ tenantId, name: input.name, createdBy }, 'CreateEmployeeUseCase: starting');

    const name = EmployeeName.create(input.name);
    const email = normalizeOptional(input.email);
    const phone = normalizeOptional(input.phone);
    const userId = normalizeOptional(input.userId ?? null);
    const offersAllServices = input.offersAllServices ?? true;

    if (userId) {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new Error('userId does not reference an existing user');
      }
      if (user.tenantId !== tenantId) {
        throw new Error('userId must belong to the same tenant');
      }
      const linked = await this.employeeRepository.findByUserId(userId);
      if (linked) {
        throw new Error('userId is already linked to another employee');
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
        throw new Error('serviceIds must reference services of this tenant');
      }
    }

    const employee = Employee.create({
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
