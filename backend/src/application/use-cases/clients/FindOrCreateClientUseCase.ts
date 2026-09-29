/**
 * @file FindOrCreateClientUseCase.ts
 * @module application/use-cases/clients
 *
 * Client interno (F3.3 #1-#5): sin CRUD expuesto; se busca por
 * `tenantId + phone` (principal) con fallback a `tenantId + email`, y
 * si no existe se crea. Cada reserva registra una visita
 * (visitCount/lastVisit) y recalcula `dataExpiresAt` según
 * `Tenant.settings.clientDataRetention` (nextDay | nextMonth | never).
 *
 * F3.3.1: `lastVisit` = fecha de la reserva **más futura** del
 * cliente (`visitAt` = startTimeUTC de la reserva que se crea); solo
 * avanza si la nueva reserva es posterior. Retención desconocida o
 * ausente → default `nextMonth` (nunca `null`, RGPD-safe).
 */

import Client from '../../../domain/entities/Client';
import IClientRepository from '../../interfaces/IClientRepository';
import ITenantRepository from '../../interfaces/ITenantRepository';
import { FindOrCreateClientInput } from '../../dtos';
import logger from '../../../infrastructure/logging/requestContext';

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Calcula dataExpiresAt a partir de lastVisit y la retención del
 * tenant. `never` → null; cualquier otro valor (incluido el
 * desconocido/ausente) → +1 mes (default `nextMonth`, F3.3.1).
 */
export function computeDataExpiresAt(retention: unknown, lastVisit: Date): Date | null {
  switch (retention) {
    case 'nextDay':
      return new Date(lastVisit.getTime() + 24 * 60 * 60 * 1000);
    case 'never':
      return null;
    case 'nextMonth':
    default: {
      const next = new Date(lastVisit);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
    }
  }
}

/**
 * Registra la visita de una reserva (F3.3.1): visitCount +1 siempre;
 * `lastVisit` solo avanza si `visitAt` es posterior al actual y, en
 * ese caso, `dataExpiresAt` se recalcula con la retención. Si es
 * anterior o igual, ambos quedan intactos (se re-envían los mismos
 * valores a registerVisit, que solo incrementa visitCount).
 */
function applyReservationVisit(client: Client, visitAt: Date, retention: unknown): Client {
  const isLater = client.lastVisit === null || visitAt.getTime() > client.lastVisit.getTime();
  if (isLater) {
    return client.registerVisit(visitAt, computeDataExpiresAt(retention, visitAt));
  }
  return client.registerVisit(client.lastVisit as Date, client.dataExpiresAt);
}

export default class FindOrCreateClientUseCase {
  constructor(
    private readonly clientRepository: IClientRepository,
    private readonly tenantRepository: ITenantRepository
  ) {}

  /**
   * @param visitAt fecha/hora de la reserva que se está creando
   * (startTimeUTC). Si no se pasa (uso directo del use case), se
   * registra la visita con `now`.
   */
  async execute(input: FindOrCreateClientInput, tenantId: string, visitAt?: Date): Promise<Client> {
    logger.info({ tenantId, phone: input.phone }, 'FindOrCreateClientUseCase: starting');

    const tenant = await this.tenantRepository.findById(tenantId);
    const settings = tenant?.settings;
    const isObject = settings !== null && typeof settings === 'object' && !Array.isArray(settings);
    const s = isObject ? (settings as Record<string, unknown>) : {};

    const requirePhone = s.requireClientPhone !== false; // default true
    const requireEmail = s.requireClientEmail === true; // default false
    const retention = s.clientDataRetention;

    const phone = normalizeOptional(input.phone);
    const email = normalizeOptional(input.email);

    if (!phone && requirePhone) {
      throw new Error('client phone is required');
    }
    if (!email && requireEmail) {
      throw new Error('client email is required');
    }

    const at = visitAt ?? new Date();

    // 1) Búsqueda principal: tenant + phone
    if (phone) {
      const byPhone = await this.clientRepository.findByTenantAndPhone(tenantId, phone);
      if (byPhone) {
        const updated = applyReservationVisit(byPhone, at, retention);
        await this.clientRepository.save(updated);
        logger.info({ clientId: updated.id }, 'FindOrCreateClientUseCase: reused by phone');
        return updated;
      }
    }

    // 2) Fallback: tenant + email
    if (email) {
      const byEmail = await this.clientRepository.findByTenantAndEmail(tenantId, email);
      if (byEmail) {
        const withPhone = phone && byEmail.phone !== phone ? byEmail.withPhone(phone) : byEmail;
        const updated = applyReservationVisit(withPhone, at, retention);
        await this.clientRepository.save(updated);
        logger.info({ clientId: updated.id }, 'FindOrCreateClientUseCase: reused by email');
        return updated;
      }
    }

    // 3) Crear
    const created = applyReservationVisit(
      Client.create({
        tenantId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: phone ?? '',
        email,
        notes: normalizeOptional(input.notes),
      }),
      at,
      retention
    );

    await this.clientRepository.save(created);
    logger.info({ clientId: created.id }, 'FindOrCreateClientUseCase: created');
    return created;
  }
}
