/**
 * @file PrismaConfigRepository.ts
 * @module infrastructure/persistence
 */

import Config from '../../domain/entities/Config';
import type IConfigRepository from '../../application/interfaces/IConfigRepository';
import prisma from './prismaClient';

export default class PrismaConfigRepository implements IConfigRepository {
  async findByKey(key: string): Promise<Config | null> {
    const record = await prisma.config.findUnique({ where: { key } });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByCategory(category: string): Promise<Config[]> {
    const records = await prisma.config.findMany({ where: { category } });
    return records.map((r: typeof records[number]) => this.toDomain(r));
  }

  async findAll(): Promise<Config[]> {
    const records = await prisma.config.findMany();
    return records.map((r: typeof records[number]) => this.toDomain(r));
  }

  async save(config: Config): Promise<void> {
    await prisma.config.upsert({
      where: { key: config.key },
      create: {
        key: config.key,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value: config.value as any,
        description: config.description,
        category: config.category,
        updatedBy: config.updatedBy,
      },
      update: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value: config.value as any,
        description: config.description,
        category: config.category,
        updatedBy: config.updatedBy,
      },
    });
  }

  async delete(key: string): Promise<void> {
    await prisma.config.delete({ where: { key } });
  }

  private toDomain(record: {
    id: string;
    key: string;
    value: unknown;
    description: string | null;
    category: string | null;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Config {
    return Config.create(
      record.key,
      record.value,
      record.description ?? undefined,
      record.category ?? undefined,
      record.updatedBy ?? undefined,
      record.id
    );
  }
}
