/**
 * @file errorMessages.test.ts
 * @module i18n
 *
 * Tests del mapa `error.code → clave i18n` (F4.6a, decisión F0 #7):
 * extracción del envelope, mapa de códigos y fallback al `message`
 * del backend cuando no hay clave traducida.
 */

import { describe, it, expect } from 'vitest';
import {
  ERROR_CODE_TO_KEY,
  extractBackendError,
  i18nKeyForError,
  translateError,
} from './errorMessages';

/** Forma del error ANTES de que el interceptor normalice `data.error`. */
function envelopeError(code: string, message: string) {
  return { response: { data: { error: { code, message } } } };
}

describe('ERROR_CODE_TO_KEY', () => {
  it('mapea los códigos de dominio de MR a errors.<CODE>', () => {
    expect(ERROR_CODE_TO_KEY.RESERVATION_OVERLAP).toBe('errors.RESERVATION_OVERLAP');
    expect(ERROR_CODE_TO_KEY.NO_EMPLOYEE_AVAILABLE).toBe('errors.NO_EMPLOYEE_AVAILABLE');
    expect(ERROR_CODE_TO_KEY.EMAIL_NOT_VERIFIED).toBe('errors.EMAIL_NOT_VERIFIED');
    expect(ERROR_CODE_TO_KEY.SERVICE_NOT_FOUND).toBe('errors.SERVICE_NOT_FOUND');
  });

  it('mapea los códigos genéricos', () => {
    expect(ERROR_CODE_TO_KEY.UNAUTHORIZED).toBe('errors.UNAUTHORIZED');
    expect(ERROR_CODE_TO_KEY.VALIDATION_ERROR).toBe('errors.VALIDATION_ERROR');
    expect(ERROR_CODE_TO_KEY.INTERNAL_ERROR).toBe('errors.INTERNAL_ERROR');
  });
});

describe('extractBackendError', () => {
  it('lee el envelope { error: { code, message } }', () => {
    expect(extractBackendError(envelopeError('RESERVATION_OVERLAP', 'Overlap'))).toEqual({
      code: 'RESERVATION_OVERLAP',
      message: 'Overlap',
    });
  });

  it('lee el error ya normalizado por el interceptor (code + data.error string)', () => {
    const err = {
      code: 'UNAUTHORIZED',
      response: { data: { error: 'Invalid credentials' } },
    };
    expect(extractBackendError(err)).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Invalid credentials',
    });
  });

  it('acepta Error plano y strings', () => {
    expect(extractBackendError(new Error('Boom'))).toEqual({ code: null, message: 'Boom' });
    expect(extractBackendError('Boom')).toEqual({ code: null, message: 'Boom' });
    expect(extractBackendError(undefined)).toEqual({ code: null, message: null });
  });
});

describe('i18nKeyForError', () => {
  it('código conocido → clave i18n', () => {
    expect(i18nKeyForError(envelopeError('RESERVATION_OVERLAP', 'x'))).toBe(
      'errors.RESERVATION_OVERLAP'
    );
  });

  it('código desconocido o ausente → null', () => {
    expect(i18nKeyForError(envelopeError('FUTURE_CODE', 'x'))).toBeNull();
    expect(i18nKeyForError(new Error('sin código'))).toBeNull();
  });
});

describe('translateError', () => {
  const t = (key: string) => {
    const dict: Record<string, string> = { 'errors.UNAUTHORIZED': 'Fallo de autenticación.' };
    return dict[key] ?? key;
  };

  it('código con clave traducida → mensaje traducido', () => {
    expect(translateError(envelopeError('UNAUTHORIZED', 'Invalid credentials'), t)).toBe(
      'Fallo de autenticación.'
    );
  });

  it('código sin clave → message del backend (inglés)', () => {
    expect(translateError(envelopeError('FUTURE_CODE', 'Backend said it'), t)).toBe(
      'Backend said it'
    );
  });

  it('clave sin traducir (t devuelve la clave) → message del backend', () => {
    expect(translateError(envelopeError('RESERVATION_OVERLAP', 'Overlap'), t)).toBe('Overlap');
  });

  it('sin code ni message → cadena vacía (el caller aplica su fallback)', () => {
    expect(translateError({}, t)).toBe('');
  });
});
