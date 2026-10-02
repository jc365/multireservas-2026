/**
 * @file availability.test.ts
 * @module tests/integration/api/v1/availability
 *
 * GET /api/v1/availability (F4.1a): los 3 modos de ventana, paginación
 * por nextFrom, validaciones 400, reserva activa que ocupa su slot,
 * slots pasados filtrados, permisos por tenantScope y el techo de
 * advanceBookingLimit.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../backend/src/index';
import prisma from '../../../../backend/src/infrastructure/persistence/prismaClient';
import { generateToken } from '../../../../backend/src/infrastructure/middleware/auth';

const ownerToken = generateToken('usr-owner', 'tenant-demo', 'owner');
const employeeToken = generateToken('usr-employee', 'tenant-demo', 'employee');
const adminToken = generateToken('usr-admin', null, 'admin');

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const RAW_SCHEDULES = [
  {
    label: 'Todos los días',
    days: ALL_DAYS,
    start: '09:00',
    end: '17:00',
    breaks: [{ start: '12:00', end: '13:00' }],
  },
];

function dateOnlyUTC(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

const TOMORROW = dateOnlyUTC(1);

async function seedBase() {
  await prisma.reservation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.client.deleteMany();
  await prisma.service.deleteMany();
  await prisma.bitacora.deleteMany();
  await prisma.tenant.deleteMany();

  await prisma.tenant.create({
    data: {
      id: 'tenant-demo',
      name: 'Tenant Demo',
      slug: 'demo',
      currency: 'EUR',
      timezone: 'UTC',
      settings: { advanceBookingLimit: 365 },
      schedules: RAW_SCHEDULES,
      holidays: [{ label: 'Navidad', date: '2026-12-25', recurring: true }],
    },
  });
  await prisma.user.createMany({
    data: [
      { id: 'usr-owner', name: 'Owner', email: 'owner@test.com', password: 'hash', role: 'owner', tenantId: 'tenant-demo' },
      { id: 'usr-employee', name: 'Employee', email: 'employee@test.com', password: 'hash', role: 'employee', tenantId: 'tenant-demo' },
      { id: 'usr-admin', name: 'Admin', email: 'admin@test.com', password: 'hash', role: 'admin' },
    ],
  });
  await prisma.employee.create({
    data: { id: 'emp-1', tenantId: 'tenant-demo', userId: 'usr-employee', name: 'Ana Lopez' },
  });
  await prisma.service.create({
    data: { id: 'svc-1', tenantId: 'tenant-demo', name: 'Corte', duration: 15 },
  });
  // F4.5a: segundo servicio para la suma multi-servicio (15 + 15 = 30).
  await prisma.service.create({
    data: { id: 'svc-2', tenantId: 'tenant-demo', name: 'Tinte', duration: 15 },
  });
}

beforeEach(async () => {
  await seedBase();
});

afterAll(async () => {
  await prisma.reservation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.client.deleteMany();
  await prisma.service.deleteMany();
  await prisma.bitacora.deleteMany();
  await prisma.tenant.deleteMany();
});

function get(query: string, token: string) {
  return request(app).get(`/api/v1/availability${query}`).set('Authorization', `Bearer ${token}`);
}

describe('GET /api/v1/availability', () => {
  it('ASAP (sin from/to) → 200 con hasta availabilityBatchSize slots futuros', async () => {
    const nowBefore = Date.now();
    const res = await get('?employeeId=emp-1&duration=15', ownerToken);

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(10);
    expect(res.body.hasMore).toBe(true);
    expect(typeof res.body.nextFrom).toBe('string');
    for (const slot of res.body.slots) {
      expect(slot).toHaveProperty('startUTC');
      expect(slot).toHaveProperty('endUTC');
      expect(slot.localStart).toMatch(/^\d{2}:\d{2}$/);
      expect(slot.localEnd).toMatch(/^\d{2}:\d{2}$/);
      expect(Date.parse(slot.startUTC)).toBeGreaterThan(nowBefore);
    }
  });

  it('desde fecha (from) → empieza a las 09:00 locales y salta el break', async () => {
    const res = await get(`?employeeId=emp-1&duration=15&from=${TOMORROW}`, ownerToken);

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(10);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.slots[0]).toMatchObject({ localStart: '09:00', localEnd: '09:15' });
    for (const slot of res.body.slots) {
      expect(slot.startUTC.startsWith(TOMORROW)).toBe(true);
      expect(['12:00', '12:15', '12:30', '12:45']).not.toContain(slot.localStart);
    }
  });

  it('rango (from+to el mismo día) con limit 50 → 28 slots (32 − 4 del break)', async () => {
    const res = await get(
      `?employeeId=emp-1&duration=15&from=${TOMORROW}&to=${TOMORROW}&limit=50`,
      ownerToken
    );

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(28);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.nextFrom).toBeUndefined();
    expect(res.body.slots[0].localStart).toBe('09:00');
    expect(res.body.slots[27]).toMatchObject({ localStart: '16:45', localEnd: '17:00' });
  });

  it('to sin from → 400', async () => {
    const res = await get(`?employeeId=emp-1&duration=15&to=${TOMORROW}`, ownerToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('to requires from');
  });

  it('duration=17 (no múltiplo de slotDuration) → 400', async () => {
    const res = await get(`?employeeId=emp-1&duration=17&from=${TOMORROW}`, ownerToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('duration must be a multiple of slotDuration');
  });

  it('paginación: from = nextFrom continúa sin solapes ni huecos', async () => {
    const page1 = await get(`?employeeId=emp-1&duration=15&from=${TOMORROW}&limit=10`, ownerToken);
    expect(page1.status).toBe(200);
    expect(page1.body.slots).toHaveLength(10);

    const page2 = await get(
      `?employeeId=emp-1&duration=15&from=${encodeURIComponent(page1.body.nextFrom)}&limit=10`,
      ownerToken
    );
    expect(page2.status).toBe(200);
    expect(page2.body.slots).toHaveLength(10);

    const last1 = Date.parse(page1.body.slots[9].startUTC);
    const first2 = Date.parse(page2.body.slots[0].startUTC);
    expect(first2).toBeGreaterThan(last1);
    expect(first2 - last1).toBe(15 * 60_000);
    const starts = new Set(
      [...page1.body.slots, ...page2.body.slots].map((s: { startUTC: string }) => s.startUTC)
    );
    expect(starts.size).toBe(20);
  });

  it('la reserva activa ocupa su slot; la cancelada no', async () => {
    await prisma.client.create({
      data: { id: 'cli-1', tenantId: 'tenant-demo', firstName: 'Luis', lastName: 'Perez', phone: '600000001' },
    });
    const date = new Date(`${TOMORROW}T00:00:00.000Z`);
    await prisma.reservation.createMany({
      data: [
        {
          id: 'res-active',
          tenantId: 'tenant-demo',
          clientId: 'cli-1',
          employeeId: 'emp-1',
          serviceId: 'svc-1',
          date,
          startTimeUTC: new Date(`${TOMORROW}T09:00:00.000Z`),
          endTimeUTC: new Date(`${TOMORROW}T09:15:00.000Z`),
          timezone: 'UTC',
          duration: 15,
          status: 'pending',
          activeKey: 'emp-1-09:00',
        },
        {
          id: 'res-cancelled',
          tenantId: 'tenant-demo',
          clientId: 'cli-1',
          employeeId: 'emp-1',
          serviceId: 'svc-1',
          date,
          startTimeUTC: new Date(`${TOMORROW}T10:00:00.000Z`),
          endTimeUTC: new Date(`${TOMORROW}T10:15:00.000Z`),
          timezone: 'UTC',
          duration: 15,
          status: 'cancelled',
        },
      ],
    });

    const res = await get(
      `?employeeId=emp-1&duration=15&from=${TOMORROW}&to=${TOMORROW}&limit=50`,
      ownerToken
    );

    expect(res.status).toBe(200);
    const starts = res.body.slots.map((s: { localStart: string }) => s.localStart);
    expect(starts).not.toContain('09:00');
    expect(starts[0]).toBe('09:15');
    expect(starts).toContain('10:00');
    expect(res.body.slots).toHaveLength(27);
  });

  it('slots pasados de hoy no aparecen', async () => {
    const nowBefore = Date.now();
    const today = dateOnlyUTC(0);
    const res = await get(`?employeeId=emp-1&duration=15&from=${today}&limit=50`, ownerToken);

    expect(res.status).toBe(200);
    for (const slot of res.body.slots) {
      expect(Date.parse(slot.startUTC)).toBeGreaterThan(nowBefore);
    }
  });

  it('limit inválido → 400', async () => {
    const zero = await get(`?employeeId=emp-1&duration=15&limit=0`, ownerToken);
    expect(zero.status).toBe(400);

    const big = await get(`?employeeId=emp-1&duration=15&limit=60`, ownerToken);
    expect(big.status).toBe(400);
    expect(big.body.error).toBe('limit must be at most 50');
  });

  it('employeeId inexistente → 404', async () => {
    const res = await get('?employeeId=emp-ghost&duration=15', ownerToken);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Employee not found');
  });

  it('employee (rol) → 200', async () => {
    const res = await get(`?employeeId=emp-1&duration=15&from=${TOMORROW}`, employeeToken);
    expect(res.status).toBe(200);
    expect(res.body.slots.length).toBeGreaterThan(0);
  });

  it('admin sin X-Tenant-Id → 403 Tenant scope required', async () => {
    const res = await get('?employeeId=emp-1&duration=15', adminToken);

    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ code: 'FORBIDDEN', message: 'Tenant scope required' });
  });

  it('con employeeId → cada slot trae también el employeeId consultado (F4.4c)', async () => {
    const res = await get(`?employeeId=emp-1&duration=15&from=${TOMORROW}&to=${TOMORROW}&limit=50`, ownerToken);

    expect(res.status).toBe(200);
    expect(res.body.slots.length).toBeGreaterThan(0);
    expect(res.body.slots.every((slot: { employeeId: string }) => slot.employeeId === 'emp-1')).toBe(true);
  });
});

// ── F4.4c "sin preferencia": sin employeeId ────────────────
describe('GET /api/v1/availability sin employeeId (F4.4c)', () => {
  const AFTERNOON_ONLY = {
    id: 'emp-2',
    tenantId: 'tenant-demo',
    name: 'Beto Ruiz',
    // Huecos exclusivos: emp-1 tiene break 12:00-13:00 en el seed.
    customSchedule: {
      blocks: [{ label: 'Mediodía', days: ALL_DAYS, start: '12:00', end: '13:00', breaks: [] }],
    },
  };

  it('devuelve los huecos de cualquier empleado activo con employeeId por slot', async () => {
    await prisma.employee.create({ data: AFTERNOON_ONLY });

    const res = await get(`?duration=15&from=${TOMORROW}&to=${TOMORROW}&limit=50`, ownerToken);

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(32);
    expect(res.body.hasMore).toBe(false);
    const byStart = new Map(
      res.body.slots.map((slot: { localStart: string; employeeId: string }) => [slot.localStart, slot.employeeId])
    );
    expect(byStart.get('09:00')).toBe('emp-1');
    expect(byStart.get('11:45')).toBe('emp-1');
    expect(byStart.get('12:00')).toBe('emp-2');
    expect(byStart.get('12:45')).toBe('emp-2');
    expect(byStart.get('13:00')).toBe('emp-1');
    expect(byStart.get('16:45')).toBe('emp-1');
    expect(res.body.slots.every((slot: { employeeId: string }) => Boolean(slot.employeeId))).toBe(true);
  });

  it('la reserva activa de un empleado cede ese hueco al otro empleado', async () => {
    // emp-2 comparte el horario del tenant con emp-1 → el mismo hueco
    // lo puede cubrir cualquiera de los dos.
    await prisma.employee.create({ data: { id: 'emp-2', tenantId: 'tenant-demo', name: 'Beto Ruiz' } });
    await prisma.client.create({
      data: { id: 'cli-1', tenantId: 'tenant-demo', firstName: 'Luis', lastName: 'Perez', phone: '600000001' },
    });
    const date = new Date(`${TOMORROW}T00:00:00.000Z`);
    await prisma.reservation.create({
      data: {
        id: 'res-emp1-0900',
        tenantId: 'tenant-demo',
        clientId: 'cli-1',
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        date,
        startTimeUTC: new Date(`${TOMORROW}T09:00:00.000Z`),
        endTimeUTC: new Date(`${TOMORROW}T09:15:00.000Z`),
        timezone: 'UTC',
        duration: 15,
        status: 'confirmed',
        activeKey: 'emp-1-09:00',
      },
    });

    const res = await get(`?duration=15&from=${TOMORROW}&to=${TOMORROW}&limit=50`, ownerToken);

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(28);
    // El hueco de emp-1 está ocupado → lo cubre emp-2 (no desaparece).
    expect(res.body.slots[0]).toMatchObject({ localStart: '09:00', employeeId: 'emp-2' });
    expect(res.body.slots.every((slot: { employeeId: string }) => Boolean(slot.employeeId))).toBe(true);
  });

  it('empleado inactivo no aporta huecos', async () => {
    await prisma.employee.create({
      data: { ...AFTERNOON_ONLY, id: 'emp-inactive', isActive: false },
    });

    const res = await get(`?duration=15&from=${TOMORROW}&to=${TOMORROW}&limit=50`, ownerToken);

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(28);
    expect(
      new Set(res.body.slots.map((slot: { employeeId: string }) => slot.employeeId))
    ).toEqual(new Set(['emp-1']));
  });

  it('sin ningún empleado activo → slots: []', async () => {
    await prisma.employee.updateMany({
      where: { tenantId: 'tenant-demo' },
      data: { isActive: false },
    });

    const res = await get(`?duration=15&from=${TOMORROW}&to=${TOMORROW}&limit=50`, ownerToken);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ slots: [], hasMore: false, duration: 15 });
  });

  it('employee (rol) y validaciones siguen aplicando sin employeeId', async () => {
    const ok = await get(`?duration=15&from=${TOMORROW}`, employeeToken);
    expect(ok.status).toBe(200);
    expect(ok.body.slots.length).toBeGreaterThan(0);

    const bad = await get(`?duration=17&from=${TOMORROW}`, ownerToken);
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('duration must be a multiple of slotDuration');

    const admin = await get('?duration=15', adminToken);
    expect(admin.status).toBe(403);
  });
});

// ── F4.5a: multi-servicio seguido (serviceIds) ─────────────
describe('GET /api/v1/availability con serviceIds (F4.5a)', () => {
  const WINDOW = `&from=${TOMORROW}&to=${TOMORROW}&limit=50`;

  it('suma las duraciones: ancho de 30 min, sin cruzar el break y duration en la respuesta', async () => {
    const res = await get(`?serviceIds=svc-1,svc-2${WINDOW}`, ownerToken);

    expect(res.status).toBe(200);
    expect(res.body.duration).toBe(30);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.slots.length).toBeGreaterThan(0);
    for (const slot of res.body.slots) {
      expect(Date.parse(slot.endUTC) - Date.parse(slot.startUTC)).toBe(30 * 60_000);
      const crossesBreak = slot.localStart < '12:00' && slot.localEnd > '12:00';
      expect(crossesBreak).toBe(false);
      expect(slot.localStart >= '13:00' || slot.localEnd <= '12:00').toBe(true);
    }
    expect(res.body.slots[0]).toMatchObject({ localStart: '09:00', localEnd: '09:30' });
  });

  it('serviceIds con employeeId explícito también suma', async () => {
    const res = await get(`?employeeId=emp-1&serviceIds=svc-1,svc-2${WINDOW}`, ownerToken);

    expect(res.status).toBe(200);
    expect(res.body.duration).toBe(30);
    expect(res.body.slots.length).toBeGreaterThan(0);
    expect(res.body.slots.every((slot: { employeeId: string }) => slot.employeeId === 'emp-1')).toBe(true);
  });

  it('serviceIds y duration a la vez → 400', async () => {
    const res = await get(`?serviceIds=svc-1&duration=15${WINDOW}`, ownerToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('serviceIds and duration must not be used together');
  });

  it('serviceIds como array (?a&b) → 400', async () => {
    const res = await get(`?serviceIds=svc-1&serviceIds=svc-2${WINDOW}`, ownerToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('serviceIds must be a string');
  });

  it('serviceIds desconocido → 404; vacío → 400', async () => {
    const missing = await get(`?serviceIds=svc-x${WINDOW}`, ownerToken);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('Service not found');

    // Solo comas → no se filtra ningún id → 400.
    const empty = await get(`?serviceIds=%2C${WINDOW}`, ownerToken);
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe('serviceIds is required');

    // Sin serviceIds ni duration → sigue pidiendo duration.
    const none = await get(`?from=${TOMORROW}&to=${TOMORROW}`, ownerToken);
    expect(none.status).toBe(400);
    expect(none.body.error).toBe('duration is required');
  });

  it('servicio de otro tenant → 404', async () => {
    await prisma.tenant.create({
      data: {
        id: 'tenant-other',
        name: 'Other',
        slug: 'other',
        currency: 'EUR',
        timezone: 'UTC',
        settings: {},
        schedules: [],
        holidays: [],
      },
    });
    await prisma.service.create({
      data: { id: 'svc-foreign', tenantId: 'tenant-other', name: 'Ajeno', duration: 15 },
    });

    const res = await get(`?serviceIds=svc-foreign${WINDOW}`, ownerToken);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Service not found');
  });

  it('servicio inactivo → 400', async () => {
    await prisma.service.create({
      data: { id: 'svc-inactive', tenantId: 'tenant-demo', name: 'Laca', duration: 15, isActive: false },
    });

    const res = await get(`?serviceIds=svc-inactive${WINDOW}`, ownerToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('service must be active');
  });

  it('total por encima de maxServiceDuration → 400', async () => {
    await prisma.tenant.update({
      where: { id: 'tenant-demo' },
      data: { settings: { advanceBookingLimit: 365, maxServiceDuration: 15 } },
    });

    const res = await get(`?serviceIds=svc-1,svc-2${WINDOW}`, ownerToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('serviceIds total duration must be at most 15 minutes');
  });

  it('sin employeeId solo aportan huecos los empleados que ofrecen todos', async () => {
    await prisma.employee.create({
      data: {
        id: 'emp-partial',
        tenantId: 'tenant-demo',
        name: 'Solo Corte',
        offersAllServices: false,
        services: { connect: [{ id: 'svc-1' }] },
      },
    });

    const res = await get(`?serviceIds=svc-1,svc-2${WINDOW}`, ownerToken);

    expect(res.status).toBe(200);
    expect(res.body.duration).toBe(30);
    expect(res.body.slots.length).toBeGreaterThan(0);
    expect(
      new Set(res.body.slots.map((slot: { employeeId: string }) => slot.employeeId))
    ).toEqual(new Set(['emp-1']));
  });

  it('employeeId que no ofrece todos los servicios → 200 con slots vacíos', async () => {
    await prisma.employee.create({
      data: {
        id: 'emp-partial',
        tenantId: 'tenant-demo',
        name: 'Solo Corte',
        offersAllServices: false,
        services: { connect: [{ id: 'svc-1' }] },
      },
    });

    const res = await get(`?employeeId=emp-partial&serviceIds=svc-1,svc-2${WINDOW}`, ownerToken);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ slots: [], hasMore: false, duration: 30 });
  });
});
