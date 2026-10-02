/**
 * @file reservations.test.ts
 * @module tests/integration/api/v1/reservations
 *
 * CRUD de /api/v1/reservations (F3.3): auth + tenantScope +
 * aislamiento cross-tenant + cliente interno creado/reutilizado +
 * solapamiento 409 + cancelación pública por token + admin 403.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../backend/src/index';
import prisma from '../../../../backend/src/infrastructure/persistence/prismaClient';
import { generateToken } from '../../../../backend/src/infrastructure/middleware/auth';

const ownerToken = generateToken('usr-owner', 'tenant-demo', 'owner');
const employeeToken = generateToken('usr-employee', 'tenant-demo', 'employee');
const adminToken = generateToken('usr-admin', null, 'admin');
const otherOwnerToken = generateToken('usr-other', 'tenant-other', 'owner');

function futureStart(hour = 10, daysAhead = 7): Date {
  const start = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  start.setUTCHours(hour, 0, 0, 0);
  return start;
}

function startISO(hour = 10, daysAhead = 7): string {
  return futureStart(hour, daysAhead).toISOString();
}

const CLIENT_DATA = {
  firstName: 'Laura',
  lastName: 'Gómez',
  phone: '+34600111222',
  email: 'laura@example.com',
};

function createPayload(overrides: Record<string, unknown> = {}) {
  const start = futureStart(10);
  return {
    employeeId: 'emp-ten',
    serviceId: 'svc-ten',
    date: start.toISOString().slice(0, 10),
    startTimeUTC: start.toISOString(),
    client: CLIENT_DATA,
    ...overrides,
  };
}

async function createReservation(token: string, overrides: Record<string, unknown> = {}) {
  return request(app).post('/api/v1/reservations').set('Authorization', `Bearer ${token}`).send(createPayload(overrides));
}

async function createForeignReservation(token: string) {
  const start = futureStart(10);
  return request(app)
    .post('/api/v1/reservations')
    .set('Authorization', `Bearer ${token}`)
    .send({
      employeeId: 'emp-foreign',
      serviceId: 'svc-foreign',
      date: start.toISOString().slice(0, 10),
      startTimeUTC: start.toISOString(),
      client: { firstName: 'Otro', lastName: 'Cliente', phone: '+34600000001' },
    });
}

beforeEach(async () => {
  await prisma.reservation.deleteMany();
  await prisma.client.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.service.deleteMany();
  await prisma.bitacora.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  await prisma.tenant.create({
    data: {
      id: 'tenant-demo',
      name: 'Tenant Demo',
      slug: 'demo',
      settings: { requireClientPhone: true, requireClientEmail: false, clientDataRetention: 'nextMonth' },
    },
  });
  await prisma.tenant.create({ data: { id: 'tenant-other', name: 'Tenant Other', slug: 'other' } });
  await prisma.user.createMany({
    data: [
      { id: 'usr-owner', name: 'Owner', email: 'owner@test.com', password: 'hash', role: 'owner', tenantId: 'tenant-demo' },
      { id: 'usr-employee', name: 'Employee', email: 'employee@test.com', password: 'hash', role: 'employee', tenantId: 'tenant-demo' },
      { id: 'usr-admin', name: 'Admin', email: 'admin@test.com', password: 'hash', role: 'admin' },
      { id: 'usr-other', name: 'Other Owner', email: 'other@test.com', password: 'hash', role: 'owner', tenantId: 'tenant-other' },
    ],
  });
  await prisma.service.create({
    data: { id: 'svc-ten', tenantId: 'tenant-demo', name: 'Tenant Service', duration: 30, price: 25 },
  });
  // F4.5b: segundo tramo para los grupos multi-servicio (30 + 15 = 45).
  await prisma.service.create({
    data: { id: 'svc-ten-2', tenantId: 'tenant-demo', name: 'Second Service', duration: 15, price: 10 },
  });
  await prisma.service.create({
    data: { id: 'svc-foreign', tenantId: 'tenant-other', name: 'Foreign Service', duration: 45, price: 40 },
  });
  await prisma.employee.create({
    data: { id: 'emp-ten', tenantId: 'tenant-demo', userId: 'usr-employee', name: 'Tenant Employee' },
  });
  await prisma.employee.create({
    data: { id: 'emp-foreign', tenantId: 'tenant-other', userId: null, name: 'Foreign Employee' },
  });
});

afterAll(async () => {
  await prisma.reservation.deleteMany();
  await prisma.client.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.service.deleteMany();
  await prisma.bitacora.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
});

describe('POST /api/v1/reservations', () => {
  it('owner crea una reserva → 201 confirmed con cliente interno, activeKey y cancelToken', async () => {
    const res = await createReservation(ownerToken);

    expect(res.status).toBe(201);
    expect(res.body.id.startsWith('res-')).toBe(true);
    expect(res.body.tenantId).toBe('tenant-demo');
    expect(res.body.status).toBe('confirmed');
    expect(res.body.activeKey).toBeTruthy();
    expect(res.body.cancelToken).toBeTruthy();
    expect(res.body.cancelToken).toHaveLength(21);
    expect(res.body.client).toEqual(
      expect.objectContaining({ firstName: 'Laura', lastName: 'Gómez', phone: '+34600111222' })
    );
    expect(res.body.employee).toEqual(expect.objectContaining({ id: 'emp-ten', name: 'Tenant Employee' }));
    expect(res.body.service).toEqual(expect.objectContaining({ id: 'svc-ten', duration: 30 }));

    const clientRow = await prisma.client.findFirst({ where: { tenantId: 'tenant-demo' } });
    expect(clientRow).not.toBeNull();
    expect(clientRow?.visitCount).toBe(1);
    expect(clientRow?.lastVisit).not.toBeNull();
    // F3.3.1: lastVisit = startTimeUTC de la reserva (la más futura)
    expect(clientRow?.lastVisit?.toISOString()).toBe(res.body.startTimeUTC);
    const expectedExpires = new Date(clientRow!.lastVisit!);
    expectedExpires.setUTCMonth(expectedExpires.getUTCMonth() + 1);
    expect(clientRow?.dataExpiresAt?.getTime()).toBe(expectedExpires.getTime());
  });

  it('mismo teléfono → reutiliza el cliente (visitCount +1, sin fila nueva)', async () => {
    await createReservation(ownerToken);
    const res = await createReservation(ownerToken, { startTimeUTC: startISO(11) });

    expect(res.status).toBe(201);
    const clients = await prisma.client.findMany({ where: { tenantId: 'tenant-demo' } });
    expect(clients).toHaveLength(1);
    expect(clients[0].visitCount).toBe(2);
    expect(res.body.clientId).toBe(clients[0].id);
  });

  it('nuevo teléfono pero mismo email → fallback por email reutiliza la fila', async () => {
    await createReservation(ownerToken);
    const res = await createReservation(ownerToken, {
      startTimeUTC: startISO(11),
      client: { ...CLIENT_DATA, phone: '+34600999888' },
    });

    expect(res.status).toBe(201);
    const clients = await prisma.client.findMany({ where: { tenantId: 'tenant-demo' } });
    expect(clients).toHaveLength(1);
    expect(clients[0].phone).toBe('+34600999888'); // sincronizado
    expect(clients[0].visitCount).toBe(2);
  });

  it('F3.3.1: reserva posterior → lastVisit y dataExpiresAt avanzan', async () => {
    const first = await createReservation(ownerToken); // día +7
    expect(first.status).toBe(201);

    const later = futureStart(10, 14); // día +14
    const second = await createReservation(ownerToken, {
      date: later.toISOString().slice(0, 10),
      startTimeUTC: later.toISOString(),
    });
    expect(second.status).toBe(201);

    const row = await prisma.client.findFirst({ where: { tenantId: 'tenant-demo' } });
    expect(row?.visitCount).toBe(2);
    expect(row?.lastVisit?.toISOString()).toBe(second.body.startTimeUTC);
    const expectedExpires = new Date(row!.lastVisit!);
    expectedExpires.setUTCMonth(expectedExpires.getUTCMonth() + 1);
    expect(row?.dataExpiresAt?.getTime()).toBe(expectedExpires.getTime());
  });

  it('F3.3.1: reserva anterior a lastVisit → no toca lastVisit ni dataExpiresAt', async () => {
    const later = futureStart(10, 14); // día +14 (queda como lastVisit)
    const first = await createReservation(ownerToken, {
      date: later.toISOString().slice(0, 10),
      startTimeUTC: later.toISOString(),
    });
    expect(first.status).toBe(201);
    const before = await prisma.client.findFirst({ where: { tenantId: 'tenant-demo' } });

    const second = await createReservation(ownerToken); // día +7, anterior
    expect(second.status).toBe(201);

    const after = await prisma.client.findFirst({ where: { tenantId: 'tenant-demo' } });
    expect(after?.visitCount).toBe(2);
    expect(after?.lastVisit?.getTime()).toBe(before?.lastVisit?.getTime());
    expect(after?.dataExpiresAt?.getTime()).toBe(before?.dataExpiresAt?.getTime());
  });

  it('bitácora registra create_reservation (F3.3 #15)', async () => {
    const created = await createReservation(ownerToken);
    expect(created.status).toBe(201);

    const logs = await prisma.bitacora.findMany({ where: { action: 'create_reservation' } });
    expect(logs).toHaveLength(1);
    expect(logs[0].entityId).toBe(created.body.id);
    expect(logs[0].userId).toBe('usr-owner');
  });

  it('misma fecha → 409 overlap (activeKey exacto)', async () => {
    const first = await createReservation(ownerToken);
    expect(first.status).toBe(201);

    const res = await createReservation(ownerToken);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESERVATION_OVERLAP');
    expect(res.body.error.message).toContain('overlaps');
  });

  it('solapamiento parcial de intervalo → 409 overlap', async () => {
    const base = futureStart(10);
    const first = await createReservation(ownerToken, {
      date: base.toISOString().slice(0, 10),
      startTimeUTC: base.toISOString(),
    });
    expect(first.status).toBe(201);

    const start = new Date(base.getTime() + 15 * 60_000); // 10:15-10:45
    const res = await createReservation(ownerToken, {
      date: start.toISOString().slice(0, 10),
      startTimeUTC: start.toISOString(),
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESERVATION_OVERLAP');
    expect(res.body.error.message).toContain('overlaps');
  });

  it('otro employee en el mismo hueco → 201 (no hay conflicto)', async () => {
    const first = await createReservation(ownerToken);
    expect(first.status).toBe(201);

    await prisma.employee.create({ data: { id: 'emp-ten-2', tenantId: 'tenant-demo', userId: null, name: 'Second Employee' } });
    const second = await createReservation(ownerToken, { employeeId: 'emp-ten-2' });
    expect(second.status).toBe(201);
  });

  it('duration distinta a la del servicio → 400', async () => {
    const res = await createReservation(ownerToken, { duration: 45 });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'duration must match the service duration' });
  });

  it('fecha en el pasado → 400', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const res = await createReservation(ownerToken, {
      date: past.toISOString().slice(0, 10),
      startTimeUTC: past.toISOString(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Reservation cannot be in the past' });
  });

  it('employeeId de otro tenant → 400', async () => {
    const res = await createReservation(ownerToken, { employeeId: 'emp-foreign' });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'employeeId does not reference an employee of this tenant' });
  });

  it('serviceId de otro tenant → 400', async () => {
    const res = await createReservation(ownerToken, { serviceId: 'svc-foreign' });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'serviceId does not reference a service of this tenant' });
  });

  it('sin phone con requireClientPhone=true → 400', async () => {
    const res = await createReservation(ownerToken, { client: { firstName: 'Laura', lastName: 'Gómez' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'client phone is required' });
  });

  it('employee → 200 crea (T en editReservations)', async () => {
    const res = await createReservation(employeeToken);
    expect(res.status).toBe(201);
  });

  it('admin (plataforma) → 403 Tenant scope required', async () => {
    const res = await createReservation(adminToken);
    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ code: 'FORBIDDEN', message: 'Tenant scope required' });
  });

  it('sin token → 401', async () => {
    const res = await request(app).post('/api/v1/reservations').send(createPayload());
    expect(res.status).toBe(401);
  });
});

// ── F4.4c "sin preferencia": employeeId opcional ───────────
describe('POST /api/v1/reservations sin employeeId (F4.4c)', () => {
  const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  async function withSchedules() {
    await prisma.tenant.update({
      where: { id: 'tenant-demo' },
      data: {
        schedules: [{ label: 'Todos', days: ALL_DAYS, start: '09:00', end: '17:00', breaks: [] }],
      },
    });
  }

  async function createSecondEmployee() {
    await prisma.employee.create({
      data: { id: 'emp-ten-2', tenantId: 'tenant-demo', userId: null, name: 'Second Employee' },
    });
  }

  it('asigna el empleado disponible → 201 con employeeId y activeKey', async () => {
    await withSchedules();

    const res = await createReservation(ownerToken, { employeeId: undefined });

    expect(res.status).toBe(201);
    expect(res.body.employeeId).toBe('emp-ten');
    expect(res.body.employee).toEqual(expect.objectContaining({ id: 'emp-ten' }));
    expect(res.body.activeKey).toBeTruthy();
    expect(res.body.status).toBe('confirmed');
  });

  it('dos empleados activos → asigna a uno de los dos', async () => {
    await withSchedules();
    await createSecondEmployee();

    const res = await createReservation(ownerToken, { employeeId: undefined });

    expect(res.status).toBe(201);
    expect(['emp-ten', 'emp-ten-2']).toContain(res.body.employeeId);
  });

  it('el empleado ocupado en ese slot cede el turno al libre', async () => {
    await withSchedules();
    await createSecondEmployee();
    const start = futureStart(10);
    const day = new Date(start.toISOString().slice(0, 10));
    await prisma.reservation.create({
      data: {
        id: 'res-busy-1000',
        tenantId: 'tenant-demo',
        clientId: (await prisma.client.create({
          data: { id: 'cli-busy', tenantId: 'tenant-demo', firstName: 'Busy', lastName: 'Client', phone: '600000002' },
        })).id,
        employeeId: 'emp-ten',
        serviceId: 'svc-ten',
        date: day,
        startTimeUTC: start,
        endTimeUTC: new Date(start.getTime() + 30 * 60_000),
        timezone: 'UTC',
        duration: 30,
        status: 'confirmed',
        activeKey: 'emp-ten-10:00',
      },
    });

    const res = await createReservation(ownerToken, {
      employeeId: undefined,
      date: start.toISOString().slice(0, 10),
      startTimeUTC: start.toISOString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.employeeId).toBe('emp-ten-2');
  });

  it('fuera del horario → 409 NO_EMPLOYEE_AVAILABLE sin crear nada', async () => {
    await withSchedules();
    const start = futureStart(4); // 04:00 UTC — el horario es 09:00-17:00

    const res = await createReservation(ownerToken, {
      employeeId: undefined,
      date: start.toISOString().slice(0, 10),
      startTimeUTC: start.toISOString(),
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: 'NO_EMPLOYEE_AVAILABLE',
      message: 'No active employee is available for the requested slot',
    });
    expect(await prisma.reservation.count()).toBe(0);
  });

  it('sin ningún empleado activo → 409 NO_EMPLOYEE_AVAILABLE', async () => {
    await withSchedules();
    await prisma.employee.updateMany({
      where: { tenantId: 'tenant-demo' },
      data: { isActive: false },
    });

    const res = await createReservation(ownerToken, { employeeId: undefined });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_EMPLOYEE_AVAILABLE');
    expect(await prisma.reservation.count()).toBe(0);
  });

  it('employeeId explícito manda: no reasigna aunque haya otro libre', async () => {
    await withSchedules();
    await createSecondEmployee();

    const res = await createReservation(ownerToken, { employeeId: 'emp-ten-2' });

    expect(res.status).toBe(201);
    expect(res.body.employeeId).toBe('emp-ten-2');
  });
});

describe('GET /api/v1/reservations', () => {
  it('owner lista las reservas de su tenant → 200', async () => {
    const created = await createReservation(ownerToken);
    const res = await request(app).get('/api/v1/reservations').set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(created.body.id);
    expect(res.body[0].client.firstName).toBe('Laura');
  });

  it('filtros ?status y ?employeeId → 200', async () => {
    await createReservation(ownerToken);

    const confirmed = await request(app)
      .get('/api/v1/reservations?status=confirmed&employeeId=emp-ten')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toHaveLength(1);

    const cancelled = await request(app)
      .get('/api/v1/reservations?status=cancelled')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toHaveLength(0);
  });

  it('status inválido → 400', async () => {
    const res = await request(app)
      .get('/api/v1/reservations?status=bogus')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
  });

  it('filtro ?from/?to por rango (F4.3) → solo reservas dentro del rango', async () => {
    const day7 = futureStart(10, 7);
    const day14 = futureStart(10, 14);
    const near = await createReservation(ownerToken, {
      startTimeUTC: day7.toISOString(),
      date: day7.toISOString().slice(0, 10),
    });
    const far = await createReservation(ownerToken, {
      startTimeUTC: day14.toISOString(),
      date: day14.toISOString().slice(0, 10),
    });
    expect(near.status).toBe(201);
    expect(far.status).toBe(201);

    const day7Str = day7.toISOString().slice(0, 10);
    const day14Str = day14.toISOString().slice(0, 10);

    const onlyDay7 = await request(app)
      .get(`/api/v1/reservations?from=${day7Str}&to=${day7Str}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(onlyDay7.status).toBe(200);
    expect(onlyDay7.body).toHaveLength(1);
    expect(onlyDay7.body[0].id).toBe(near.body.id);

    const fullRange = await request(app)
      .get(`/api/v1/reservations?from=${day7Str}&to=${day14Str}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(fullRange.status).toBe(200);
    expect(fullRange.body).toHaveLength(2);

    const outside = await request(app)
      .get(`/api/v1/reservations?from=${day14Str}&to=${day14Str}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(outside.status).toBe(200);
    expect(outside.body).toHaveLength(1);
    expect(outside.body[0].id).toBe(far.body.id);
  });

  it('from inválido o invertido → 400 (F4.3)', async () => {
    const badFormat = await request(app)
      .get('/api/v1/reservations?from=05/10/2026')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badFormat.status).toBe(400);

    const inverted = await request(app)
      .get('/api/v1/reservations?from=2026-10-11&to=2026-10-05')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(inverted.status).toBe(400);
  });

  it('owner de otro tenant no ve reservas ajenas', async () => {
    await createReservation(ownerToken);

    const res = await request(app).get('/api/v1/reservations').set('Authorization', `Bearer ${otherOwnerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('admin → 403', async () => {
    const res = await request(app).get('/api/v1/reservations').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it('sin token → 401', async () => {
    const res = await request(app).get('/api/v1/reservations');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/reservations/:id', () => {
  it('owner → 200 con relaciones embebidas', async () => {
    const created = await createReservation(ownerToken);
    const res = await request(app)
      .get(`/api/v1/reservations/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
    expect(res.body.duration).toBe(30);
    expect(res.body.timezone).toBe('UTC');
    expect(res.body.client.email).toBe('laura@example.com');
  });

  it('reserva de otro tenant → 404 (aislamiento F3.3 #14)', async () => {
    const foreign = await createForeignReservation(otherOwnerToken);
    expect(foreign.status).toBe(201);

    const res = await request(app)
      .get(`/api/v1/reservations/${foreign.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found' });
  });

  it('reserva inexistente → 404', async () => {
    const res = await request(app)
      .get('/api/v1/reservations/res-404')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it('admin → 403', async () => {
    const res = await request(app)
      .get('/api/v1/reservations/res-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/reservations/:id', () => {
  it('actualiza las notes → 200 + bitácora update_reservation', async () => {
    const created = await createReservation(ownerToken);
    const res = await request(app)
      .put(`/api/v1/reservations/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ notes: 'llega tarde' });

    expect(res.status).toBe(200);
    expect(res.body.notes).toBe('llega tarde');

    const logs = await prisma.bitacora.findMany({ where: { action: 'update_reservation' } });
    expect(logs).toHaveLength(1);
  });

  it('status a cancelled → 200, activeKey null en BD y bitácora cancel_reservation', async () => {
    const created = await createReservation(ownerToken);
    const res = await request(app)
      .put(`/api/v1/reservations/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.activeKey).toBeNull();

    const row = await prisma.reservation.findUnique({ where: { id: created.body.id } });
    expect(row?.activeKey).toBeNull();
    expect(row?.status).toBe('cancelled');

    const logs = await prisma.bitacora.findMany({ where: { action: 'cancel_reservation' } });
    expect(logs).toHaveLength(1);
  });

  it('tras cancelar, el mismo hueco se puede volver a reservar → 201', async () => {
    const created = await createReservation(ownerToken);
    await request(app)
      .put(`/api/v1/reservations/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'cancelled' });

    const again = await createReservation(ownerToken);
    expect(again.status).toBe(201);
    expect(again.body.id).not.toBe(created.body.id);
  });

  it('status inválido → 400', async () => {
    const created = await createReservation(ownerToken);
    const res = await request(app)
      .put(`/api/v1/reservations/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'bogus' });

    expect(res.status).toBe(400);
  });

  it('reserva de otro tenant → 404', async () => {
    const foreign = await createForeignReservation(otherOwnerToken);
    expect(foreign.status).toBe(201);

    const res = await request(app)
      .put(`/api/v1/reservations/${foreign.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ notes: 'hack' });

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found' });
  });

  it('admin → 403', async () => {
    const res = await request(app)
      .put('/api/v1/reservations/res-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('Cancelación pública por token (F3.3 #10)', () => {
  it('GET sin auth muestra la reserva → 200', async () => {
    const created = await createReservation(ownerToken);

    const res = await request(app).get(`/api/v1/reservations/cancel/${created.body.cancelToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.status).toBe('confirmed');
  });

  it('POST sin auth cancela → 200 cancelled y activeKey null', async () => {
    const created = await createReservation(ownerToken);

    const res = await request(app).post(`/api/v1/reservations/cancel/${created.body.cancelToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.activeKey).toBeNull();

    const row = await prisma.reservation.findUnique({ where: { id: created.body.id } });
    expect(row?.status).toBe('cancelled');
    expect(row?.activeKey).toBeNull();

    // sin actor autenticado → sin bitácora (F3.3)
    const logs = await prisma.bitacora.findMany({ where: { action: 'cancel_reservation' } });
    expect(logs).toHaveLength(0);
  });

  it('segunda cancelación por token → 409', async () => {
    const created = await createReservation(ownerToken);
    await request(app).post(`/api/v1/reservations/cancel/${created.body.cancelToken}`);

    const res = await request(app).post(`/api/v1/reservations/cancel/${created.body.cancelToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESERVATION_INVALID_STATE');
    expect(res.body.error.message).toContain('already');
  });

  it('token inválido → 404 en GET y POST', async () => {
    const getRes = await request(app).get('/api/v1/reservations/cancel/token-malo-000');
    expect(getRes.status).toBe(404);

    const postRes = await request(app).post('/api/v1/reservations/cancel/token-malo-000');
    expect(postRes.status).toBe(404);
    expect(postRes.body.error).toEqual({ code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found' });
  });

  it('F3.3.1: cancelar no toca lastVisit ni dataExpiresAt del cliente', async () => {
    const created = await createReservation(ownerToken);
    const before = await prisma.client.findFirst({ where: { tenantId: 'tenant-demo' } });
    expect(before?.lastVisit).not.toBeNull();

    const res = await request(app).post(`/api/v1/reservations/cancel/${created.body.cancelToken}`);
    expect(res.status).toBe(200);

    const after = await prisma.client.findFirst({ where: { tenantId: 'tenant-demo' } });
    expect(after?.visitCount).toBe(before?.visitCount);
    expect(after?.lastVisit?.getTime()).toBe(before?.lastVisit?.getTime());
    expect(after?.dataExpiresAt?.getTime()).toBe(before?.dataExpiresAt?.getTime());
  });

  it('el owner autenticado ve la reserva ya cancelada por token', async () => {
    const created = await createReservation(ownerToken);
    await request(app).post(`/api/v1/reservations/cancel/${created.body.cancelToken}`);

    const res = await request(app)
      .get(`/api/v1/reservations/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });
});

// ── F4.5b: multi-servicio seguido (grupos) ─────────────────
describe('POST /api/v1/reservations con serviceIds (F4.5b)', () => {
  function groupPayload(start: Date, overrides: Record<string, unknown> = {}) {
    return createPayload({
      serviceIds: ['svc-ten', 'svc-ten-2'],
      date: start.toISOString().slice(0, 10),
      startTimeUTC: start.toISOString(),
      ...overrides,
    });
  }

  async function postGroup(token: string, payload: Record<string, unknown>) {
    return request(app).post('/api/v1/reservations').set('Authorization', `Bearer ${token}`).send(payload);
  }

  async function rowsOf(groupBookingId: string) {
    return prisma.reservation.findMany({
      where: { groupBookingId },
      orderBy: { startTimeUTC: 'asc' },
    });
  }

  it('serviceIds de 2 servicios → 201 con 2 filas, mismo grupo e inicio encadenado', async () => {
    const start = futureStart(10);
    const res = await postGroup(ownerToken, groupPayload(start));

    expect(res.status).toBe(201);
    expect(res.body.groupBookingId).toMatch(/^grp-/);
    expect(res.body.groupTotalPrice).toBe(35); // 25 + 10
    expect(res.body.serviceId).toBe('svc-ten');
    expect(res.body.startTimeUTC).toBe(start.toISOString());

    const rows = await rowsOf(res.body.groupBookingId);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.serviceId)).toEqual(['svc-ten', 'svc-ten-2']);
    expect(rows.map((row) => row.duration)).toEqual([30, 15]);
    expect(rows[1].startTimeUTC.getTime() - rows[0].startTimeUTC.getTime()).toBe(30 * 60_000);
    expect(rows[0].activeKey).toBeTruthy();
    expect(rows[1].activeKey).toBeTruthy();
    expect(rows[0].activeKey).not.toBe(rows[1].activeKey);
    expect(rows[0].date.getTime()).toBe(rows[1].date.getTime());
    expect(rows[0].date.toISOString().slice(0, 10)).toBe(start.toISOString().slice(0, 10));
    expect(rows[0].cancelToken).not.toBe(rows[1].cancelToken);
  });

  it('detalle y listado exponen groupBookingId + groupTotalPrice', async () => {
    const created = await postGroup(ownerToken, groupPayload(futureStart(10)));
    expect(created.status).toBe(201);

    const detail = await request(app)
      .get(`/api/v1/reservations/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.groupBookingId).toBe(created.body.groupBookingId);
    expect(detail.body.groupTotalPrice).toBe(35);

    const list = await request(app)
      .get('/api/v1/reservations')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.every((row: { groupBookingId: string }) => row.groupBookingId === created.body.groupBookingId)).toBe(true);
    expect(list.body.every((row: { groupTotalPrice: number }) => row.groupTotalPrice === 35)).toBe(true);
  });

  it('solape dentro de la ventana total → 409 y 0 filas creadas', async () => {
    const start = futureStart(10);
    const blocked = await createReservation(ownerToken, {
      serviceId: 'svc-ten-2',
      date: start.toISOString().slice(0, 10),
      startTimeUTC: new Date(start.getTime() + 30 * 60_000).toISOString(),
    });
    expect(blocked.status).toBe(201);

    const res = await postGroup(ownerToken, groupPayload(start));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESERVATION_OVERLAP');
    const groups = await prisma.reservation.findMany({ where: { groupBookingId: { not: null } } });
    expect(groups).toHaveLength(0);
  });

  it('PUT cancel sobre una fila → ambas cancelled con activeKey null y 1 bitácora', async () => {
    const created = await postGroup(ownerToken, groupPayload(futureStart(10)));
    expect(created.status).toBe(201);

    const res = await request(app)
      .put(`/api/v1/reservations/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');

    const rows = await rowsOf(created.body.groupBookingId);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'cancelled')).toBe(true);
    expect(rows.every((row) => row.activeKey === null)).toBe(true);

    const logs = await prisma.bitacora.findMany({ where: { action: 'cancel_reservation' } });
    expect(logs).toHaveLength(1);
    expect(logs[0].entityId).toBe(created.body.groupBookingId);
  });

  it('tras cancelar el grupo, el mismo hueco se puede volver a reservar → 201', async () => {
    const start = futureStart(10);
    const created = await postGroup(ownerToken, groupPayload(start));
    await request(app)
      .put(`/api/v1/reservations/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'cancelled' });

    const again = await postGroup(ownerToken, groupPayload(start));
    expect(again.status).toBe(201);
    expect(again.body.groupBookingId).not.toBe(created.body.groupBookingId);
    expect(await rowsOf(again.body.groupBookingId)).toHaveLength(2);
  });

  it('token público cancela el grupo entero sin bitácora', async () => {
    const created = await postGroup(ownerToken, groupPayload(futureStart(10)));
    expect(created.status).toBe(201);

    const res = await request(app).post(
      `/api/v1/reservations/cancel/${created.body.cancelToken}`
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');

    const rows = await rowsOf(created.body.groupBookingId);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'cancelled' && row.activeKey === null)).toBe(true);

    const logs = await prisma.bitacora.findMany({ where: { action: 'cancel_reservation' } });
    expect(logs).toHaveLength(0);
  });

  it('serviceIds con un solo servicio → 1 fila SIN grupo', async () => {
    const res = await postGroup(ownerToken, createPayload({ serviceIds: ['svc-ten'] }));

    expect(res.status).toBe(201);
    expect(res.body.groupBookingId).toBeNull();
    expect(res.body.groupTotalPrice).toBeUndefined();

    const rows = await prisma.reservation.findMany({ where: { tenantId: 'tenant-demo' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].groupBookingId).toBeNull();
  });

  it('serviceId clásico (regresión) → 1 fila SIN grupo', async () => {
    const res = await createReservation(ownerToken);

    expect(res.status).toBe(201);
    expect(res.body.groupBookingId).toBeNull();
    expect(res.body.groupTotalPrice).toBeUndefined();
    expect(res.body.serviceId).toBe('svc-ten');
    expect(res.body.activeKey).toBeTruthy();
  });

  it('serviceIds de otro tenant → 400 y ninguna fila', async () => {
    const res = await postGroup(ownerToken, groupPayload(futureStart(11), { serviceIds: ['svc-ten', 'svc-foreign'] }));

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('does not reference a service of this tenant');
    expect(await prisma.reservation.findMany({ where: { groupBookingId: { not: null } } })).toHaveLength(0);
  });
});
