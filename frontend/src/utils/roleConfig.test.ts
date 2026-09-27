/**
 * @file roleConfig.test.ts
 * @module utils
 */

import { describe, it, expect } from 'vitest';
import { ROLE_CONFIG, ROLE_PERMISSIONS, getRoleBadge, can } from './roleConfig';
import type { Role } from './roleConfig';

const MR_ROLES: Role[] = ['owner', 'employee', 'admin', 'client'];

describe('roleConfig', () => {
  describe('ROLE_CONFIG', () => {
    it('define badge para los 4 roles MR', () => {
      for (const role of MR_ROLES) {
        expect(ROLE_CONFIG[role]).toBeDefined();
        expect(ROLE_CONFIG[role].label).toBe(role.toUpperCase());
        expect(ROLE_CONFIG[role].icon).toBeTruthy();
        expect(ROLE_CONFIG[role].className).toBeTruthy();
      }
    });

    it('no define badges legacy (user, guest)', () => {
      expect(ROLE_CONFIG['user']).toBeUndefined();
      expect(ROLE_CONFIG['guest']).toBeUndefined();
    });
  });

  describe('getRoleBadge', () => {
    it('devuelve el badge del rol MR', () => {
      expect(getRoleBadge('owner').label).toBe('OWNER');
      expect(getRoleBadge('employee').label).toBe('EMPLOYEE');
      expect(getRoleBadge('admin').label).toBe('ADMIN');
      expect(getRoleBadge('client').label).toBe('CLIENT');
    });

    it('fallback para rol desconocido', () => {
      const badge = getRoleBadge('nope');
      expect(badge.label).toBe('NOPE');
      expect(badge.icon).toBe('\u{1F539}');
    });
  });

  describe('ROLE_PERMISSIONS / can', () => {
    it('solo admin tiene editItems y adminPanel', () => {
      expect(can('admin', 'editItems')).toBe(true);
      expect(can('admin', 'adminPanel')).toBe(true);

      for (const role of ['owner', 'employee', 'client']) {
        expect(can(role, 'editItems')).toBe(false);
        expect(can(role, 'adminPanel')).toBe(false);
      }
    });

    it('todos los roles MR ven ítems', () => {
      for (const role of MR_ROLES) {
        expect(can(role, 'viewItems')).toBe(true);
      }
    });

    it('rol desconocido → sin permisos', () => {
      expect(can('nope', 'viewItems')).toBe(false);
      expect(can('user', 'editItems')).toBe(false);
      expect(can('guest', 'adminPanel')).toBe(false);
    });

    it('cubre exactamente los 4 roles MR', () => {
      expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
        [...MR_ROLES].sort()
      );
    });
  });
});
