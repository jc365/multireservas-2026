/**
 * @file PrismaUserRepository.ts
 * @module infrastructure/persistence
 */

import User from '../../domain/entities/User';
import type { UserRole } from '../../domain/entities/User';
import Email from '../../domain/value-objects/Email';
import FullName from '../../domain/value-objects/FullName';
import type IUserRepository from '../../application/interfaces/IUserRepository';
import prisma from './prismaClient';

export default class PrismaUserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    const record = await prisma.user.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await prisma.user.findUnique({
      where: { email },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findAll(): Promise<User[]> {
    const records = await prisma.user.findMany();
    return records.map((record) => this.toDomain(record));
  }

  async save(user: User): Promise<void> {
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        name: user.name.getValue(),
        email: user.email.getValue(),
        password: user.password,
        role: user.role,
      },
      update: {
        name: user.name.getValue(),
        email: user.email.getValue(),
        password: user.password,
        role: user.role,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.user.delete({
      where: { id },
    });
  }

  private toDomain(record: { id: string; name: string; email: string; password: string; role: UserRole; tenantId: string | null }): User {
    const userName = FullName.create(record.name);
    const userEmail = Email.create(record.email);
    return User.create(userName, userEmail, record.password, record.id, record.role, record.tenantId);
  }
}
