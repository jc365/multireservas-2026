interface RoleBadgeConfig {
  label: string;
  icon: string;
  className: string;
}

export const ROLE_CONFIG: Record<string, RoleBadgeConfig> = {
  admin: {
    label: 'ADMIN',
    icon: '\u{1F451}',
    className: 'bg-[var(--color-red,#ef4444)]/10 text-[var(--color-red,#ef4444)] border-[var(--color-red,#ef4444)]/30',
  },
  user: {
    label: 'USER',
    icon: '\u{1F464}',
    className: 'bg-[var(--color-blue,#3b82f6)]/10 text-[var(--color-blue,#3b82f6)] border-[var(--color-blue,#3b82f6)]/30',
  },
  guest: {
    label: 'GUEST',
    icon: '\u{1F441}\u{FE0F}',
    className: 'bg-surface-container text-on-surface-variant border-outline-variant/30',
  },
};

export function getRoleBadge(role: string): RoleBadgeConfig {
  return ROLE_CONFIG[role] || {
    label: role.toUpperCase(),
    icon: '\u{1F539}',
    className: 'bg-surface-container text-on-surface-variant border-outline-variant/30',
  };
}
