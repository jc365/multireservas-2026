/**
 * @file PrismaBitacoraRepository.ts
 * @module infrastructure/persistence
 */

import IBitacoraRepository from '../../application/interfaces/IBitacoraRepository';
import type {
  BitacoraEvent,
  BitacoraQueryOptions,
  BitacoraPaginatedResult,
} from '../../application/interfaces/IBitacoraRepository';
import Bitacora from '../../domain/entities/Bitacora';
import { Prisma } from '../../generated/prisma/client';
import prisma from './prismaClient';

export default class PrismaBitacoraRepository implements IBitacoraRepository {
  async log(event: BitacoraEvent): Promise<void> {
    await prisma.bitacora.create({
      data: {
        userId: event.userId,
        action: event.action,
        tenantId: event.tenantId ?? undefined,
        entityType: event.entityType ?? undefined,
        entityId: event.entityId ?? undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: event.metadata as any,
      },
    });
  }

  async findAll(options: BitacoraQueryOptions): Promise<BitacoraPaginatedResult> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (options.userId) {
      where.userId = options.userId;
    }
    if (options.actions && options.actions.length > 0) {
      where.action = { in: options.actions };
    } else if (options.action) {
      where.action = options.action;
    }
    if (options.entityType) {
      where.entityType = options.entityType;
    }
    if (options.adminAsOwner !== undefined) {
      // F4.0: jsonb path filter sobre metadata['admin-as-owner'].
      where.metadata =
        options.adminAsOwner === 'any'
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({ path: ['admin-as-owner'], not: Prisma.AnyNull } as any)
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({ path: ['admin-as-owner'], equals: options.adminAsOwner } as any);
    }
    if (options.since || options.until) {
      where.createdAt = {};
      if (options.since) {
        where.createdAt.gte = new Date(options.since);
      }
      if (options.until) {
        where.createdAt.lte = new Date(options.until);
      }
    }

    const [records, total] = await Promise.all([
      prisma.bitacora.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.bitacora.count({ where }),
    ]);

    const data = records.map((r: typeof records[number]) =>
      Bitacora.create(
        r.id,
        r.userId,
        r.action,
        r.entityType,
        r.entityId,
        (r.metadata as Record<string, unknown>) ?? null,
        r.createdAt,
        r.tenantId
      )
    );

    return { data, total };
  }
}
