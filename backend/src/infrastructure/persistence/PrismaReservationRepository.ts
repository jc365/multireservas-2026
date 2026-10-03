/**
 * @file PrismaReservationRepository.ts
 * @module infrastructure/persistence
 */

import Reservation, { ACTIVE_STATUSES } from '../../domain/entities/Reservation';
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
        ...(options?.date
          ? { date: new Date(`${options.date}T00:00:00.000Z`) }
          : options?.from || options?.to
            ? {
                date: {
                  ...(options.from ? { gte: new Date(`${options.from}T00:00:00.000Z`) } : {}),
                  ...(options.to ? { lte: new Date(`${options.to}T00:00:00.000Z`) } : {}),
                },
              }
            : {}),
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

  async findByGroupBookingId(groupBookingId: string): Promise<ReservationWithRelations[]> {
    const records = (await prisma.reservation.findMany({
      where: { groupBookingId },
      include: relationSelect,
      orderBy: { startTimeUTC: 'asc' },
    })) as ReservationRecord[];
    return records.map((record) => this.toView(record));
  }

  async findGroupTotals(groupBookingIds: string[]): Promise<Record<string, number>> {
    const totals: Record<string, number> = {};
    if (groupBookingIds.length === 0) return totals;
    const rows = await prisma.reservation.findMany({
      where: { groupBookingId: { in: groupBookingIds } },
      select: { groupBookingId: true, service: { select: { price: true } } },
    });
    for (const row of rows) {
      if (!row.groupBookingId) continue;
      totals[row.groupBookingId] =
        (totals[row.groupBookingId] ?? 0) + Number(row.service?.price ?? 0);
    }
    return totals;
  }

  async findActiveRanges(
    tenantId: string,
    employeeId: string,
    fromUTC: Date,
    toUTC: Date,
    excludeReservationIds?: string[]
  ): Promise<{ start: Date; end: Date }[]> {
    const records = await prisma.reservation.findMany({
      where: {
        tenantId,
        employeeId,
        status: { in: [...ACTIVE_STATUSES] },
        startTimeUTC: { lt: toUTC },
        endTimeUTC: { gt: fromUTC },
        // F4.7a: excluir las filas propias de la reserva/grupo que se
        // reprograma (su ocupación vieja no es un solape).
        ...(excludeReservationIds && excludeReservationIds.length > 0
          ? { id: { notIn: excludeReservationIds } }
          : {}),
      },
      select: { startTimeUTC: true, endTimeUTC: true },
    });
    return records.map((record) => ({
      start: record.startTimeUTC,
      end: record.endTimeUTC,
    }));
  }

  async save(reservation: Reservation): Promise<void> {
    const data = this.rowData(reservation);
    await prisma.reservation.upsert({
      where: { id: reservation.id },
      create: { id: reservation.id, createdAt: reservation.createdAt, ...data },
      update: data,
    });
  }

  async saveMany(reservations: Reservation[]): Promise<void> {
    if (reservations.length === 0) return;
    // F4.5b: todo o nada. Un P2002 (p.ej. carrera sobre activeKey)
    // revierte la transacción completa y el error sube al use case.
    await prisma.$transaction(
      reservations.map((reservation) => {
        const data = this.rowData(reservation);
        return prisma.reservation.upsert({
          where: { id: reservation.id },
          create: { id: reservation.id, createdAt: reservation.createdAt, ...data },
          update: data,
        });
      })
    );
  }

  private rowData(reservation: Reservation) {
    return {
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
