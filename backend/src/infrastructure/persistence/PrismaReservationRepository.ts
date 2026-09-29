/**
 * @file PrismaReservationRepository.ts
 * @module infrastructure/persistence
 */

import Reservation from '../../domain/entities/Reservation';
import type IReservationRepository from '../../application/interfaces/IReservationRepository';
import type {
  ReservationWithRelations,
  ReservationListOptions,
} from '../../application/interfaces/IReservationRepository';
import prisma from './prismaClient';

const relationSelect = {
  client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  employee: { select: { id: true, name: true, isActive: true } },
  service: { select: { id: true, name: true, duration: true, price: true } },
} as const;

type ReservationRecord = {
  id: string;
  tenantId: string;
  clientId: string;
  employeeId: string;
  serviceId: string;
  date: Date;
  startTimeUTC: Date;
  endTimeUTC: Date;
  timezone: string;
  duration: number;
  status: Reservation['status'];
  notes: string | null;
  groupBookingId: string | null;
  activeKey: string | null;
  cancelToken: string | null;
  createdAt: Date;
  updatedAt: Date;
  client: { id: string; firstName: string; lastName: string; email: string | null; phone: string } | null;
  employee: { id: string; name: string; isActive: boolean } | null;
  service: { id: string; name: string; duration: number; price: unknown } | null;
};

export default class PrismaReservationRepository implements IReservationRepository {
  async findById(id: string): Promise<ReservationWithRelations | null> {
    const record = (await prisma.reservation.findUnique({
      where: { id },
      include: relationSelect,
    })) as ReservationRecord | null;
    if (!record) return null;
    return this.toView(record);
  }

  async findByTenantId(
    tenantId: string,
    options?: ReservationListOptions
  ): Promise<ReservationWithRelations[]> {
    const records = (await prisma.reservation.findMany({
      where: {
        tenantId,
        ...(options?.status ? { status: options.status as Reservation['status'] } : {}),
        ...(options?.date ? { date: new Date(`${options.date}T00:00:00.000Z`) } : {}),
        ...(options?.employeeId ? { employeeId: options.employeeId } : {}),
        ...(options?.clientId ? { clientId: options.clientId } : {}),
      },
      include: relationSelect,
      orderBy: { createdAt: 'desc' },
      ...(options?.limit ? { take: options.limit } : {}),
    })) as ReservationRecord[];
    return records.map((record) => this.toView(record));
  }

  async findByActiveKey(activeKey: string): Promise<ReservationWithRelations | null> {
    const record = (await prisma.reservation.findUnique({
      where: { activeKey },
      include: relationSelect,
    })) as ReservationRecord | null;
    if (!record) return null;
    return this.toView(record);
  }

  async findByCancelToken(cancelToken: string): Promise<ReservationWithRelations | null> {
    const record = (await prisma.reservation.findUnique({
      where: { cancelToken },
      include: relationSelect,
    })) as ReservationRecord | null;
    if (!record) return null;
    return this.toView(record);
  }

  async save(reservation: Reservation): Promise<void> {
    const data = {
      tenantId: reservation.tenantId,
      clientId: reservation.clientId,
      employeeId: reservation.employeeId,
      serviceId: reservation.serviceId,
      date: reservation.date,
      startTimeUTC: reservation.startTimeUTC,
      endTimeUTC: reservation.endTimeUTC,
      timezone: reservation.timezone,
      duration: reservation.duration,
      status: reservation.status,
      notes: reservation.notes,
      groupBookingId: reservation.groupBookingId,
      activeKey: reservation.activeKey,
      cancelToken: reservation.cancelToken,
      updatedAt: reservation.updatedAt,
    };
    await prisma.reservation.upsert({
      where: { id: reservation.id },
      create: { id: reservation.id, createdAt: reservation.createdAt, ...data },
      update: data,
    });
  }

  private toView(record: ReservationRecord): ReservationWithRelations {
    return {
      reservation: Reservation.reconstitute({
        id: record.id,
        tenantId: record.tenantId,
        clientId: record.clientId,
        employeeId: record.employeeId,
        serviceId: record.serviceId,
        date: record.date,
        startTimeUTC: record.startTimeUTC,
        endTimeUTC: record.endTimeUTC,
        timezone: record.timezone,
        duration: record.duration,
        status: record.status,
        notes: record.notes,
        groupBookingId: record.groupBookingId,
        activeKey: record.activeKey,
        cancelToken: record.cancelToken,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
      client: record.client,
      employee: record.employee,
      service: record.service
        ? { ...record.service, price: record.service.price === null ? null : Number(record.service.price) }
        : null,
    };
  }
}
