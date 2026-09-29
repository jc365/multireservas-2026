/**
 * @file Reservation.test.ts
 * @module tests/unit/domain/entities
 */

import { describe, it, expect } from 'vitest';
import Reservation, {
  buildActiveKey,
  isActiveStatus,
} from '../../../../backend/src/domain/entities/Reservation';

function makeInput(overrides: Partial<Parameters<typeof Reservation.create>[0]> = {}) {
  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  start.setUTCHours(10, 0, 0, 0);
  return {
    tenantId: 'tenant-demo',
    clientId: 'cli-1',
    employeeId: 'emp-1',
    serviceId: 'svc-1',
    date: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())),
    startTimeUTC: start,
    duration: 30,
    timezone: 'UTC',
    ...overrides,
  };
}

function futureStart(hour = 10, daysAhead = 7): Date {
  const start = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  start.setUTCHours(hour, 0, 0, 0);
  return start;
}

describe('Reservation entity — creación (F3.3 #6-#8)', () => {
  it('crea una reserva con id prefijado res-, status confirmed y cancelToken', () => {
    const reservation = Reservation.create(makeInput());

    expect(reservation.id.startsWith('res-')).toBe(true);
    expect(reservation.tenantId).toBe('tenant-demo');
    expect(reservation.status).toBe('confirmed'); // F0 #12: inicial confirmed
    expect(reservation.isActive).toBe(true);
    expect(reservation.cancelToken).toBeTruthy();
    expect(reservation.cancelToken).toHaveLength(21); // nanoid(21)
    expect(reservation.createdAt).toBeInstanceOf(Date);
    expect(reservation.updatedAt).toBeInstanceOf(Date);
  });

  it('cancelTokens distintos entre reservas (unicidad)', () => {
    const a = Reservation.create(makeInput());
    const b = Reservation.create(makeInput());
    expect(a.cancelToken).not.toBe(b.cancelToken);
  });

  it('deriva endTimeUTC = startTime + duration minutos', () => {
    const start = futureStart(10);
    const reservation = Reservation.create(makeInput({ startTimeUTC: start, duration: 45 }));

    expect(reservation.endTimeUTC.getTime()).toBe(start.getTime() + 45 * 60_000);
    expect(reservation.duration).toBe(45);
  });

  it('normaliza date a medianoche UTC', () => {
    const start = futureStart(10);
    const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const reservation = Reservation.create(makeInput({ startTimeUTC: start, date: day }));

    expect(reservation.date.getTime()).toBe(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    expect(reservation.date.toISOString()).toBe(day.toISOString());
  });

  it('construye activeKey "{employeeId}-{YYYY-MM-DD}-{HH:MM}" en UTC', () => {
    const start = futureStart(10);
    const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const reservation = Reservation.create(makeInput({ startTimeUTC: start, date: day }));

    const expected = `emp-1-${day.toISOString().slice(0, 10)}-10:00`;
    expect(reservation.activeKey).toBe(expected);
    expect(buildActiveKey('emp-1', day, start)).toBe(expected);
  });

  it('buildActiveKey es estable aunque employeeId lleve guiones', () => {
    const start = futureStart(9, 3);
    const day = new Date(Date.UTC(2026, 9, 5));
    expect(buildActiveKey('emp-demo-1', day, start)).toBe('emp-demo-1-2026-10-05-09:00');
  });

  it('status pendiente explícito → pending y activa', () => {
    const reservation = Reservation.create(makeInput({ status: 'pending' }));
    expect(reservation.status).toBe('pending');
    expect(reservation.activeKey).toBeTruthy();
  });

  it('date inválida → error', () => {
    expect(() => Reservation.create(makeInput({ date: new Date('nope') }))).toThrow(
      'Reservation date must be a valid date'
    );
  });

  it('startTimeUTC inválido → error', () => {
    expect(() => Reservation.create(makeInput({ startTimeUTC: new Date('nope') }))).toThrow(
      'Reservation startTimeUTC must be a valid date'
    );
  });

  it('duration no entera o <= 0 → error', () => {
    expect(() => Reservation.create(makeInput({ duration: 0 }))).toThrow(
      'Reservation duration must be a positive integer of minutes'
    );
    expect(() => Reservation.create(makeInput({ duration: 15.5 }))).toThrow(
      'Reservation duration must be a positive integer of minutes'
    );
  });

  it('duration negativa → error (start < end garantizado por duration > 0)', () => {
    expect(() => Reservation.create(makeInput({ duration: -30 }))).toThrow(
      'Reservation duration must be a positive integer of minutes'
    );
  });

  it('timezone vacía → error', () => {
    expect(() => Reservation.create(makeInput({ timezone: '  ' }))).toThrow(
      'Reservation timezone is required'
    );
  });

  it('status inválido → error', () => {
    expect(() =>
      Reservation.create(makeInput({ status: 'archived' as Reservation['status'] }))
    ).toThrow('Reservation status must be pending, confirmed, cancelled, completed or no_show');
  });

  it('notes > 2000 → error', () => {
    expect(() => Reservation.create(makeInput({ notes: 'n'.repeat(2001) }))).toThrow(
      'Reservation notes cannot exceed 2000 characters'
    );
  });

  it('acepta groupBookingId (deuda F4)', () => {
    const reservation = Reservation.create(makeInput({ groupBookingId: 'grp-1' }));
    expect(reservation.groupBookingId).toBe('grp-1');
  });
});

describe('Reservation entity — withStatus (F3.3 #8)', () => {
  it('activo → cancelled limpia el activeKey', () => {
    const reservation = Reservation.create(makeInput());
    const cancelled = reservation.withStatus('cancelled');

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.activeKey).toBeNull();
    expect(cancelled.isActive).toBe(false);
    expect(reservation.activeKey).toBeTruthy(); // inmutable
  });

  it('cancelled → confirmed regenera el activeKey', () => {
    const reservation = Reservation.create(makeInput()).withStatus('cancelled');
    const reactivated = reservation.withStatus('confirmed');

    expect(reactivated.isActive).toBe(true);
    expect(reactivated.activeKey).toBe(
      `emp-1-${reactivated.date.toISOString().slice(0, 10)}-${reactivated.startTimeUTC
        .toISOString()
        .slice(11, 16)}`
    );
  });

  it('completed y no_show también son terminales (activeKey null)', () => {
    const base = Reservation.create(makeInput());
    expect(base.withStatus('completed').activeKey).toBeNull();
    expect(base.withStatus('no_show').activeKey).toBeNull();
    expect(isActiveStatus('completed')).toBe(false);
    expect(isActiveStatus('no_show')).toBe(false);
  });

  it('status inválido → error', () => {
    const base = Reservation.create(makeInput());
    expect(() => base.withStatus('nope' as Reservation['status'])).toThrow(
      'Reservation status must be pending, confirmed, cancelled, completed or no_show'
    );
  });
});

describe('Reservation entity — withNotes', () => {
  it('actualiza notes y updatedAt', () => {
    const reservation = Reservation.create(makeInput());
    const updated = reservation.withNotes('llega tarde');
    expect(updated.notes).toBe('llega tarde');
    expect(updated.id).toBe(reservation.id);
  });

  it('notes vacías → null', () => {
    const reservation = Reservation.create(makeInput({ notes: 'x' }));
    expect(reservation.withNotes('   ').notes).toBeNull();
  });
});

describe('Reservation entity — reconstitute', () => {
  it('recupera todos los campos desde la persistencia', () => {
    const start = futureStart(10);
    const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const now = new Date();
    const reservation = Reservation.reconstitute({
      id: 'res-abc',
      tenantId: 'tenant-demo',
      clientId: 'cli-1',
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      date: day,
      startTimeUTC: start,
      endTimeUTC: new Date(start.getTime() + 30 * 60_000),
      timezone: 'Europe/Madrid',
      duration: 30,
      status: 'confirmed',
      notes: 'nota',
      groupBookingId: null,
      activeKey: `emp-1-${day.toISOString().slice(0, 10)}-10:00`,
      cancelToken: 'token-de-prueba-0001',
      createdAt: now,
      updatedAt: now,
    });

    expect(reservation.id).toBe('res-abc');
    expect(reservation.timezone).toBe('Europe/Madrid');
    expect(reservation.cancelToken).toBe('token-de-prueba-0001');
    expect(reservation.activeKey).toContain('emp-1-');
    expect(reservation.notes).toBe('nota');
  });

  it('reconstitute con status inválido → error', () => {
    const start = futureStart(10);
    const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    expect(() =>
      Reservation.reconstitute({
        id: 'res-abc',
        tenantId: 'tenant-demo',
        clientId: 'cli-1',
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        date: day,
        startTimeUTC: start,
        endTimeUTC: new Date(start.getTime() + 30 * 60_000),
        timezone: 'UTC',
        duration: 30,
        status: 'bogus' as Reservation['status'],
        notes: null,
        groupBookingId: null,
        activeKey: null,
        cancelToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).toThrow('Reservation status must be pending, confirmed, cancelled, completed or no_show');
  });
});
