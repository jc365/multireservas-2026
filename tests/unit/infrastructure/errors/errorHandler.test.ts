/**
 * @file errorHandler.test.ts
 * @module tests/unit/infrastructure/errors/errorHandler
 *
 * F4.2: middleware global — envelope `{ error: { code, message } }`.
 * - AppError → su status/code; 4xx exponen el message propio.
 * - errores 4xx crudos (body-parser) → VALIDATION_ERROR con su message.
 * - cualquier otro → 500 INTERNAL_ERROR genérico (detalle al log).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../backend/src/infrastructure/logging/logger', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { errorHandler } from '../../../../backend/src/infrastructure/errors';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../../../../backend/src/infrastructure/errors';
import logger from '../../../../backend/src/infrastructure/logging/logger';

type ResMock = {
  headersSent: boolean;
  statusCode: number | undefined;
  body: unknown;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function makeRes(headersSent = false): ResMock {
  const res: ResMock = {
    headersSent,
    statusCode: undefined,
    body: undefined,
    status: vi.fn(function (this: ResMock, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: ResMock, payload: unknown) {
      this.body = payload;
      return this;
    }),
  };
  return res;
}

const req = { method: 'GET', originalUrl: '/api/v1/test' } as never;

function run(err: unknown, res = makeRes()) {
  const next = vi.fn();
  errorHandler(err, req, res as never, next);
  return { res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('errorHandler (F4.2)', () => {
  it('AppError → responde con su status, code y message', () => {
    const { res, next } = run(new NotFoundError('Reservation not found', 'RESERVATION_NOT_FOUND'));

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body).toEqual({
      error: { code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found' },
    });
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('ValidationError 400 → envelope con VALIDATION_ERROR', () => {
    const { res } = run(new ValidationError('name is required'));

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'name is required' },
    });
  });

  it('ConflictError 409 → envelope con CONFLICT', () => {
    const { res } = run(new ConflictError('overlap', 'RESERVATION_OVERLAP'));

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body).toEqual({
      error: { code: 'RESERVATION_OVERLAP', message: 'overlap' },
    });
  });

  it('error genérico → 500 INTERNAL_ERROR con mensaje genérico (no filtra)', () => {
    const { res } = run(new Error('SELECT * FROM users WHERE secret = ...'));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(logger.error).toHaveBeenCalled();
  });

  it('error crudo con status 4xx (body-parser) → VALIDATION_ERROR con su message', () => {
    const parseError = Object.assign(new SyntaxError('Unexpected end of JSON input'), {
      status: 400,
      expose: true,
    });

    const { res } = run(parseError);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Unexpected end of JSON input' },
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('error crudo con status 5xx → 500 genérico', () => {
    const upstream = Object.assign(new Error('upstream exploded'), { status: 503 });

    const { res } = run(upstream);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('si las cabeceras ya se enviaron → delega a next(err)', () => {
    const res = makeRes(true);
    const { next } = run(new Error('late'), res);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
