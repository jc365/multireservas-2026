/**
 * @file ForbiddenError.ts
 * @module infrastructure/errors
 *
 * 403 — autenticado pero sin permisos (rol o scope). Código por
 * defecto `FORBIDDEN`.
 */

import AppError from '../AppError';
import { FORBIDDEN } from '../codes';

export default class ForbiddenError extends AppError {
  constructor(message: string, code: string = FORBIDDEN) {
    super(message, code, 403);
  }
}
