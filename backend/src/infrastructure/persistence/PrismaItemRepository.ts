/**
 * @file PrismaItemRepository.ts
 * @module infrastructure/persistence
 */

import Item from '../../domain/entities/Item';
import ItemTitle from '../../domain/value-objects/ItemTitle';
import type IItemRepository from '../../application/interfaces/IItemRepository';
import prisma from './prismaClient';

export default class PrismaItemRepository implements IItemRepository {
  async findById(id: string): Promise<Item | null> {
    const record = await prisma.item.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findAll(): Promise<Item[]> {
    const records = await prisma.item.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => this.toDomain(record));
  }

  async findByCreatedBy(createdBy: string): Promise<Item[]> {
    const records = await prisma.item.findMany({
      where: { createdBy },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => this.toDomain(record));
  }

  async save(item: Item): Promise<void> {
    await prisma.item.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        title: item.title.getValue(),
        description: item.description,
        status: item.status,
        createdBy: item.createdBy,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        fileKey: item.fileKey,
        mimeType: item.mimeType,
      },
      update: {
        title: item.title.getValue(),
        description: item.description,
        status: item.status,
        updatedAt: item.updatedAt,
        fileKey: item.fileKey,
        mimeType: item.mimeType,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.item.delete({
      where: { id },
    });
  }

  private toDomain(record: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    fileKey: string | null;
    mimeType: string | null;
  }): Item {
    const title = ItemTitle.create(record.title);
    return Item.reconstitute(
      record.id,
      title,
      record.description,
      record.status as 'active' | 'archived',
      record.createdBy,
      record.createdAt,
      record.updatedAt,
      record.fileKey,
      record.mimeType
    );
  }
}
