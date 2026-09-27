/**
 * @file tenant.test.ts
 * @module tests/unit/infrastructure/middleware/tenant
 */

import { describe, it, expect, vi } from 'vitest';
import { tenantScope } from '../../../../backend/src/infrastructure/middleware/tenant';
import type { TenantRequest } from '../../../../backend/src/infrastructure/middleware/tenant';

function makeReq(user?: { id: string; tenantId?: string | null; role?: string }): TenantRequest {
  return { user } as unknown as TenantRequest;
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

describe('tenantScope (SF5)', () => {
  it('token con tenantId → pasa e inyecta req.tenantId', () => {
    const req = makeReq({ id: 'usr-1', tenantId: 'tenant-demo', role: 'owner' });
    const res = makeRes();
    const next = vi.fn();

    tenantScope(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantId).toBe('tenant-demo');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('token sin tenantId (superadmin) → 403', () => {
    const req = makeReq({ id: 'usr-admin', tenantId: null, role: 'admin' });
    const res = makeRes();
    const next = vi.fn();

    tenantScope(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tenant scope required' });
    expect(req.tenantId).toBeUndefined();
  });

  it('sin req.user → 403 defensivo (authMiddleware ya habría dado 401 antes)', () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = vi.fn();

    tenantScope(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('token de servicio (tenantId null) → 403 en ruta tenant', () => {
    const req = makeReq({ id: 'service', tenantId: null, role: 'service' });
    const res = makeRes();
    const next = vi.fn();

    tenantScope(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
