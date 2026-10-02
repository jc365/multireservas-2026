/**
 * @file genToken.ts
 * @module domain/utils
 *
 * Token opaco para verificación de email (F4.4a). Alfabeto
 * URL-safe (letras + dígitos) para viajar seguro en el query string
 * del link del email.
 */

import { customAlphabet } from 'nanoid';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const nanoid = customAlphabet(ALPHABET, 32);

/**
 * Genera un token opaco de `length` caracteres (default 32).
 */
export default function genToken(length: number = 32): string {
  if (length === 32) return nanoid();
  return customAlphabet(ALPHABET, length)();
}
