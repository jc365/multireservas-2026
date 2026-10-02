/**
 * @file ValidationError.ts
 * @module infrastructure/errors
 *
 * 400 — datos de entrada inválidos. Código genérico por defecto
 * `VALIDATION_ERROR`; se puede pasar un código de dominio
 * (ej. `DATE_START_TIME_MISMATCH` en mr-codes).
 */

import AppError from '../AppError';
import { VALIDATION_ERROR } from '../codes';

export default class ValidationError extends AppError {
  constructor(message: string, code: string = VALIDATION_ERROR) {
    super(message, code, 400);
  }
}
