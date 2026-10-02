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
 * Fila resumida para GET /admin/tenants (F4.0 superficie A).
 * Sin settings/schedules/holidays — van en el detalle.
 */
export interface TenantSummaryRecord {
  id: string;
  name: string;
  slug: string | null;
  currency: string;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Payload de creación de tenant (F4.0, POST /admin/tenants).
 * Solo tenant — NO crea owner (decisión F4.0 documentada en FINDINGS).
 */
export interface CreateTenantRecord {
  id: string;
  name: string;
  slug: string | null;
  currency: string;
  timezone: string;
  settings: unknown;
  schedules: unknown;
  holidays: unknown;
}

/**
 * Owner a crear junto al tenant en la misma transacción (F4.4a,
 * registro público). La password llega YA hasheada.
 */
export interface RegisterOwnerRecord {
  id: string;
  name: string;
  email: string;
  password: string;
}

/** Registro público (F4.4a): tenant + owner atómicos. */
export interface CreateTenantWithOwnerInput {
  tenant: CreateTenantRecord;
  owner: RegisterOwnerRecord;
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
   * Resumen de todos los tenants para la lista admin (F4.0).
   */
  findAllSummaries(): Promise<TenantSummaryRecord[]>;

  /**
   * Busca por slug (unicidad al crear un tenant, F4.0).
   */
  findBySlug(slug: string): Promise<TenantSummaryRecord | null>;

  /**
   * Crea un tenant nuevo con isActive=true (F4.0). Devuelve la fila
   * completa persistida.
   */
  create(record: CreateTenantRecord): Promise<TenantFullRecord>;

  /**
   * Crea tenant + owner en una ÚNICA transacción (F4.4a, registro
   * público). Falla entero si cualquiera de los dos insertos falla
   * (unicidad de email/slug incluida — el use-case mapea P2002).
   */
  createWithOwner(
    input: CreateTenantWithOwnerInput
  ): Promise<{ tenant: TenantFullRecord; userId: string }>;

  /**
   * Activa/desactiva (soft delete) un tenant (F4.0).
   */
  updateActive(id: string, isActive: boolean): Promise<TenantFullRecord>;

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
