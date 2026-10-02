/**
 * @file tenant.ts
 * @module infrastructure/middleware
 *
 * Middleware de zona tenant: inyecta `req.tenantId` para las rutas de
 * dominio. Debe usarse después de authMiddleware. No aplica a rutas de
 * plataforma/superadmin (/admin/*, /config/*) ni a rutas de servicio
 * (/events/* — el token de servicio es de plataforma, tenantId null).
 *
 * F4.0 (superficie B): un admin puede operar como owner de un tenant
 * concreto enviando el header `X-Tenant-Id: <tenantId>`:
 * - admin + header  → req.tenantId = header, req.isImpersonating = true
 *                    (y se marca el ALS para que BitacoraService añada
 *                    `metadata['admin-as-owner']`).
 * - admin sin header → 403 (sigue siendo zona tenant, no hay scope).
 * - header que no apunta a un tenant existente → 404.
 * - owner/employee  → su tenant del token (el header se ignora).
 */

import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';
import { setImpersonationTenantId } from '../logging/requestContext';
import prisma from '../persistence/prismaClient';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../errors';
import { TENANT_NOT_FOUND } from '../errors/mr-codes';

export interface TenantRequest extends AuthRequest {
  tenantId?: string;
  /** true cuando un admin opera con `X-Tenant-Id` (F4.0). */
  isImpersonating?: boolean;
}

export async function tenantScope(
  req: TenantRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user;
  if (!user) {
    next(new UnauthorizedError('Unauthorized'));
    return;
  }

  if (user.role === 'admin') {
    const raw = req.headers['x-tenant-id'];
    const headerTenant = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!headerTenant) {
      next(new ForbiddenError('Tenant scope required'));
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: headerTenant },
      select: { id: true },
    });
    if (!tenant) {
      next(new NotFoundError('Tenant not found', TENANT_NOT_FOUND));
      return;
    }

    req.tenantId = tenant.id;
    req.isImpersonating = true;
    setImpersonationTenantId(tenant.id);
    next();
    return;
  }

  if (!user.tenantId) {
    next(new ForbiddenError('Tenant scope required'));
    return;
  }
  req.tenantId = user.tenantId;
  next();
}
