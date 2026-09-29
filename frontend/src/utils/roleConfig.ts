/**
 * @file roleConfig.ts
 * @module utils
 */

export type Role = 'owner' | 'employee' | 'admin' | 'client';

export type Permission =
  | 'viewServices'
  | 'editServices'
  | 'viewEmployees'
  | 'editEmployees'
  | 'viewReservations'
  | 'editReservations'
  | 'viewTenantConfig'
  | 'editTenantConfig'
  | 'adminPanel';

interface RoleBadgeConfig {
  label: string;
  icon: string;
  className: string;
}

export const ROLE_CONFIG: Record<string, RoleBadgeConfig> = {
  owner: {
    label: 'OWNER',
    icon: '\u{1F451}',
    className: 'bg-[var(--color-amber,#f59e0b)]/10 text-[var(--color-amber,#f59e0b)] border-[var(--color-amber,#f59e0b)]/30',
  },
  admin: {
    label: 'ADMIN',
    icon: '\u{1F6E1}\u{FE0F}',
    className: 'bg-[var(--color-red,#ef4444)]/10 text-[var(--color-red,#ef4444)] border-[var(--color-red,#ef4444)]/30',
  },
  employee: {
    label: 'EMPLOYEE',
    icon: '\u{1F4BC}',
    className: 'bg-[var(--color-blue,#3b82f6)]/10 text-[var(--color-blue,#3b82f6)] border-[var(--color-blue,#3b82f6)]/30',
  },
  client: {
    label: 'CLIENT',
    icon: '\u{1F464}',
    className: 'bg-surface-container text-on-surface-variant border-outline-variant/30',
  },
};

// F3.1: owner edita el catálogo de services (configura el tenant);
// employee solo lo ve (lo ofrece, no lo modifica); admin es plataforma
// y no accede a la zona tenant (tenantScope → 403); client no
// autentica en v1. Ver docu/FINDINGS.md, "F3 / F3.1".
// F3.2: mismo patrón para employees — owner view+edit, employee
// view solo de sí mismo (self-view en backend), admin/client sin acceso.
// F3.3: reservas — owner y employee view+edit (T/T #13), admin/client
// sin acceso (backend tenantScope → 403 para admin).
// F3.4: tenant config — solo owner edita (#13 editTenantConfig);
// employee lo lee (viewTenantConfig) porque CreateReservation como
// employee necesita GET /tenants/me para los flags #12. Backend:
// GET owner|employee, PUT solo owner, admin → tenantScope 403.
export const ROLE_PERMISSIONS: Record<Role, Record<Permission, boolean>> = {
  owner: {
    viewServices: true, editServices: true,
    viewEmployees: true, editEmployees: true,
    viewReservations: true, editReservations: true,
    viewTenantConfig: true, editTenantConfig: true,
    adminPanel: false,
  },
  employee: {
    viewServices: true, editServices: false,
    viewEmployees: true, editEmployees: false,
    viewReservations: true, editReservations: true,
    viewTenantConfig: true, editTenantConfig: false,
    adminPanel: false,
  },
  admin: {
    viewServices: false, editServices: false,
    viewEmployees: false, editEmployees: false,
    viewReservations: false, editReservations: false,
    viewTenantConfig: false, editTenantConfig: false,
    adminPanel: true,
  },
  client: {
    viewServices: false, editServices: false,
    viewEmployees: false, editEmployees: false,
    viewReservations: false, editReservations: false,
    viewTenantConfig: false, editTenantConfig: false,
    adminPanel: false,
  },
};

export function getRoleBadge(role: string): RoleBadgeConfig {
  return ROLE_CONFIG[role] || {
    label: role.toUpperCase(),
    icon: '\u{1F539}',
    className: 'bg-surface-container text-on-surface-variant border-outline-variant/30',
  };
}

export function can(role: string, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role as Role];
  return !!permissions && permissions[permission];
}
