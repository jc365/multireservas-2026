/**
 * @file NotFoundError.ts
 * @module infrastructure/errors
 *
 * 404 — recurso no encontrado. Código genérico por defecto
 * `NOT_FOUND`; los dominios pasan su propio código
 * (ej. `RESERVATION_NOT_FOUND` en mr-codes).
 */

import AppError from '../AppError';
import { NOT_FOUND } from '../codes';

export default class NotFoundError extends AppError {
  constructor(message: string, code: string = NOT_FOUND) {
    super(message, code, 404);
  }
}
