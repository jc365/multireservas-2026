/**
 * @file BitacoraService.ts
 * @module infrastructure/logging
 */

import IBitacoraRepository, { BitacoraEvent } from '../../application/interfaces/IBitacoraRepository';
import { getImpersonationTenantId } from './requestContext';

/**
 * Service for logging business events to the bitacora.
 */
export default class BitacoraService {
  constructor(private readonly bitacoraRepository: IBitacoraRepository) {}

  /**
   * Logs a business event.
   *
   * F4.0: si este request es de un admin impersonando un tenant
   * (header `X-Tenant-Id`, almacenado en el ALS), el evento se
   * enriquece con `tenantId` (si venía vacío) y
   * `metadata['admin-as-owner']`. Un `tenantId` explícito del
   * use case siempre tiene prioridad.
   *
   * @param event - The event data to log.
   */
  async log(event: BitacoraEvent): Promise<void> {
    try {
      const impersonated = getImpersonationTenantId();
      const enriched: BitacoraEvent = impersonated
        ? {
            ...event,
            tenantId: event.tenantId ?? impersonated,
            metadata: { ...(event.metadata ?? {}), 'admin-as-owner': impersonated },
          }
        : event;
      await this.bitacoraRepository.log(enriched);
    } catch {
      // Silently fail — bitacora should never block business operations
    }
  }
}
