/**
 * @file AppError.ts
 * @module infrastructure/errors
 *
 * Clase base del módulo global de errores (F4.2). Todo error que
 * deba llegar al cliente con el envelope `{ error: { code, message } }`
 * se lanza como AppError o una de sus subclases. Módulo genérico
 * portable al starter (S8): no contiene códigos de dominio.
 */

export default class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
