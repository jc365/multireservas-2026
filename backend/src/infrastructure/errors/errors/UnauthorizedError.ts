/**
 * @file UnauthorizedError.ts
 * @module infrastructure/errors
 *
 * 401 — sin credenciales o credenciales inválidas. Código por
 * defecto `UNAUTHORIZED`.
 */

import AppError from '../AppError';
import { UNAUTHORIZED } from '../codes';

export default class UnauthorizedError extends AppError {
  constructor(message: string, code: string = UNAUTHORIZED) {
    super(message, code, 401);
  }
}
