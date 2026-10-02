/**
 * @file UpdateServiceUseCase.ts
 * @module application/use-cases/services
 */

import Service from '../../../domain/entities/Service';
import ServiceName from '../../../domain/value-objects/ServiceName';
import BookingSettings from '../../../domain/value-objects/BookingSettings';
import IServiceRepository from '../../interfaces/IServiceRepository';
import ITenantRepository from '../../interfaces/ITenantRepository';
import { UpdateServiceInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';
import { AppError, NotFoundError, ValidationError } from '../../../infrastructure/errors';
import { SERVICE_NOT_FOUND, TENANT_NOT_FOUND } from '../../../infrastructure/errors/mr-codes';

function normalizeOptional(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export default class UpdateServiceUseCase {
  constructor(
    private readonly serviceRepository: IServiceRepository,
    private readonly tenantRepository: ITenantRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(id: string, input: UpdateServiceInput, tenantId: string, updatedBy: string): Promise<Service> {
    logger.info({ id, tenantId, updatedBy }, 'UpdateServiceUseCase: starting');

    const existing = await this.serviceRepository.findById(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundError('Service not found', SERVICE_NOT_FOUND);
    }

    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Tenant not found', TENANT_NOT_FOUND);
    }

    // VOs del dominio → ValidationError (F4.2); solo las llamadas
    // síncronas a la entity/VOs van dentro del try.
    let updated: Service;
    try {
      const settings = BookingSettings.fromTenantSettings(tenant.settings);
      updated = existing.withUpdates(
        {
          name: input.name !== undefined ? ServiceName.create(input.name) : undefined,
          description: normalizeOptional(input.description),
          duration: input.duration,
          price: input.price,
          category: normalizeOptional(input.category),
          isActive: input.isActive,
        },
        settings
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid service data');
    }
    await this.serviceRepository.save(updated);

    await this.bitacoraService.log({
      userId: updatedBy,
      action: 'update_service',
      entityType: 'service',
      entityId: id,
      metadata: input as Record<string, unknown>,
    });

    logger.info({ id }, 'UpdateServiceUseCase: completed');
    return updated;
  }
}
