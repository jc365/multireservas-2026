/**
 * @file IBitacoraRepository.ts
 * @module application/interfaces
 */

import Bitacora from '../../domain/entities/Bitacora';

/**
 * Input for logging a bitacora event.
 */
export interface BitacoraEvent {
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Options for paginated bitacora queries.
 */
export interface BitacoraQueryOptions {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  actions?: string[];
  entityType?: string;
  since?: string;
  until?: string;
}

/**
 * Paginated result of bitacora events.
 */
export interface BitacoraPaginatedResult {
  data: Bitacora[];
  total: number;
}

/**
 * Interface for the repository operations related to bitacora.
 */
export default interface IBitacoraRepository {
  /**
   * Logs a business event to the bitacora.
   */
  log(event: BitacoraEvent): Promise<void>;

  /**
   * Returns paginated bitacora events with optional filters.
   */
  findAll(options: BitacoraQueryOptions): Promise<BitacoraPaginatedResult>;
}
