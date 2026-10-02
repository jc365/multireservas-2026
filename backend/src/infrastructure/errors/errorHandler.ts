/**
 * @file errorHandler.ts
 * @module infrastructure/errors
 *
 * Middleware global de errores (F4.2). Se monta en `index.ts` al
 * final, después de todas las rutas. Envelope único:
 *
 *   { "error": { "code": "...", "message": "..." } }
 *
 * - AppError → su status y code; 4xx exponen el message propio.
 * - Errores de body-parser (JSON malformado, etc.: status 4xx con
 *   `expose`) → 400 VALIDATION_ERROR con su message (JSON, nunca
 *   HTML).
 * - Cualquier otro error → 500 INTERNAL_ERROR con message genérico
 *   "Internal server error"; el detalle (err + stack) va al log.
 */

import type { Request, Response, NextFunction } from 'express';
import logger from '../logging/logger';
import { getRequestId } from '../logging/requestContext';
import AppError from './AppError';
import { VALIDATION_ERROR, INTERNAL_ERROR } from './codes';

const GENERIC_MESSAGE = 'Internal server error';

interface RawHttpError {
  status?: number;
  statusCode?: number;
  expose?: boolean;
}

function resolve(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message };
  }

  const raw = err as RawHttpError | null;
  const status = typeof raw?.status === 'number'
    ? raw.status
    : typeof raw?.statusCode === 'number'
      ? raw.statusCode
      : 0;

  // body-parser y similares: errores de cliente con status 4xx
  // (JSON malformado → 400, payload demasiado grande → 413…).
  if (status >= 400 && status < 500) {
    const message = err instanceof Error && err.message ? err.message : 'Validation error';
    return { status, code: VALIDATION_ERROR, message };
  }

  return { status: 500, code: INTERNAL_ERROR, message: GENERIC_MESSAGE };
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const { status, code, message } = resolve(err);
  const base = { code, status, method: req.method, url: req.originalUrl };

  if (status >= 500) {
    logger.error({ ...base, err, requestId: getRequestId() }, 'Unhandled error');
  } else {
    logger.warn({ ...base, message, requestId: getRequestId() }, 'Request error');
  }

  res.status(status).json({ error: { code, message } });
}
