/**
 * @file UpdateEmployeeUseCase.ts
 * @module application/use-cases/employees
 */

import Employee from '../../../domain/entities/Employee';
import EmployeeName from '../../../domain/value-objects/EmployeeName';
import IEmployeeRepository from '../../interfaces/IEmployeeRepository';
import IServiceRepository from '../../interfaces/IServiceRepository';
import IUserRepository from '../../interfaces/IUserRepository';
import { UpdateEmployeeInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';

function normalizeOptional(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export default class UpdateEmployeeUseCase {
  constructor(
    private readonly employeeRepository: IEmployeeRepository,
    private readonly serviceRepository: IServiceRepository,
    private readonly userRepository: IUserRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(id: string, input: UpdateEmployeeInput, tenantId: string, updatedBy: string): Promise<Employee> {
    logger.info({ id, tenantId, updatedBy }, 'UpdateEmployeeUseCase: starting');

    const existing = await this.employeeRepository.findById(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error('Employee not found');
    }

    const userId = normalizeOptional(input.userId ?? null);
    if (input.userId !== undefined && userId) {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new Error('userId does not reference an existing user');
      }
      if (user.tenantId !== tenantId) {
        throw new Error('userId must belong to the same tenant');
      }
      const linked = await this.employeeRepository.findByUserId(userId);
      if (linked && linked.id !== id) {
        throw new Error('userId is already linked to another employee');
      }
    }

    const finalOffersAllServices = input.offersAllServices ?? existing.offersAllServices;
    if (!finalOffersAllServices && input.serviceIds !== undefined) {
      const serviceIds = (input.serviceIds ?? []).filter(
        (serviceId) => typeof serviceId === 'string' && serviceId.trim().length > 0
      );
      if (serviceIds.length > 0) {
        const services = await this.serviceRepository.findByIds(serviceIds);
        const validIds = new Set(
          services.filter((service) => service.tenantId === tenantId).map((service) => service.id)
        );
        if (serviceIds.some((serviceId) => !validIds.has(serviceId))) {
          throw new Error('serviceIds must reference services of this tenant');
        }
      }
    }

    const updated = existing.withUpdates({
      name: input.name !== undefined ? EmployeeName.create(input.name) : undefined,
      email: normalizeOptional(input.email),
      phone: normalizeOptional(input.phone),
      offersAllServices: input.offersAllServices,
      serviceIds: input.serviceIds,
      customSchedule: input.customSchedule,
      customHolidays: input.customHolidays,
      userId: input.userId !== undefined ? userId : undefined,
      isActive: input.isActive,
    });
    await this.employeeRepository.save(updated);

    await this.bitacoraService.log({
      userId: updatedBy,
      action: 'update_employee',
      entityType: 'employee',
      entityId: id,
      metadata: input as Record<string, unknown>,
    });

    logger.info({ id }, 'UpdateEmployeeUseCase: completed');
    return updated;
  }
}
