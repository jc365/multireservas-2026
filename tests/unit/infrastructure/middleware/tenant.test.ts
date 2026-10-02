/**
 * @file tenant.test.ts
 * @module tests/unit/infrastructure/middleware/tenant
 *
 * SF5 + F4.0: tenantScope resuelve el scope de zona tenant:
 * - owner/employee → tenant del token (el header X-Tenant-Id se ignora).
 * - admin + X-Tenant-Id → impersonación (req.isImpersonating + ALS);
 *   sin header → 403; header inexistente → 404.
 * - service/sin tenant → 403. Sin user → 401.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../backend/src/infrastructure/persistence/prismaClient', () => ({
  default: {
    tenant: {
      findUnique: vi.fn(),
    },
  },
}));
vi.mock('../../../../backend/src/infrastructure/logging/requestContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../backend/src/infrastructure/logging/requestContext')>();
  return {
    ...actual,
    setImpersonationTenantId: vi.fn(),
  };
});

import { tenantScope } from '../../../../backend/src/infrastructure/middleware/tenant';
import type { TenantRequest } from '../../../../backend/src/infrastructure/middleware/tenant';
import prisma from '../../../../backend/src/infrastructure/persistence/prismaClient';
import { setImpersonationTenantId } from '../../../../backend/src/infrastructure/logging/requestContext';
import { AppError } from '../../../../backend/src/infrastructure/errors';

const findUnique = vi.mocked(prisma.tenant.findUnique);

/** F4.2: los errores van por next(err) — el errorHandler responde. */
function expectNextError(next: ReturnType<typeof vi.fn>, status: number, code: string, message?: string) {
  expect(next).toHaveBeenCalledOnce();
  const err = next.mock.calls[0][0] as AppError;
  expect(err).toBeInstanceOf(AppError);
  expect(err.status).toBe(status);
  expect(err.code).toBe(code);
  if (message !== undefined) expect(err.message).toBe(message);
}

function makeReq(
  user?: { id: string; tenantId?: string | null; role?: string },
  headers: Record<string, string | string[] | undefined> = {}
): TenantRequest {
  return { user, headers } as unknown as TenantRequest;
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn(function (this: unknown, code: number) {
      (res as { statusCode: number }).statusCode = code;
      return res;
    }),
    json: vi.fn(function (this: unknown, payload: unknown) {
      (res as { body: unknown }).body = payload;
      return res;
    }),
  };
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue({ id: 'tenant-demo' } as never);
});

describe('tenantScope (SF5 + F4.0)', () => {
  it('owner sin header → pasa e inyecta req.tenantId del token', async () => {
    const req = makeReq({ id: 'usr-1', tenantId: 'tenant-demo', role: 'owner' });
    const res = makeRes();
    const next = vi.fn();

    await tenantScope(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantId).toBe('tenant-demo');
    expect(req.isImpersonating).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('owner CON header X-Tenant-Id → lo ignora (solo el token manda)', async () => {
    const req = makeReq(
      { id: 'usr-1', tenantId: 'tenant-demo', role: 'owner' },
      { 'x-tenant-id': 'tenant-otro' }
    );
    const res = makeRes();
    const next = vi.fn();

    await tenantScope(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantId).toBe('tenant-demo');
    expect(req.isImpersonating).toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('admin sin header → 403 Tenant scope required', async () => {
    const req = makeReq({ id: 'usr-admin', tenantId: null, role: 'admin' });
    const res = makeRes();
    const next = vi.fn();

    await tenantScope(req, res, next);

    expectNextError(next, 403, 'FORBIDDEN', 'Tenant scope required');
    expect(res.status).not.toHaveBeenCalled();
    expect(req.tenantId).toBeUndefined();
  });

  it('admin con header vacío → 403', async () => {
    const req = makeReq({ id: 'usr-admin', tenantId: null, role: 'admin' }, { 'x-tenant-id': '   ' });
    const res = makeRes();
    const next = vi.fn();

    await tenantScope(req, res, next);

    expectNextError(next, 403, 'FORBIDDEN', 'Tenant scope required');
    expect(res.status).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('admin + header válido → isImpersonating, tenantId y marca ALS', async () => {
    const req = makeReq(
      { id: 'usr-admin', tenantId: null, role: 'admin' },
      { 'x-tenant-id': 'tenant-demo' }
    );
    const res = makeRes();
    const next = vi.fn();

    await tenantScope(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantId).toBe('tenant-demo');
    expect(req.isImpersonating).toBe(true);
    expect(setImpersonationTenantId).toHaveBeenCalledWith('tenant-demo');
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-demo' },
      select: { id: true },
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('admin con header duplicado → usa el primero', async () => {
    findUnique.mockResolvedValue({ id: 'tenant-a' } as never);
    const req = makeReq(
      { id: 'usr-admin', tenantId: null, role: 'admin' },
      { 'x-tenant-id': ['tenant-a', 'tenant-b'] }
    );
    const res = makeRes();
    const next = vi.fn();

    await tenantScope(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantId).toBe('tenant-a');
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      select: { id: true },
    });
  });

  it('admin + header de tenant inexistente → 404', async () => {
    findUnique.mockResolvedValue(null as never);
    const req = makeReq(
      { id: 'usr-admin', tenantId: null, role: 'admin' },
      { 'x-tenant-id': 'tenant-ghost' }
    );
    const res = makeRes();
    const next = vi.fn();

    await tenantScope(req, res, next);

    expectNextError(next, 404, 'TENANT_NOT_FOUND', 'Tenant not found');
    expect(res.status).not.toHaveBeenCalled();
    expect(req.tenantId).toBeUndefined();
    expect(setImpersonationTenantId).not.toHaveBeenCalled();
  });

  it('token de servicio (tenantId null) → 403 en ruta tenant', async () => {
    const req = makeReq({ id: 'service', tenantId: null, role: 'service' });
    const res = makeRes();
    const next = vi.fn();

    await tenantScope(req, res, next);

    expectNextError(next, 403, 'FORBIDDEN', 'Tenant scope required');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('sin req.user → 401 (authMiddleware ya habría dado 401 antes)', async () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = vi.fn();

    await tenantScope(req, res, next);

    expectNextError(next, 401, 'UNAUTHORIZED', 'Unauthorized');
    expect(res.status).not.toHaveBeenCalled();
  });
});
