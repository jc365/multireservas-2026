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
      throw new Error('Service not found');
    }

    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }
    const settings = BookingSettings.fromTenantSettings(tenant.settings);

    const updated = existing.withUpdates(
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
