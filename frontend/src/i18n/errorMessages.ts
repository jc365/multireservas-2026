/**
 * @file errorMessages.ts
 * @module i18n
 *
 * Mapa `error.code → clave i18n` (F4.6a, decisión F0 #7).
 *
 * El backend devuelve `{ error: { code, message } }` (envelope F4.2) y
 * el interceptor de `api/client.ts` guarda `code` en el propio objeto
 * de error. Aquí solo se centraliza el mapa y la extracción: las
 * cadenas traducidas viven en `locales/{en,es}/errors.json` bajo la
 * clave `errors.<CODE>`.
 *
 * Fallback (F0 #7): si el código no tiene clave, o la clave no está
 * traducida, se muestra el `message` del backend (inglés).
 */

/**
 * Códigos del backend → clave de diccionario. Incluye los códigos de
 * dominio (mr-codes) y los genéricos (codes).
 */
export const ERROR_CODE_TO_KEY: Record<string, string> = {
  // Dominio MR
  RESERVATION_NOT_FOUND: 'errors.RESERVATION_NOT_FOUND',
  RESERVATION_OVERLAP: 'errors.RESERVATION_OVERLAP',
  RESERVATION_INVALID_STATE: 'errors.RESERVATION_INVALID_STATE',
  DATE_START_TIME_MISMATCH: 'errors.DATE_START_TIME_MISMATCH',
  NO_EMPLOYEE_AVAILABLE: 'errors.NO_EMPLOYEE_AVAILABLE',
  SERVICE_NOT_FOUND: 'errors.SERVICE_NOT_FOUND',
  EMPLOYEE_NOT_FOUND: 'errors.EMPLOYEE_NOT_FOUND',
  TENANT_NOT_FOUND: 'errors.TENANT_NOT_FOUND',
  CONFIG_NOT_FOUND: 'errors.CONFIG_NOT_FOUND',
  SLUG_ALREADY_EXISTS: 'errors.SLUG_ALREADY_EXISTS',
  USER_ID_ALREADY_LINKED: 'errors.USER_ID_ALREADY_LINKED',
  USER_EMAIL_EXISTS: 'errors.USER_EMAIL_EXISTS',
  EMAIL_NOT_VERIFIED: 'errors.EMAIL_NOT_VERIFIED',
  EMAIL_VERIFICATION_INVALID_TOKEN: 'errors.EMAIL_VERIFICATION_INVALID_TOKEN',
  EMAIL_VERIFICATION_EXPIRED: 'errors.EMAIL_VERIFICATION_EXPIRED',
  // Genéricos
  VALIDATION_ERROR: 'errors.VALIDATION_ERROR',
  UNAUTHORIZED: 'errors.UNAUTHORIZED',
  FORBIDDEN: 'errors.FORBIDDEN',
  NOT_FOUND: 'errors.NOT_FOUND',
  CONFLICT: 'errors.CONFLICT',
  INTERNAL_ERROR: 'errors.INTERNAL_ERROR',
};

export interface BackendErrorInfo {
  code: string | null;
  message: string | null;
}

interface EnvelopeError {
  code?: unknown;
  message?: unknown;
  response?: { data?: unknown };
}

/**
 * Extrae `code` y `message` de cualquier forma de error que llegue al
 * frontend: envelope `{ error: { code, message } }` (sin interceptor),
 * `error.code` ya normalizado por el interceptor + `data.error` string,
 * `Error` plano o un string.
 */
export function extractBackendError(err: unknown): BackendErrorInfo {
  if (typeof err === 'string') return { code: null, message: err };
  if (!err || typeof err !== 'object') return { code: null, message: null };

  const e = err as EnvelopeError;
  const code = typeof e.code === 'string' ? e.code : null;

  const data = e.response?.data as { error?: unknown } | undefined;
  const payload = data?.error;

  let message: string | null = null;
  let payloadCode: string | null = null;

  if (typeof payload === 'string') {
    message = payload;
  } else if (payload && typeof payload === 'object') {
    const p = payload as EnvelopeError;
    if (typeof p.code === 'string') payloadCode = p.code;
    if (typeof p.message === 'string') message = p.message;
  }

  if (message === null && typeof e.message === 'string') message = e.message;

  return { code: code ?? payloadCode, message };
}

/** Clave i18n del error, o `null` si el código no está en el mapa. */
export function i18nKeyForError(err: unknown): string | null {
  const { code } = extractBackendError(err);
  if (!code) return null;
  return ERROR_CODE_TO_KEY[code] ?? null;
}

/**
 * Mensaje final para la UI: traducción si la clave existe y está
 * traducida; si no, el `message` del backend (F0 #7). `t` es la
 * función del contexto (devuelve la propia clave si no la encuentra).
 */
export function translateError(err: unknown, t: (key: string) => string): string {
  const key = i18nKeyForError(err);
  if (key) {
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  const { message } = extractBackendError(err);
  return message ?? '';
}
