/**
 * @file PrismaServiceRepository.ts
 * @module infrastructure/persistence
 */

import Service from '../../domain/entities/Service';
import ServiceName from '../../domain/value-objects/ServiceName';
import type IServiceRepository from '../../application/interfaces/IServiceRepository';
import prisma from './prismaClient';

export default class PrismaServiceRepository implements IServiceRepository {
  async findById(id: string): Promise<Service | null> {
    const record = await prisma.service.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByTenantId(tenantId: string): Promise<Service[]> {
    const records = await prisma.service.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => this.toDomain(record));
  }

  async findByIds(ids: string[]): Promise<Service[]> {
    if (ids.length === 0) return [];
    const records = await prisma.service.findMany({
      where: { id: { in: ids } },
    });
    return records.map((record) => this.toDomain(record));
  }

  async save(service: Service): Promise<void> {
    await prisma.service.upsert({
      where: { id: service.id },
      create: {
        id: service.id,
        tenantId: service.tenantId,
        name: service.name.getValue(),
        description: service.description,
        duration: service.duration,
        price: service.price,
        category: service.category,
        isActive: service.isActive,
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
      },
      update: {
        tenantId: service.tenantId,
        name: service.name.getValue(),
        description: service.description,
        duration: service.duration,
        price: service.price,
        category: service.category,
        isActive: service.isActive,
        updatedAt: service.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.service.delete({
      where: { id },
    });
  }

  private toDomain(record: {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    duration: number;
    price: unknown;
    category: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Service {
    return Service.reconstitute({
      id: record.id,
      tenantId: record.tenantId,
      name: ServiceName.create(record.name),
      description: record.description,
      duration: record.duration,
      price: record.price === null ? null : Number(record.price),
      category: record.category,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
