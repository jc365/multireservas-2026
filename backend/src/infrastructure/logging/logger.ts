/**
 * @file logger.ts
 * @module infrastructure/logging
 */

import pino from 'pino';
import { getConfig } from '../config/config';

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'debug',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});

let syncTimer: ReturnType<typeof setInterval> | null = null;

export function syncLogLevel(): void {
  const level = getConfig<string>('logging.level', process.env.LOG_LEVEL || 'debug');
  if (logger.level !== level) {
    console.log(`🔄 [Config] Log level changed: ${logger.level} → ${level}`);
    logger.level = level;
  }
}

export function startLogLevelSync(intervalMs = 60_000): void {
  if (syncTimer) return;
  syncLogLevel();
  syncTimer = setInterval(syncLogLevel, intervalMs);
}

export function stopLogLevelSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

export default logger;
