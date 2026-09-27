/**
 * @file jwt.ts
 * @module tests/helpers
 *
 * utilidades JWT para tests (jsonwebtoken vive solo en backend/node_modules).
 */

import { createRequire } from 'node:module';

// Resuelve jsonwebtoken desde backend/ (mismo camino que usa auth.ts en runtime)
const backendRequire = createRequire(new URL('../../backend/package.json', import.meta.url));
const jwt = backendRequire('jsonwebtoken') as {
  sign: (payload: object, secret: string, options?: object) => string;
  verify: (token: string, secret: string) => unknown;
};

const SECRET = process.env.JWT_SECRET || 'test-secret';

/** Firma un payload arbitrario (para forzar tokens legacy o rol manipulado). */
export function signPayload(payload: object): string {
  return jwt.sign(payload, SECRET, { expiresIn: '24h' });
}

/** Token con formato antiguo (solo userId) — debe ser rechazado por SF4. */
export function signLegacyToken(userId: string): string {
  return signPayload({ userId });
}

/** Decodifica el payload (sin verificar firma) — para assert de tokens propios. */
export function decodePayload(token: string): Record<string, unknown> {
  const [, body] = token.split('.');
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}
