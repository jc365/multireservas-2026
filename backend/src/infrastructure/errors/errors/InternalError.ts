/**
 * @file InternalError.ts
 * @module infrastructure/errors
 *
 * 500 — fallo inesperado. El `message` real se guarda para el log;
 * al cliente SIEMPRE se le envía el genérico ("Internal server
 * error") desde el errorHandler.
 */

import AppError from '../AppError';
import { INTERNAL_ERROR } from '../codes';

export default class InternalError extends AppError {
  constructor(message: string = 'Internal server error', code: string = INTERNAL_ERROR) {
    super(message, code, 500);
  }
}
