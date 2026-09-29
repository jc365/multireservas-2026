/**
 * @file PrismaEmployeeRepository.ts
 * @module infrastructure/persistence
 */

import Employee from '../../domain/entities/Employee';
import EmployeeName from '../../domain/value-objects/EmployeeName';
import type IEmployeeRepository from '../../application/interfaces/IEmployeeRepository';
import prisma from './prismaClient';
import { Prisma } from '../../generated/prisma/client';

type EmployeeRecord = {
  id: string;
  tenantId: string;
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  offersAllServices: boolean;
  customSchedule: unknown;
  customHolidays: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  services: { id: string }[];
};

const servicesInclude = { services: { select: { id: true } } } as const;

function toDbJson(value: Record<string, unknown> | null) {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

export default class PrismaEmployeeRepository implements IEmployeeRepository {
  async findById(id: string): Promise<Employee | null> {
    const record = await prisma.employee.findUnique({
      where: { id },
      include: servicesInclude,
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByTenantId(tenantId: string, options?: { includeInactive?: boolean }): Promise<Employee[]> {
    const records = await prisma.employee.findMany({
      where: {
        tenantId,
        ...(options?.includeInactive ? {} : { isActive: true }),
      },
      include: servicesInclude,
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => this.toDomain(record));
  }

  async findByUserId(userId: string): Promise<Employee | null> {
    const record = await prisma.employee.findUnique({
      where: { userId },
      include: servicesInclude,
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async save(employee: Employee): Promise<void> {
    const services = employee.serviceIds.map((id) => ({ id }));
    await prisma.employee.upsert({
      where: { id: employee.id },
      create: {
        id: employee.id,
        tenantId: employee.tenantId,
        userId: employee.userId,
        name: employee.name.getValue(),
        email: employee.email,
        phone: employee.phone,
        offersAllServices: employee.offersAllServices,
        customSchedule: toDbJson(employee.customSchedule),
        customHolidays: toDbJson(employee.customHolidays),
        isActive: employee.isActive,
        createdAt: employee.createdAt,
        updatedAt: employee.updatedAt,
        services: { connect: services },
      },
      update: {
        tenantId: employee.tenantId,
        userId: employee.userId,
        name: employee.name.getValue(),
        email: employee.email,
        phone: employee.phone,
        offersAllServices: employee.offersAllServices,
        customSchedule: toDbJson(employee.customSchedule),
        customHolidays: toDbJson(employee.customHolidays),
        isActive: employee.isActive,
        updatedAt: employee.updatedAt,
        services: { set: services },
      },
    });
  }

  async deactivate(id: string): Promise<void> {
    await prisma.employee.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private toDomain(record: EmployeeRecord): Employee {
    return Employee.reconstitute({
      id: record.id,
      tenantId: record.tenantId,
      userId: record.userId,
      name: EmployeeName.create(record.name),
      email: record.email,
      phone: record.phone,
      offersAllServices: record.offersAllServices,
      serviceIds: record.services.map((service) => service.id),
      customSchedule: (record.customSchedule as Record<string, unknown> | null) ?? null,
      customHolidays: (record.customHolidays as Record<string, unknown> | null) ?? null,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
