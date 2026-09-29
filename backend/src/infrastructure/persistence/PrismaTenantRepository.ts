/**
 * @file PrismaTenantRepository.ts
 * @module infrastructure/persistence
 */

import type ITenantRepository from '../../application/interfaces/ITenantRepository';
import type { TenantSettingsRecord, TenantFullRecord } from '../../application/interfaces/ITenantRepository';
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
}
