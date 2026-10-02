/**
 * @file admin.ts
 * @module infrastructure/middleware
 *
 * Middleware that verifies the authenticated user has the 'admin' role.
 * Must be used after authMiddleware (req.user.id must be set).
 */

import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';
import PrismaUserRepository from '../persistence/PrismaUserRepository';
import { ForbiddenError, UnauthorizedError } from '../errors';

const userRepository = new PrismaUserRepository();

export async function adminMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user?.id) {
    next(new UnauthorizedError('Unauthorized'));
    return;
  }

  const user = await userRepository.findById(req.user.id);
  if (!user || user.role !== 'admin') {
    next(new ForbiddenError('Forbidden — admin role required'));
    return;
  }

  next();
}
