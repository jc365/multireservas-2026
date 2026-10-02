/**
 * @file BitacoraService.test.ts
 * @module tests/unit/infrastructure/logging/BitacoraService
 *
 * F4.0: enriquecimiento de eventos cuando el request es de un admin
 * impersonando un tenant (ALS `impersonationTenantId`):
 * - sin impersonación → evento tal cual.
 * - con impersonación → + tenantId (si venía vacío) + metadata
 *   `admin-as-owner`.
 * - tenantId explícito del use case tiene prioridad.
 * - errores del repo nunca se propagan (bitácora no bloquea).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import BitacoraService from '../../../../backend/src/infrastructure/logging/BitacoraService';
import {
  requestContextMiddleware,
  setImpersonationTenantId,
} from '../../../../backend/src/infrastructure/logging/requestContext';
import type IBitacoraRepository from '../../../../backend/src/application/interfaces/IBitacoraRepository';

function makeRepo(): jest.Mocked<IBitacoraRepository> {
  return {
    log: vi.fn().mockResolvedValue(undefined),
    findAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  } as unknown as jest.Mocked<IBitacoraRepository>;
}

/** Ejecuta `fn` dentro de un store ALS de request (simula una request real). */
async function withinRequestContext(fn: () => Promise<void>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = {} as never;
    const res = { setHeader: vi.fn() } as never;
    requestContextMiddleware(req, res, () => {
      fn().then(resolve, reject);
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BitacoraService.log (F4.0 impersonación)', () => {
  it('sin impersonación → escribe el evento tal cual', async () => {
    const repo = makeRepo();
    const service = new BitacoraService(repo);

    await service.log({ userId: 'usr-admin', action: 'create_service', entityType: 'service' });

    expect(repo.log).toHaveBeenCalledWith({
      userId: 'usr-admin',
      action: 'create_service',
      entityType: 'service',
    });
  });

  it('con impersonación → añade tenantId y metadata admin-as-owner', async () => {
    const repo = makeRepo();
    const service = new BitacoraService(repo);

    await withinRequestContext(async () => {
      setImpersonationTenantId('tenant-demo');
      await service.log({ userId: 'usr-admin', action: 'update_service', entityType: 'service' });
    });

    expect(repo.log).toHaveBeenCalledWith({
      userId: 'usr-admin',
      action: 'update_service',
      entityType: 'service',
      tenantId: 'tenant-demo',
      metadata: { 'admin-as-owner': 'tenant-demo' },
    });
  });

  it('con impersonación → respeta el tenantId explícito del use case', async () => {
    const repo = makeRepo();
    const service = new BitacoraService(repo);

    await withinRequestContext(async () => {
      setImpersonationTenantId('tenant-header');
      await service.log({
        userId: 'usr-admin',
        action: 'update_tenant',
        tenantId: 'tenant-explicito',
        entityType: 'tenant',
      });
    });

    expect(repo.log).toHaveBeenCalledWith({
      userId: 'usr-admin',
      action: 'update_tenant',
      tenantId: 'tenant-explicito',
      entityType: 'tenant',
      metadata: { 'admin-as-owner': 'tenant-header' },
    });
  });

  it('con impersonación → mergea con metadata existente sin pisarla', async () => {
    const repo = makeRepo();
    const service = new BitacoraService(repo);

    await withinRequestContext(async () => {
      setImpersonationTenantId('tenant-demo');
      await service.log({
        userId: 'usr-admin',
        action: 'update_service',
        metadata: { serviceId: 'svc-1' },
      });
    });

    expect(repo.log).toHaveBeenCalledWith({
      userId: 'usr-admin',
      action: 'update_service',
      tenantId: 'tenant-demo',
      metadata: { serviceId: 'svc-1', 'admin-as-owner': 'tenant-demo' },
    });
  });

  it('fallo del repo → no propaga (bitácora no bloquea)', async () => {
    const repo = makeRepo();
    repo.log.mockRejectedValueOnce(new Error('db down') as never);
    const service = new BitacoraService(repo);

    await expect(service.log({ userId: 'u', action: 'x' })).resolves.toBeUndefined();
  });
});
