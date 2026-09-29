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
  employeeId: string;
  serviceId: string;
  /** Día calendario YYYY-MM-DD (día local elegido; tz completo en F4) */
  date: string;
  /** Instante ISO de inicio */
  startTimeUTC: string;
  /** Opcional: debe coincidir con Service.duration */
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
