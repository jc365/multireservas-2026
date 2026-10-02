/**
 * @file CreateServiceUseCase.ts
 * @module application/use-cases/services
 */

import Service from '../../../domain/entities/Service';
import ServiceName from '../../../domain/value-objects/ServiceName';
import BookingSettings from '../../../domain/value-objects/BookingSettings';
import IServiceRepository from '../../interfaces/IServiceRepository';
import ITenantRepository from '../../interfaces/ITenantRepository';
import { CreateServiceInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';
import { AppError, NotFoundError, ValidationError } from '../../../infrastructure/errors';
import { TENANT_NOT_FOUND } from '../../../infrastructure/errors/mr-codes';
import { assertEmailVerified, type RequesterInfo } from '../verification';

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export default class CreateServiceUseCase {
  constructor(
    private readonly serviceRepository: IServiceRepository,
    private readonly tenantRepository: ITenantRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(
    input: CreateServiceInput,
    tenantId: string,
    createdBy: string,
    requester?: RequesterInfo
  ): Promise<Service> {
    logger.info({ tenantId, name: input.name, createdBy }, 'CreateServiceUseCase: starting');

    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Tenant not found', TENANT_NOT_FOUND);
    }

    // F4.4a: sin verificar email → 403 (admin exento).
    assertEmailVerified(tenant.settings, requester);

    // VOs del dominio (ServiceName/BookingSettings/Service.create)
    // → ValidationError: los datos de entrada son del body (F4.2).
    let name;
    let service: Service;
    try {
      const settings = BookingSettings.fromTenantSettings(tenant.settings);
      name = ServiceName.create(input.name);
      service = Service.create(
        {
          tenantId,
          name,
          description: normalizeOptional(input.description),
          duration: input.duration,
          price: input.price ?? null,
          category: normalizeOptional(input.category),
        },
        settings
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid service data');
    }

    await this.serviceRepository.save(service);

    await this.bitacoraService.log({
      userId: createdBy,
      action: 'create_service',
      entityType: 'service',
      entityId: service.id,
      metadata: { name: name.getValue(), duration: service.duration },
    });

    logger.info({ serviceId: service.id }, 'CreateServiceUseCase: completed');
    return service;
  }
}
