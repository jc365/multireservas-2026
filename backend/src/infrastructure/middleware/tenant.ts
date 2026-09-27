/**
 * @file tenant.ts
 * @module infrastructure/middleware
 *
 * Middleware de zona tenant: exige un tenantId en el token (req.user)
 * e inyecta req.tenantId para las rutas de dominio.
 * Debe usarse después de authMiddleware. No aplica a rutas de
 * plataforma/superadmin (/admin/*, /config/*) ni a rutas de servicio
 * (/events/* — el token de servicio es de plataforma, tenantId null).
 */

import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';

export interface TenantRequest extends AuthRequest {
  tenantId?: string;
}

export function tenantScope(req: TenantRequest, res: Response, next: NextFunction): void {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }
  req.tenantId = tenantId;
  next();
}
