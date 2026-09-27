/**
 * @file roleConfig.ts
 * @module utils
 */

export type Role = 'owner' | 'employee' | 'admin' | 'client';

export type Permission = 'viewItems' | 'editItems' | 'adminPanel';

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

// Comportamiento idéntico al pre-SF3b: solo admin edita ítems y ve el panel
// admin. owner/employee ganarán permisos en F5/F6 (zona owner, agenda).
export const ROLE_PERMISSIONS: Record<Role, Record<Permission, boolean>> = {
  owner: { viewItems: true, editItems: false, adminPanel: false },
  employee: { viewItems: true, editItems: false, adminPanel: false },
  admin: { viewItems: true, editItems: true, adminPanel: true },
  client: { viewItems: true, editItems: false, adminPanel: false },
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
