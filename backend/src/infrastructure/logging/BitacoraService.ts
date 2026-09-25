/**
 * @file BitacoraService.ts
 * @module infrastructure/logging
 */

import IBitacoraRepository, { BitacoraEvent } from '../../application/interfaces/IBitacoraRepository';

/**
 * Service for logging business events to the bitacora.
 */
export default class BitacoraService {
  constructor(private readonly bitacoraRepository: IBitacoraRepository) {}

  /**
   * Logs a business event.
   * @param event - The event data to log.
   */
  async log(event: BitacoraEvent): Promise<void> {
    try {
      await this.bitacoraRepository.log(event);
    } catch {
      // Silently fail — bitacora should never block business operations
    }
  }
}
