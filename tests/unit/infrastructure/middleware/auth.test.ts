/**
 * @file auth.test.ts
 * @module tests/unit/infrastructure/middleware/auth
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AuthRequest } from '../../../../backend/src/infrastructure/middleware/auth';
import { authMiddleware, generateToken } from '../../../../backend/src/infrastructure/middleware/auth';
import { signPayload, signLegacyToken } from '../../../helpers/jwt';

function makeReq(token?: string) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as AuthRequest;
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

describe('authMiddleware (SF4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('token válido → req.user con id, tenantId y role', () => {
    const token = generateToken('usr-1', 'ten-1', 'admin');
    const req = makeReq(token);
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ id: 'usr-1', tenantId: 'ten-1', role: 'admin' });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('token con tenantId null → req.user.tenantId null', () => {
    const token = generateToken('usr-2', null, 'employee');
    const req = makeReq(token);
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ id: 'usr-2', tenantId: null, role: 'employee' });
  });

  it('token antiguo (solo userId) → 401 (política SF4: rechazar)', () => {
    const req = makeReq(signLegacyToken('usr-old'));
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
  });

  it('payload sin role → 401', () => {
    const req = makeReq(signPayload({ userId: 'usr-1', tenantId: null }));
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('payload sin tenantId → 401', () => {
    const req = makeReq(signPayload({ userId: 'usr-1', role: 'admin' }));
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('firma inválida → 401', () => {
    const req = makeReq(signPayload({ userId: 'usr-1', tenantId: null, role: 'admin' }).replace(/.{8}$/, 'AAAAAAAA'));
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('sin header Authorization → 401', () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('service token (ADMIT_TOKENS) → req.user service con tenantId null', async () => {
    vi.stubEnv('ADMIT_TOKENS', 'svc-secret-1');
    vi.resetModules();
    const fresh = await import('../../../../backend/src/infrastructure/middleware/auth');

    const req = makeReq('svc-secret-1');
    const res = makeRes();
    const next = vi.fn();

    fresh.authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ id: 'service', role: 'service', tenantId: null });
  });
});
