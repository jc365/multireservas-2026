/**
 * @file requestContext.ts
 * @module infrastructure/logging
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { nanoid } from 'nanoid';
import type { Request, Response, NextFunction } from 'express';
import logger from './logger';

interface RequestContext {
  requestId: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string | undefined {
  return asyncLocalStorage.getStore()?.requestId;
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = nanoid(10);
  res.setHeader('x-request-id', requestId);
  asyncLocalStorage.run({ requestId }, () => next());
}

const requestLogger = {
  info(obj: Record<string, unknown>, msg?: string): void {
    const requestId = getRequestId();
    if (requestId) {
      logger.info({ ...obj, requestId }, msg);
    } else {
      logger.info(obj, msg);
    }
  },
  warn(obj: Record<string, unknown>, msg?: string): void {
    const requestId = getRequestId();
    if (requestId) {
      logger.warn({ ...obj, requestId }, msg);
    } else {
      logger.warn(obj, msg);
    }
  },
  error(obj: Record<string, unknown>, msg?: string): void {
    const requestId = getRequestId();
    if (requestId) {
      logger.error({ ...obj, requestId }, msg);
    } else {
      logger.error(obj, msg);
    }
  },
  debug(obj: Record<string, unknown>, msg?: string): void {
    const requestId = getRequestId();
    if (requestId) {
      logger.debug({ ...obj, requestId }, msg);
    } else {
      logger.debug(obj, msg);
    }
  },
};

export default requestLogger;
