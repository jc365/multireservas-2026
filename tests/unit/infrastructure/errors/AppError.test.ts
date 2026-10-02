/**
 * @file AppError.test.ts
 * @module tests/unit/infrastructure/errors/AppError
 *
 * F4.2: clase base y subclases del módulo de errores (portable, S8).
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  InternalError,
} from '../../../../backend/src/infrastructure/errors';

describe('AppError (F4.2)', () => {
  it('constructor fija message, code y status', () => {
    const err = new AppError('algo salió mal', 'CUSTOM_CODE', 418);
    expect(err.message).toBe('algo salió mal');
    expect(err.code).toBe('CUSTOM_CODE');
    expect(err.status).toBe(418);
  });

  it('es una instancia de Error y capturable (instanceof)', () => {
    const err = new AppError('x', 'Y', 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('AppError');
    expect(err.stack).toBeDefined();
  });
});

describe('subclases (status + code por defecto)', () => {
  it('NotFoundError → 404 NOT_FOUND', () => {
    const err = new NotFoundError('no existe');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('no existe');
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('NotFoundError');
  });

  it('ValidationError → 400 VALIDATION_ERROR', () => {
    const err = new ValidationError('datos inválidos');
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('ValidationError');
  });

  it('UnauthorizedError → 401 UNAUTHORIZED', () => {
    const err = new UnauthorizedError('sin auth');
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('UnauthorizedError');
  });

  it('ForbiddenError → 403 FORBIDDEN', () => {
    const err = new ForbiddenError('prohibido');
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('ForbiddenError');
  });

  it('ConflictError → 409 CONFLICT', () => {
    const err = new ConflictError('conflicto');
    expect(err.status).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('ConflictError');
  });

  it('InternalError → 500 INTERNAL_ERROR', () => {
    const err = new InternalError('error interno');
    expect(err.status).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('InternalError');
  });
});

describe('código de dominio opcional (mr-codes)', () => {
  it('la subclase acepta un code propio sin perder el status', () => {
    const err = new NotFoundError('Reservation not found', 'RESERVATION_NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.code).toBe('RESERVATION_NOT_FOUND');

    const conflict = new ConflictError('overlap', 'RESERVATION_OVERLAP');
    expect(conflict.status).toBe(409);
    expect(conflict.code).toBe('RESERVATION_OVERLAP');

    const mismatch = new ValidationError('date ≠ día local', 'DATE_START_TIME_MISMATCH');
    expect(mismatch.status).toBe(400);
    expect(mismatch.code).toBe('DATE_START_TIME_MISMATCH');
  });
});
