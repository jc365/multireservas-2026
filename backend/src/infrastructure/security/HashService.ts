/**
 * @file HashService.ts
 * @module infrastructure/security
 */

import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export default class HashService {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
