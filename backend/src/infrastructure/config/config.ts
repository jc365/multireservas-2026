/**
 * @file config.ts
 * @module infrastructure/config
 *
 * Configuração centralizada que lê a tabela Config do banco de dados.
 * Recarrega automaticamente a cada 60 segundos em produção.
 */

import prisma from '../persistence/prismaClient';
import logger from '../logging/logger';

const RELOAD_INTERVAL_MS = 60_000;
const DB_WAIT_MAX_ATTEMPTS = 30;
const DB_WAIT_INTERVAL_MS = 1_000;

let cache = new Map<string, unknown>();
let lastLoaded = 0;
let reloadTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Wait for the database to be reachable.
 * Retries up to DB_WAIT_MAX_ATTEMPTS times with 1s interval.
 * Throws after all retries exhausted.
 */
async function waitForDb(): Promise<void> {
  for (let attempt = 1; attempt <= DB_WAIT_MAX_ATTEMPTS; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      logger.info('Database connection established');
      return;
    } catch (err) {
      if (attempt < DB_WAIT_MAX_ATTEMPTS) {
        logger.warn({ attempt, maxAttempts: DB_WAIT_MAX_ATTEMPTS }, 'Database not ready, retrying in 1s...');
        await new Promise((resolve) => setTimeout(resolve, DB_WAIT_INTERVAL_MS));
      } else {
        logger.fatal({ err }, 'Database unreachable after %d attempts. Exiting.', DB_WAIT_MAX_ATTEMPTS);
        throw new Error(`Database unreachable after ${DB_WAIT_MAX_ATTEMPTS} attempts`);
      }
    }
  }
}

export async function loadConfig(): Promise<void> {
  try {
    const rows = await prisma.config.findMany({
      select: { key: true, value: true },
    });
    const next = new Map<string, unknown>();
    for (const row of rows) {
      next.set(row.key, row.value);
    }
    cache = next;
    lastLoaded = Date.now();
    logger.debug({ count: rows.length }, 'Config reloaded from database');
  } catch (err) {
    logger.error({ err }, 'Failed to reload config from database');
  }
}

export function getConfig<T = unknown>(key: string, defaultValue: T): T {
  const val = cache.get(key);
  return val !== undefined ? (val as T) : defaultValue;
}

export async function startAutoReload(intervalMs = RELOAD_INTERVAL_MS): Promise<void> {
  if (reloadTimer) return;
  await waitForDb();
  await loadConfig();
  reloadTimer = setInterval(() => {
    loadConfig();
  }, intervalMs);
}

export function stopAutoReload(): void {
  if (reloadTimer) {
    clearInterval(reloadTimer);
    reloadTimer = null;
  }
}

export function getLastLoadedAt(): Date {
  return new Date(lastLoaded);
}
