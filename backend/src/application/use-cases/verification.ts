/**
 * @file verification.ts
 * @module application/use-cases
 *
 * Utilidades compartidas del flujo de verificación de email
 * (F4.4a): TTL del token, generación de token, comparación
 * constante en el tiempo y guardia de bloqueo para los use-cases de
 * edición (PUT /tenants/me, POST /services, POST /employees).
 *
 * La condición de "no verificado" es la PRESENCIA de una clave
 * `email_verification` válida en `settings` (ver
 * `TenantSettings.isValidEmailVerification`). El rol admin está
 * exento del bloqueo (decisión F4.4a — FINDINGS).
 */

import { timingSafeEqual } from 'crypto';
import {
  isValidEmailVerification,
  type EmailVerificationData,
} from '../../domain/value-objects/TenantSettings';
import genToken from '../../domain/utils/genToken';
import { ForbiddenError } from '../../infrastructure/errors';
import { EMAIL_NOT_VERIFIED } from '../../infrastructure/errors/mr-codes';

/** Caducidad del token de verificación: 24 horas (F4.4a). */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/** Info del requester que reciben los use-cases de edición. */
export interface RequesterInfo {
  role?: string;
  isImpersonating?: boolean;
}

/** Nuevo valor de la clave `email_verification` (token + expiresAt ISO). */
export function createVerificationValue(): EmailVerificationData {
  return {
    token: genToken(32),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString(),
  };
}

/** ¿Hay verificación de email pendiente en este settings (crudo)? */
export function hasPendingVerification(settings: unknown): boolean {
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
    return false;
  }
  return isValidEmailVerification((settings as Record<string, unknown>).email_verification);
}

/** Comparación de tokens resistente a timing attacks. */
export function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Guardia de bloqueo (F4.4a): lanza 403 EMAIL_NOT_VERIFIED si el
 * tenant no ha verificado su email. El admin (con X-Tenant-Id,
 * isImpersonating) está exento.
 */
export function assertEmailVerified(settings: unknown, requester?: RequesterInfo): void {
  if (requester?.role === 'admin') return;
  if (hasPendingVerification(settings)) {
    throw new ForbiddenError('Email verification required', EMAIL_NOT_VERIFIED);
  }
}
