/**
 * @file ITenantRepository.ts
 * @module application/interfaces
 */

/**
 * Minimal tenant record needed by application services
 * (F3.1 solo necesita settings; F3.3 añade timezone; F3.4 añade el
 * registro completo para GET/PUT /tenants/me).
 *
 * `settings` es el JSON crudo de la fila: los consumidores
 * existentes (FindOrCreateClient, CreateReservation, BookingSettings)
 * leen keys puntuales, por lo que NO se sustituye por el VO
 * TenantSettings — el saneado vive en el dominio (F3.4).
 */
export interface TenantSettingsRecord {
  id: string;
  settings: unknown;
  timezone?: string;
}

/**
 * Fila completa de Tenant para GET/PUT /tenants/me (F3.4 #9).
 * Incluye schedules/holidays como JSON crudo (el VO los re-valida).
 */
export interface TenantFullRecord {
  id: string;
  name: string;
  slug: string | null;
  currency: string;
  timezone: string;
  settings: unknown;
  schedules: unknown;
  holidays: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for the repository operations related to tenants.
 */
export default interface ITenantRepository {
  /**
   * Finds a tenant by its unique identifier (settings only).
   */
  findById(id: string): Promise<TenantSettingsRecord | null>;

  /**
   * Finds a tenant with the full config payload (F3.4).
   */
  findByIdFull(id: string): Promise<TenantFullRecord | null>;

  /**
   * Saves name/currency/timezone/settings/schedules/holidays in one
   * write (F3.4 #10). Returns the row as persisted (updatedAt fresh).
   */
  saveConfig(
    id: string,
    config: {
      name: string;
      currency: string;
      timezone: string;
      settings: unknown;
      schedules: unknown;
      holidays: unknown;
    }
  ): Promise<TenantFullRecord>;
}
