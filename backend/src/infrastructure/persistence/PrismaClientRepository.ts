/**
 * @file PrismaClientRepository.ts
 * @module infrastructure/persistence
 */

import Client from '../../domain/entities/Client';
import type IClientRepository from '../../application/interfaces/IClientRepository';
import prisma from './prismaClient';

export default class PrismaClientRepository implements IClientRepository {
  async findById(id: string): Promise<Client | null> {
    const record = await prisma.client.findUnique({ where: { id } });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByTenantAndPhone(tenantId: string, phone: string): Promise<Client | null> {
    const record = await prisma.client.findFirst({
      where: { tenantId, phone: phone.trim() },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByTenantAndEmail(tenantId: string, email: string): Promise<Client | null> {
    const record = await prisma.client.findUnique({
      where: { tenantId_email: { tenantId, email: email.trim() } },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async save(client: Client): Promise<void> {
    await prisma.client.upsert({
      where: { id: client.id },
      create: {
        id: client.id,
        tenantId: client.tenantId,
        userId: client.userId,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone,
        notes: client.notes,
        dataExpiresAt: client.dataExpiresAt,
        visitCount: client.visitCount,
        lastVisit: client.lastVisit,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      },
      update: {
        userId: client.userId,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone,
        notes: client.notes,
        dataExpiresAt: client.dataExpiresAt,
        visitCount: client.visitCount,
        lastVisit: client.lastVisit,
        updatedAt: client.updatedAt,
      },
    });
  }

  private toDomain(record: {
    id: string;
    tenantId: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string;
    notes: string | null;
    dataExpiresAt: Date | null;
    visitCount: number;
    lastVisit: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Client {
    return Client.reconstitute({
      id: record.id,
      tenantId: record.tenantId,
      userId: record.userId,
      firstName: record.firstName,
      lastName: record.lastName,
      email: record.email,
      phone: record.phone,
      notes: record.notes,
      dataExpiresAt: record.dataExpiresAt,
      visitCount: record.visitCount,
      lastVisit: record.lastVisit,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
