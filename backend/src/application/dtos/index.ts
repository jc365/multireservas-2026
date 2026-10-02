// application/dtos/index.ts

/**
 * @file DTOs para la capa de aplicación
 * @module application/dtos
 */

// ============================================
// DTOs para Auth
// ============================================
export interface LoginInput {
  email?: string;
  password?: string;
  xUserId?: string;
}

export interface LoginOutput {
  token: string;
  userId: string;
}

/**
 * POST /auth/register (F4.4a) — registro público de tenant con
 * owner. Filiação mínima: email, password, owner name, business
 * name. Devuelve JWT (auto-login) + user info.
 */
export interface RegisterInput {
  email: string;
  password: string;
  ownerName: string;
  businessName: string;
}

export interface RegisterOutput {
  token: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

/** POST /tenants/verify-email (F4.4a). */
export interface VerifyEmailInput {
  token: string;
}

/** POST /auth/resend-verification (F4.4a): no-op si ya verificado. */
export interface ResendVerificationOutput {
  sent: boolean;
}

// ============================================
// DTOs para la entidad User
// ============================================
export interface CreateUserInput {
  id?: string;
  name: string;
  email: string;
  password: string;
}

// ============================================
// DTOs para la entidad Service
// ============================================
export interface CreateServiceInput {
  name: string;
  description?: string;
  duration: number;
  price?: number | null;
  category?: string | null;
}

export interface UpdateServiceInput {
  name?: string;
  description?: string | null;
  duration?: number;
  price?: number | null;
  category?: string | null;
  isActive?: boolean;
}

// ============================================
// DTOs para la entidad Employee
// ============================================
export interface CreateEmployeeInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  offersAllServices?: boolean;
  serviceIds?: string[];
  customSchedule?: Record<string, unknown> | null;
  customHolidays?: Record<string, unknown> | null;
  userId?: string | null;
}

export interface UpdateEmployeeInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  offersAllServices?: boolean;
  serviceIds?: string[];
  customSchedule?: Record<string, unknown> | null;
  customHolidays?: Record<string, unknown> | null;
  userId?: string | null;
  isActive?: boolean;
}

// ============================================
// DTOs para Client + Reservation (F3.3)
// ============================================
export interface FindOrCreateClientInput {
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface CreateReservationInput {
  /**
   * Opcional desde F4.4c ("sin preferencia"): si ausente o en blanco,
   * el backend asigna un empleado activo libre en el slot solicitado.
   */
  employeeId?: string;
  /**
   * Ruta clásica (F3.3): UN servicio → reserva simple sin grupo.
   * Opcional desde F4.5b: si llega `serviceIds` no hace falta.
   */
  serviceId?: string;
  /**
   * F4.5b (multi-servicio seguido): lista de servicios en el orden
   * deseado (repeticiones permitidas, es solo una lista de tramos).
   * - longitud 1 → reserva simple **sin** `groupBookingId`
   * - longitud >1 → N filas encadenadas con el mismo `groupBookingId`
   *
   * Exclusivo con `serviceId` cuando está presente (gana `serviceIds`).
   */
  serviceIds?: string[];
  /** Día calendario YYYY-MM-DD (día local elegido; tz completo en F4) */
  date: string;
  /** Instante ISO de inicio */
  startTimeUTC: string;
  /** Opcional: debe coincidir con Service.duration (o la suma, en grupo) */
  duration?: number;
  notes?: string | null;
  status?: 'pending' | 'confirmed';
  timezone?: string;
  /** Opción A: cliente existente */
  clientId?: string;
  /** Opción B: datos para crear/reutilizar el cliente interno */
  client?: FindOrCreateClientInput;
}

export interface UpdateReservationInput {
  notes?: string | null;
  status?: string;
}

// ============================================
// DTOs para Availability (F4.1a)
// ============================================
/**
 * Query de GET /availability. Todos los campos llegan como string
 * desde `req.query` (o number en tests); el parseo y la validación
 * (400) ocurren en GetAvailabilityUseCase.
 *
 * `employeeId` es opcional desde F4.4c ("sin preferencia"): si no
 * viene, cada slot de la respuesta trae el `employeeId` del empleado
 * activo al que se le asigna ese hueco.
 *
 * `serviceIds` (F4.5a, multi-servicio seguido): lista `svc1,svc2` en
 * el orden deseado. **Exclusivo con `duration`** — el backend
 * valida que todos pertenezcan al tenant y calcula la duración total
 * (suma de los tramos).
 */
export interface GetAvailabilityInput {
  employeeId?: string;
  duration?: string | number;
  serviceIds?: string;
  from?: string;
  to?: string;
  limit?: string | number;
}

// ============================================
// DTOs para Tenant config (F3.4)
// ============================================
/**
 * Payload completo de PUT /tenants/me (F3.4 #10): todo junto, un
 * solo guardado. `settings`/`schedules`/`holidays` llegan como JSON
 * crudo desde el cliente; la validación estricta ocurre en el dominio
 * (TenantSettings/ScheduleBlock/Holiday + Tenant.withConfig).
 * Los campos con `undefined` en runtime los rechaza el use case
 * (no hay guardas de presentación: el body es `unknown`).
 */
export interface UpdateTenantConfigInput {
  name: string;
  currency: string;
  timezone: string;
  settings: unknown;
  schedules: unknown;
  holidays: unknown;
}

/**
 * POST /admin/tenants (F4.0 superficie A). Solo tenant — NO crea
 * owner (decisión F4.0 en FINDINGS). Todo lo que llega como
 * `undefined` lo resuelve el use case con los defaults del dominio.
 */
export interface CreateTenantInput {
  name: string;
  slug?: string;
  currency?: string;
  timezone?: string;
  settings?: unknown;
  schedules?: unknown;
  holidays?: unknown;
}

// ============================================
// DTOs para Config
// ============================================
export interface UpsertConfigInput {
  key: string;
  value: unknown;
  description?: string;
  category?: string;
  updatedBy?: string;
}
