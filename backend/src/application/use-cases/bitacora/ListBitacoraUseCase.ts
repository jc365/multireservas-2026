/**
 * @file ListBitacoraUseCase.ts
 * @module application/use-cases/bitacora
 */

import type IBitacoraRepository from '../../interfaces/IBitacoraRepository';
import type { BitacoraQueryOptions, BitacoraPaginatedResult } from '../../interfaces/IBitacoraRepository';
import logger from '../../../infrastructure/logging/requestContext';

export default class ListBitacoraUseCase {
  constructor(private readonly bitacoraRepository: IBitacoraRepository) {}

  async execute(options: BitacoraQueryOptions): Promise<BitacoraPaginatedResult> {
    logger.info({ options }, 'ListBitacoraUseCase: starting');
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const result = await this.bitacoraRepository.findAll({ ...options, page, limit });
    logger.info({ total: result.total, count: result.data.length }, 'ListBitacoraUseCase: completed');
    return result;
  }
}
