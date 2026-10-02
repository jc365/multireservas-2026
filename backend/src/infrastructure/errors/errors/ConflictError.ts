/**
 * @file ConflictError.ts
 * @module infrastructure/errors
 *
 * 409 — conflicto con el estado actual (solape, slug duplicado,
 * recurso ya cancelado…). Código genérico por defecto `CONFLICT`;
 * los dominios pasan el suyo (ej. `RESERVATION_OVERLAP`).
 */

import AppError from '../AppError';
import { CONFLICT } from '../codes';

export default class ConflictError extends AppError {
  constructor(message: string, code: string = CONFLICT) {
    super(message, code, 409);
  }
}
