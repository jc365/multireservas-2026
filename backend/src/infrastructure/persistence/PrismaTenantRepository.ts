/**
 * @file PrismaTenantRepository.ts
 * @module infrastructure/persistence
 */

import type ITenantRepository from '../../application/interfaces/ITenantRepository';
import type {
  TenantSettingsRecord,
  TenantFullRecord,
  TenantSummaryRecord,
  CreateTenantRecord,
  CreateTenantWithOwnerInput,
} from '../../application/interfaces/ITenantRepository';
import prisma from './prismaClient';
import { Prisma } from '../../generated/prisma/client';

const FULL_SELECT = {
  id: true,
  name: true,
  slug: true,
  currency: true,
  timezone: true,
  settings: true,
  schedules: true,
  holidays: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toFullRecord(record: {
  id: string;
  name: string;
  slug: string | null;
  currency: string;
  timezone: string;
  settings: Prisma.JsonValue;
  schedules: Prisma.JsonValue;
  holidays: Prisma.JsonValue;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): TenantFullRecord {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    currency: record.currency,
    timezone: record.timezone,
    settings: record.settings,
    schedules: record.schedules,
    holidays: record.holidays,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export default class PrismaTenantRepository implements ITenantRepository {
  async findById(id: string): Promise<TenantSettingsRecord | null> {
    const record = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, settings: true, timezone: true },
    });
    if (!record) return null;
    return { id: record.id, settings: record.settings, timezone: record.timezone };
  }

  async findByIdFull(id: string): Promise<TenantFullRecord | null> {
    const record = await prisma.tenant.findUnique({
      where: { id },
      select: FULL_SELECT,
    });
    if (!record) return null;
    return toFullRecord(record);
  }

  async saveConfig(
    id: string,
    config: {
      name: string;
      currency: string;
      timezone: string;
      settings: unknown;
      schedules: unknown;
      holidays: unknown;
    }
  ): Promise<TenantFullRecord> {
    const record = await prisma.tenant.update({
      where: { id },
      data: {
        name: config.name,
        currency: config.currency,
        timezone: config.timezone,
        settings: config.settings as Prisma.InputJsonValue,
        schedules: config.schedules as Prisma.InputJsonValue,
        holidays: config.holidays as Prisma.InputJsonValue,
      },
      select: FULL_SELECT,
    });
    return toFullRecord(record);
  }

  // ── F4.0 superficie A (admin) ──────────────────────────────────

  async findAllSummaries(): Promise<TenantSummaryRecord[]> {
    const records = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        currency: true,
        timezone: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
    return records;
  }

  async findBySlug(slug: string): Promise<TenantSummaryRecord | null> {
    const record = await prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        currency: true,
        timezone: true,
        isActive: true,
        createdAt: true,
      },
    });
    return record;
  }

  async create(record: CreateTenantRecord): Promise<TenantFullRecord> {
    const created = await prisma.tenant.create({
      data: {
        id: record.id,
        name: record.name,
        slug: record.slug,
        currency: record.currency,
        timezone: record.timezone,
        settings: record.settings as Prisma.InputJsonValue,
        schedules: record.schedules as Prisma.InputJsonValue,
        holidays: record.holidays as Prisma.InputJsonValue,
        isActive: true,
      },
      select: FULL_SELECT,
    });
    return toFullRecord(created);
  }

  /**
   * Registro público (F4.4a): tenant + owner en una sola
   * transacción. Si un inserto falla (email/slug duplicado por
   * carrera), todo se revierte y el error Prisma sube al use-case.
   */
  async createWithOwner(
    input: CreateTenantWithOwnerInput
  ): Promise<{ tenant: TenantFullRecord; userId: string }> {
    const { tenant, owner } = input;
    const [createdTenant, createdUser] = await prisma.$transaction([
      prisma.tenant.create({
        data: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          currency: tenant.currency,
          timezone: tenant.timezone,
          settings: tenant.settings as Prisma.InputJsonValue,
          schedules: tenant.schedules as Prisma.InputJsonValue,
          holidays: tenant.holidays as Prisma.InputJsonValue,
          isActive: true,
        },
        select: FULL_SELECT,
      }),
      prisma.user.create({
        data: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          password: owner.password,
          role: 'owner',
          tenantId: tenant.id,
        },
      }),
    ]);
    return { tenant: toFullRecord(createdTenant), userId: createdUser.id };
  }

  async updateActive(id: string, isActive: boolean): Promise<TenantFullRecord> {
    const record = await prisma.tenant.update({
      where: { id },
      data: { isActive },
      select: FULL_SELECT,
    });
    return toFullRecord(record);
  }
}
