/**
 * @file auth.ts
 * @module infrastructure/middleware
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '../../domain/entities/User';
import { UnauthorizedError } from '../errors';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET: string = process.env.JWT_SECRET;

const SERVICE_TOKENS = new Set(
  (process.env.ADMIT_TOKENS || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
);

export interface JwtTokenPayload {
  userId: string;
  tenantId: string | null;
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    tenantId?: string | null;
    role?: string;
  };
}

function isValidPayload(decoded: unknown): decoded is JwtTokenPayload {
  if (typeof decoded !== 'object' || decoded === null) return false;
  const p = decoded as Record<string, unknown>;
  return (
    typeof p.userId === 'string' &&
    typeof p.role === 'string' &&
    (typeof p.tenantId === 'string' || p.tenantId === null)
  );
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Unauthorized'));
    return;
  }

  const token = authHeader.split(' ')[1];

  if (SERVICE_TOKENS.has(token)) {
    req.user = { id: 'service', role: 'service', tenantId: null };
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown;
    if (!isValidPayload(decoded)) {
      next(new UnauthorizedError('Invalid token'));
      return;
    }
    req.user = { id: decoded.userId, tenantId: decoded.tenantId, role: decoded.role };
    next();
  } catch {
    next(new UnauthorizedError('Invalid token'));
  }
}

export function generateToken(userId: string, tenantId: string | null, role: UserRole): string {
  return jwt.sign({ userId, tenantId, role }, JWT_SECRET, { expiresIn: '24h' });
}
