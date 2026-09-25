/**
 * @file genUUID.ts
 * @module domain/utils
 */

import { customAlphabet } from 'nanoid';

/**
 * Generates a prefixed UUID string.
 * @param prefix - The prefix for the ID (e.g., 'user', 'item').
 * @returns A string in the format '<prefix>-<id>'.
 */
export default function genUUID(prefix: string): string {
  const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 10);
  return `${prefix}-${formatId(nanoid())}`;
}

/**
 * Formatea la entrada como abcd-efgh-<resto>
 */
function formatId(id: string): string {
  const chunks = id.match(/.{1,4}/g) || [];
  return chunks.join('-');
}
