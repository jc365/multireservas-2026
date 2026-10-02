/**
 * @file auth.test.ts
 * @module tests/unit/infrastructure/middleware/auth
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AuthRequest } from '../../../../backend/src/infrastructure/middleware/auth';
import { authMiddleware, generateToken } from '../../../../backend/src/infrastructure/middleware/auth';
import { AppError } from '../../../../backend/src/infrastructure/errors';
import { signPayload, signLegacyToken } from '../../../helpers/jwt';

/** F4.2: los errores van por next(err) — el errorHandler responde. */
function expectNextError(next: ReturnType<typeof vi.fn>, status: number, code: string, message?: string) {
  expect(next).toHaveBeenCalledOnce();
  const err = next.mock.calls[0][0] as AppError;
  expect(err).toBeInstanceOf(AppError);
  expect(err.status).toBe(status);
  expect(err.code).toBe(code);
  if (message !== undefined) expect(err.message).toBe(message);
}

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

    expectNextError(next, 401, 'UNAUTHORIZED', 'Invalid token');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('payload sin role → 401', () => {
    const req = makeReq(signPayload({ userId: 'usr-1', tenantId: null }));
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expectNextError(next, 401, 'UNAUTHORIZED', 'Invalid token');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('payload sin tenantId → 401', () => {
    const req = makeReq(signPayload({ userId: 'usr-1', role: 'admin' }));
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expectNextError(next, 401, 'UNAUTHORIZED', 'Invalid token');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('firma inválida → 401', () => {
    const req = makeReq(signPayload({ userId: 'usr-1', tenantId: null, role: 'admin' }).replace(/.{8}$/, 'AAAAAAAA'));
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expectNextError(next, 401, 'UNAUTHORIZED', 'Invalid token');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('sin header Authorization → 401', () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expectNextError(next, 401, 'UNAUTHORIZED', 'Unauthorized');
    expect(res.status).not.toHaveBeenCalled();
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
