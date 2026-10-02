/**
 * @file mr-codes.ts
 * @module infrastructure/errors
 *
 * Códigos de dominio de MR (NO se portan al starter en S8). El
 * módulo genérico vive en `codes.ts`; aquí solo van códigos que
 * aportan semántica de este dominio (reservas, servicios,
 * empleados, tenants, config, slug).
 */

export const RESERVATION_NOT_FOUND = 'RESERVATION_NOT_FOUND';
export const RESERVATION_OVERLAP = 'RESERVATION_OVERLAP';
export const RESERVATION_INVALID_STATE = 'RESERVATION_INVALID_STATE';
export const DATE_START_TIME_MISMATCH = 'DATE_START_TIME_MISMATCH';
/** F4.4c: "sin preferencia" y ningún empleado activo encaja en el slot. */
export const NO_EMPLOYEE_AVAILABLE = 'NO_EMPLOYEE_AVAILABLE';

export const SERVICE_NOT_FOUND = 'SERVICE_NOT_FOUND';
export const EMPLOYEE_NOT_FOUND = 'EMPLOYEE_NOT_FOUND';
export const TENANT_NOT_FOUND = 'TENANT_NOT_FOUND';
export const CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND';

export const SLUG_ALREADY_EXISTS = 'SLUG_ALREADY_EXISTS';
export const USER_ID_ALREADY_LINKED = 'USER_ID_ALREADY_LINKED';
export const USER_EMAIL_EXISTS = 'USER_EMAIL_EXISTS';

// Registro y verificación de email (F4.4a)
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';
export const EMAIL_VERIFICATION_INVALID_TOKEN = 'EMAIL_VERIFICATION_INVALID_TOKEN';
export const EMAIL_VERIFICATION_EXPIRED = 'EMAIL_VERIFICATION_EXPIRED';
