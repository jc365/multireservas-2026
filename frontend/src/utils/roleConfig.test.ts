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
    it('solo owner edita services; employee solo ve', () => {
      expect(can('owner', 'editServices')).toBe(true);
      expect(can('owner', 'viewServices')).toBe(true);
      expect(can('employee', 'editServices')).toBe(false);
      expect(can('employee', 'viewServices')).toBe(true);
    });

    it('admin (plataforma) y client no acceden a services', () => {
      for (const role of ['admin', 'client']) {
        expect(can(role, 'viewServices')).toBe(false);
        expect(can(role, 'editServices')).toBe(false);
      }
    });

    it('F3.2: owner view+edit employees; employee solo view; admin/client sin acceso', () => {
      expect(can('owner', 'viewEmployees')).toBe(true);
      expect(can('owner', 'editEmployees')).toBe(true);
      expect(can('employee', 'viewEmployees')).toBe(true);
      expect(can('employee', 'editEmployees')).toBe(false);
      expect(can('admin', 'viewEmployees')).toBe(false);
      expect(can('admin', 'editEmployees')).toBe(false);
      expect(can('client', 'viewEmployees')).toBe(false);
      expect(can('client', 'editEmployees')).toBe(false);
    });

    it('F3.3: owner y employee view+edit reservas; admin/client sin acceso (DoD #13)', () => {
      expect(can('owner', 'viewReservations')).toBe(true);
      expect(can('owner', 'editReservations')).toBe(true);
      expect(can('employee', 'viewReservations')).toBe(true);
      expect(can('employee', 'editReservations')).toBe(true);
      expect(can('admin', 'viewReservations')).toBe(false);
      expect(can('admin', 'editReservations')).toBe(false);
      expect(can('client', 'viewReservations')).toBe(false);
      expect(can('client', 'editReservations')).toBe(false);
    });

    it('F3.4: solo owner edita tenant config; employee view; admin/client sin acceso', () => {
      expect(can('owner', 'viewTenantConfig')).toBe(true);
      expect(can('owner', 'editTenantConfig')).toBe(true);
      expect(can('employee', 'viewTenantConfig')).toBe(true);
      expect(can('employee', 'editTenantConfig')).toBe(false);
      expect(can('admin', 'viewTenantConfig')).toBe(false);
      expect(can('admin', 'editTenantConfig')).toBe(false);
      expect(can('client', 'viewTenantConfig')).toBe(false);
      expect(can('client', 'editTenantConfig')).toBe(false);
    });

    it('solo admin tiene adminPanel', () => {
      expect(can('admin', 'adminPanel')).toBe(true);
      for (const role of ['owner', 'employee', 'client']) {
        expect(can(role, 'adminPanel')).toBe(false);
      }
    });

    it('rol desconocido → sin permisos', () => {
      expect(can('nope', 'viewServices')).toBe(false);
      expect(can('user', 'editServices')).toBe(false);
      expect(can('guest', 'adminPanel')).toBe(false);
    });

    it('cubre exactamente los 4 roles MR', () => {
      expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
        [...MR_ROLES].sort()
      );
    });
  });
});
