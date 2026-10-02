/**
 * @file CreateTenantUseCase.ts
 * @module application/use-cases/admin
 *
 * Creación de tenant (F4.0 superficie A, POST /admin/tenants).
 *
 * Crea SOLO el tenant (name, slug opcional, currency, timezone,
 * settings/schedules/holidays). NO crea owner — decisión F4.0
 * documentada en FINDINGS: el admin gestiona el tenant recién
 * creado con el modo owner (superficie B).
 *
 * Validación: name/currency/timezone/schedules/holidays vía el
 * dominio (`Tenant.reconstitute`); slug opcional normalizado a
 * minúsculas + guiones y con unicidad (409 si existe). settings usa
 * `TenantSettings.from` (tolerante) — mismos defaults que el resto.
 *
 * Bitácora: `create_tenant` con `tenantId = null` (acción de
 * plataforma, F0 #15 — no afecta a ningún tenant existente).
 */

import Tenant from '../../../domain/entities/Tenant';
import genUUID from '../../../domain/utils/genUUID';
import type ITenantRepository from '../../interfaces/ITenantRepository';
import { type CreateTenantInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';
import BitacoraService from '../../../infrastructure/logging/BitacoraService';
import { AppError, ConflictError, ValidationError } from '../../../infrastructure/errors';
import { SLUG_ALREADY_EXISTS } from '../../../infrastructure/errors/mr-codes';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default class CreateTenantUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly bitacoraService: BitacoraService
  ) {}

  async execute(input: CreateTenantInput, createdBy: string): Promise<Tenant> {
    logger.info({ createdBy }, 'CreateTenantUseCase: starting');

    if (typeof input.name !== 'string' || input.name.trim() === '') {
      throw new ValidationError('name is required');
    }

    let slug: string | null = null;
    if (input.slug !== undefined && input.slug !== null && String(input.slug).trim() !== '') {
      slug = String(input.slug).trim().toLowerCase();
      if (!SLUG_PATTERN.test(slug)) {
        throw new ValidationError('slug must contain only lowercase letters, numbers and hyphens');
      }
      const existing = await this.tenantRepository.findBySlug(slug);
      if (existing) {
        throw new ConflictError('slug already exists', SLUG_ALREADY_EXISTS);
      }
    }

    // Dominio (Tenant.reconstitute valida settings/schedules/holidays
    // del body) → ValidationError (F4.2).
    const now = new Date();
    let tenant: Tenant;
    try {
      tenant = Tenant.reconstitute({
        id: genUUID('ten'),
        name: input.name,
        slug,
        currency: input.currency ?? 'EUR',
        timezone: input.timezone ?? 'UTC',
        settings: input.settings ?? {},
        schedules: input.schedules ?? [],
        holidays: input.holidays ?? [],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid tenant data');
    }

    const config = tenant.toConfigRecord();
    const saved = await this.tenantRepository.create({
      id: tenant.id,
      name: config.name,
      slug,
      currency: config.currency,
      timezone: config.timezone,
      settings: config.settings,
      schedules: config.schedules,
      holidays: config.holidays,
    });

    await this.bitacoraService.log({
      userId: createdBy,
      action: 'create_tenant',
      tenantId: null,
      entityType: 'tenant',
      entityId: saved.id,
      metadata: { name: saved.name, slug: saved.slug },
    });

    logger.info({ tenantId: saved.id }, 'CreateTenantUseCase: completed');
    return Tenant.reconstitute(saved);
  }
}
