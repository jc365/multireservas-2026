/**
 * @file Employee.test.ts
 * @module tests/unit/domain/entities
 */

import { describe, it, expect } from 'vitest';
import Employee from '../../../../backend/src/domain/entities/Employee';
import EmployeeName from '../../../../backend/src/domain/value-objects/EmployeeName';

function makeInput(overrides: Partial<Parameters<typeof Employee.create>[0]> = {}) {
  return {
    tenantId: 'tenant-demo',
    name: EmployeeName.create('Employee Demo'),
    ...overrides,
  };
}

describe('Employee entity — creación', () => {
  it('crea un empleado con id prefijado emp-', () => {
    const employee = Employee.create(makeInput());

    expect(employee.id.startsWith('emp-')).toBe(true);
    expect(employee.tenantId).toBe('tenant-demo');
    expect(employee.name.getValue()).toBe('Employee Demo');
    expect(employee.userId).toBeNull();
    expect(employee.email).toBeNull();
    expect(employee.phone).toBeNull();
    expect(employee.offersAllServices).toBe(true);
    expect(employee.serviceIds).toEqual([]);
    expect(employee.customSchedule).toBeNull();
    expect(employee.customHolidays).toBeNull();
    expect(employee.isActive).toBe(true);
    expect(employee.createdAt).toBeInstanceOf(Date);
    expect(employee.updatedAt).toBeInstanceOf(Date);
  });

  it('crea un empleado con todos los campos', () => {
    const employee = Employee.create(
      makeInput({
        userId: 'user-employee-1',
        email: 'emp@demo.com',
        phone: ' +34 600 000 001 ',
        offersAllServices: false,
        serviceIds: ['svc-1', 'svc-2'],
        customSchedule: { monday: '09:00-17:00' },
        customHolidays: { '2026-12-25': true },
        isActive: false,
      })
    );

    expect(employee.userId).toBe('user-employee-1');
    expect(employee.email).toBe('emp@demo.com');
    expect(employee.phone).toBe('+34 600 000 001');
    expect(employee.offersAllServices).toBe(false);
    expect(employee.serviceIds).toEqual(['svc-1', 'svc-2']);
    expect(employee.customSchedule).toEqual({ monday: '09:00-17:00' });
    expect(employee.customHolidays).toEqual({ '2026-12-25': true });
    expect(employee.isActive).toBe(false);
  });

  it('offersAllServices = true limpia la M2M aunque lleguen serviceIds', () => {
    const employee = Employee.create(
      makeInput({ offersAllServices: true, serviceIds: ['svc-1', 'svc-2'] })
    );

    expect(employee.offersAllServices).toBe(true);
    expect(employee.serviceIds).toEqual([]);
  });

  it('deduplica serviceIds', () => {
    const employee = Employee.create(
      makeInput({ offersAllServices: false, serviceIds: ['svc-1', ' svc-1 ', 'svc-2'] })
    );

    expect(employee.serviceIds).toEqual(['svc-1', 'svc-2']);
  });

  it('email inválido → error', () => {
    expect(() => Employee.create(makeInput({ email: 'no-es-email' }))).toThrow(
      'Employee email must be a valid email'
    );
  });

  it('email vacío → null', () => {
    expect(Employee.create(makeInput({ email: '   ' })).email).toBeNull();
  });

  it('phone demasiado largo → error', () => {
    expect(() => Employee.create(makeInput({ phone: 'x'.repeat(51) }))).toThrow(
      'Employee phone cannot exceed 50 characters'
    );
  });

  it('phone vacío → null', () => {
    expect(Employee.create(makeInput({ phone: '  ' })).phone).toBeNull();
  });

  it('customSchedule que no es objeto → error (JSON simple, F3.5 valida)', () => {
    expect(() => Employee.create(makeInput({ customSchedule: [1, 2] as never }))).toThrow(
      'Employee customSchedule must be a JSON object'
    );
    expect(() => Employee.create(makeInput({ customSchedule: 'lunes' as never }))).toThrow(
      'Employee customSchedule must be a JSON object'
    );
  });

  it('customHolidays array → error', () => {
    expect(() => Employee.create(makeInput({ customHolidays: [] as never }))).toThrow(
      'Employee customHolidays must be a JSON object'
    );
  });

  it('serviceIds con elementos no string → error', () => {
    expect(() =>
      Employee.create(makeInput({ offersAllServices: false, serviceIds: [42 as never] }))
    ).toThrow('Employee serviceIds must be an array of service ids');
  });
});

describe('Employee entity — withUpdates', () => {
  const base = () => Employee.create(
    makeInput({
      email: 'emp@demo.com',
      phone: '+34600000001',
      offersAllServices: false,
      serviceIds: ['svc-1', 'svc-2'],
      customSchedule: { monday: '09:00-17:00' },
    })
  );

  it('actualiza campos concretos y mantiene el resto', () => {
    const original = base();
    const updated = original.withUpdates({ name: EmployeeName.create('New Name'), phone: '+34600000002' });

    expect(updated.name.getValue()).toBe('New Name');
    expect(updated.phone).toBe('+34600000002');
    expect(updated.email).toBe('emp@demo.com');
    expect(updated.serviceIds).toEqual(['svc-1', 'svc-2']);
    expect(updated.customSchedule).toEqual({ monday: '09:00-17:00' });
    expect(updated.createdAt).toEqual(original.createdAt);
  });

  it('pasar a offersAllServices = true limpia la M2M (decisión F3.2)', () => {
    const updated = base().withUpdates({ offersAllServices: true });

    expect(updated.offersAllServices).toBe(true);
    expect(updated.serviceIds).toEqual([]);
  });

  it('pasar a offersAllServices = false con serviceIds nuevos los sustituye', () => {
    const all = Employee.create(makeInput({ offersAllServices: true }));
    const updated = all.withUpdates({ offersAllServices: false, serviceIds: ['svc-9'] });

    expect(updated.offersAllServices).toBe(false);
    expect(updated.serviceIds).toEqual(['svc-9']);
  });

  it('serviceIds sin offersAllServices en el update mantiene el flag', () => {
    const updated = base().withUpdates({ serviceIds: ['svc-3'] });

    expect(updated.offersAllServices).toBe(false);
    expect(updated.serviceIds).toEqual(['svc-3']);
  });

  it('email null limpia; email undefined no cambia', () => {
    const cleared = base().withUpdates({ email: null });
    expect(cleared.email).toBeNull();

    const kept = base().withUpdates({ phone: '+34600000003' });
    expect(kept.email).toBe('emp@demo.com');
  });

  it('customSchedule null limpia el JSON', () => {
    const updated = base().withUpdates({ customSchedule: null });
    expect(updated.customSchedule).toBeNull();
  });

  it('isActive false (soft delete a nivel entity)', () => {
    const updated = base().withUpdates({ isActive: false });
    expect(updated.isActive).toBe(false);
  });

  it('userId undefined mantiene; string lo cambia', () => {
    const linked = base().withUpdates({ userId: 'user-employee-1' });
    expect(linked.userId).toBe('user-employee-1');

    const unchanged = base().withUpdates({ phone: '+34600000004' });
    expect(unchanged.userId).toBeNull();

    const unlinked = linked.withUpdates({ userId: null });
    expect(unlinked.userId).toBeNull();
  });
});

describe('Employee entity — reconstitute', () => {
  it('reconstruye desde campos de BD', () => {
    const employee = Employee.reconstitute({
      id: 'emp-abc',
      tenantId: 'tenant-demo',
      userId: 'user-employee-1',
      name: EmployeeName.create('From DB'),
      email: 'db@demo.com',
      phone: null,
      offersAllServices: false,
      serviceIds: ['svc-1'],
      customSchedule: { tuesday: '10:00' },
      customHolidays: null,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    });

    expect(employee.id).toBe('emp-abc');
    expect(employee.name.getValue()).toBe('From DB');
    expect(employee.serviceIds).toEqual(['svc-1']);
    expect(employee.customSchedule).toEqual({ tuesday: '10:00' });
    expect(employee.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('serviceIds se copian (no se comparten referencias)', () => {
    const employee = Employee.reconstitute({
      id: 'emp-abc',
      tenantId: 'tenant-demo',
      userId: null,
      name: EmployeeName.create('From DB'),
      email: null,
      phone: null,
      offersAllServices: false,
      serviceIds: ['svc-1'],
      customSchedule: null,
      customHolidays: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    employee.serviceIds.push('svc-injected');
    expect(employee.serviceIds).toEqual(['svc-1']);
  });
});
