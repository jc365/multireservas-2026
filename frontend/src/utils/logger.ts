/**
 * @file logger.ts
 * @module utils/logger
 *
 * Frontend logger that respects the logging.level config value.
 */

type LogFn = (msg: string, data?: unknown) => void;

let currentLevel = 'info';

const LEVEL_ORDER = ['debug', 'info', 'warn', 'error', 'fatal'] as const;

function shouldLog(level: string): boolean {
  const idx = LEVEL_ORDER.indexOf(level as typeof LEVEL_ORDER[number]);
  const cur = LEVEL_ORDER.indexOf(currentLevel as typeof LEVEL_ORDER[number]);
  return idx >= cur;
}

function make(level: string): LogFn {
  return (msg: string, data?: unknown) => {
    if (!shouldLog(level)) return;
    switch (level) {
      case 'debug': console.debug(msg, data ?? ''); break;
      case 'info':  console.info(msg, data ?? ''); break;
      case 'warn':  console.warn(msg, data ?? ''); break;
      case 'error': console.error(msg, data ?? ''); break;
      case 'fatal': console.error(`[FATAL] ${msg}`, data ?? ''); break;
    }
  };
}

export const logger = {
  debug: make('debug'),
  info: make('info'),
  warn: make('warn'),
  error: make('error'),
  fatal: make('fatal'),
};

const LOG_LEVEL_MAP: Record<string, string> = {
  'debug': 'debug',
  'info': 'info',
  'warn': 'warn',
  'warning': 'warn',
  'error': 'error',
  'fatal': 'fatal',
  'critical': 'fatal',
  'trace': 'debug',
};

export function setLogLevel(level: string): void {
  const normalized = LOG_LEVEL_MAP[level.toLowerCase()] ?? 'info';
  currentLevel = normalized;
}
