/**
 * @file Client.test.ts
 * @module tests/unit/domain/entities
 */

import { describe, it, expect } from 'vitest';
import Client from '../../../../backend/src/domain/entities/Client';

function makeInput(overrides: Partial<Parameters<typeof Client.create>[0]> = {}) {
  return {
    tenantId: 'tenant-demo',
    firstName: 'Laura',
    lastName: 'Gómez',
    phone: '+34600111222',
    ...overrides,
  };
}

describe('Client entity — creación', () => {
  it('crea un cliente con id prefijado cli-', () => {
    const client = Client.create(makeInput());

    expect(client.id.startsWith('cli-')).toBe(true);
    expect(client.tenantId).toBe('tenant-demo');
    expect(client.firstName).toBe('Laura');
    expect(client.lastName).toBe('Gómez');
    expect(client.phone).toBe('+34600111222');
    expect(client.email).toBeNull();
    expect(client.notes).toBeNull();
    expect(client.userId).toBeNull();
    expect(client.dataExpiresAt).toBeNull();
    expect(client.visitCount).toBe(0);
    expect(client.lastVisit).toBeNull();
    expect(client.createdAt).toBeInstanceOf(Date);
    expect(client.updatedAt).toBeInstanceOf(Date);
  });

  it('crea con todos los campos', () => {
    const expires = new Date('2026-12-31T00:00:00.000Z');
    const client = Client.create(
      makeInput({
        email: 'laura@example.com',
        notes: 'Prefiere cita por la tarde',
        userId: 'user-client-1',
        dataExpiresAt: expires,
      })
    );

    expect(client.email).toBe('laura@example.com');
    expect(client.notes).toBe('Prefiere cita por la tarde');
    expect(client.userId).toBe('user-client-1');
    expect(client.dataExpiresAt).toEqual(expires);
  });

  it('firstName requerido → error', () => {
    expect(() => Client.create(makeInput({ firstName: '  ' }))).toThrow('Client firstName is required');
  });

  it('lastName requerido → error', () => {
    expect(() => Client.create(makeInput({ lastName: '' }))).toThrow('Client lastName is required');
  });

  it('firstName demasiado largo (>100) → error', () => {
    expect(() => Client.create(makeInput({ firstName: 'x'.repeat(101) }))).toThrow(
      'Client firstName cannot exceed 100 characters'
    );
  });

  it('email inválido → error', () => {
    expect(() => Client.create(makeInput({ email: 'no-es-email' }))).toThrow(
      'Client email must be a valid email'
    );
  });

  it('email vacío → null', () => {
    const client = Client.create(makeInput({ email: '   ' }));
    expect(client.email).toBeNull();
  });

  it('phone > 50 chars → error', () => {
    expect(() => Client.create(makeInput({ phone: 'p'.repeat(51) }))).toThrow(
      'Client phone cannot exceed 50 characters'
    );
  });

  it('notes > 1000 → error', () => {
    expect(() => Client.create(makeInput({ notes: 'n'.repeat(1001) }))).toThrow(
      'Client notes cannot exceed 1000 characters'
    );
  });

  it('normaliza nombres y notas (trim)', () => {
    const client = Client.create(makeInput({ firstName: '  Laura  ', notes: '  hola  ' }));
    expect(client.firstName).toBe('Laura');
    expect(client.notes).toBe('hola');
  });

  it('nota vacía → null', () => {
    expect(Client.create(makeInput({ notes: '   ' })).notes).toBeNull();
  });
});

describe('Client entity — registerVisit (F3.3 #5)', () => {
  it('incrementa visitCount, fija lastVisit y recalcula dataExpiresAt', () => {
    const client = Client.create(makeInput());
    const visitDate = new Date('2026-10-01T12:00:00.000Z');
    const expires = new Date('2026-11-01T12:00:00.000Z');

    const visited = client.registerVisit(visitDate, expires);

    expect(visited.visitCount).toBe(1);
    expect(visited.lastVisit).toEqual(visitDate);
    expect(visited.dataExpiresAt).toEqual(expires);
    expect(visited.id).toBe(client.id);
    // no muta la instancia original (inmutable)
    expect(client.visitCount).toBe(0);
    expect(client.lastVisit).toBeNull();
  });

  it('segunda visita → visitCount 2', () => {
    const first = Client.create(makeInput()).registerVisit(new Date(), null);
    const second = first.registerVisit(new Date(), null);
    expect(second.visitCount).toBe(2);
  });

  it('retención never → dataExpiresAt null', () => {
    const visited = Client.create(makeInput()).registerVisit(new Date(), null);
    expect(visited.dataExpiresAt).toBeNull();
  });
});

describe('Client entity — withPhone (fallback por email)', () => {
  it('sustituye el teléfono sin tocar el resto', () => {
    const client = Client.create(makeInput());
    const updated = client.withPhone('+34600999888');

    expect(updated.phone).toBe('+34600999888');
    expect(updated.id).toBe(client.id);
    expect(updated.firstName).toBe('Laura');
    expect(client.phone).toBe('+34600111222');
  });

  it('phone > 50 → error', () => {
    expect(() => Client.create(makeInput()).withPhone('p'.repeat(51))).toThrow(
      'Client phone cannot exceed 50 characters'
    );
  });
});

describe('Client entity — reconstitute', () => {
  it('recupera todos los campos desde la persistencia', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const client = Client.reconstitute({
      id: 'cli-abc',
      tenantId: 'tenant-demo',
      userId: null,
      firstName: 'Laura',
      lastName: 'Gómez',
      email: 'laura@example.com',
      phone: '+34600111222',
      notes: 'vip',
      dataExpiresAt: now,
      visitCount: 3,
      lastVisit: now,
      createdAt: now,
      updatedAt: now,
    });

    expect(client.id).toBe('cli-abc');
    expect(client.visitCount).toBe(3);
    expect(client.lastVisit).toEqual(now);
    expect(client.dataExpiresAt).toEqual(now);
    expect(client.notes).toBe('vip');
  });

  it('reconstitute con firstName vacío → error', () => {
    expect(() =>
      Client.reconstitute({
        id: 'cli-abc',
        tenantId: 'tenant-demo',
        userId: null,
        firstName: ' ',
        lastName: 'Gómez',
        email: null,
        phone: '',
        notes: null,
        dataExpiresAt: null,
        visitCount: 0,
        lastVisit: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).toThrow('Client firstName is required');
  });
});
