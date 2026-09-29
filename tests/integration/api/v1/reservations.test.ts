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
    expect(res.body.error).toContain('overlaps');
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
    expect(res.body.error).toContain('overlaps');
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
    expect(res.body.error).toBe('duration must match the service duration');
  });

  it('fecha en el pasado → 400', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const res = await createReservation(ownerToken, {
      date: past.toISOString().slice(0, 10),
      startTimeUTC: past.toISOString(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Reservation cannot be in the past');
  });

  it('employeeId de otro tenant → 400', async () => {
    const res = await createReservation(ownerToken, { employeeId: 'emp-foreign' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('employeeId does not reference an employee of this tenant');
  });

  it('serviceId de otro tenant → 400', async () => {
    const res = await createReservation(ownerToken, { serviceId: 'svc-foreign' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('serviceId does not reference a service of this tenant');
  });

  it('sin phone con requireClientPhone=true → 400', async () => {
    const res = await createReservation(ownerToken, { client: { firstName: 'Laura', lastName: 'Gómez' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('client phone is required');
  });

  it('employee → 200 crea (T en editReservations)', async () => {
    const res = await createReservation(employeeToken);
    expect(res.status).toBe(201);
  });

  it('admin (plataforma) → 403 Tenant scope required', async () => {
    const res = await createReservation(adminToken);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Tenant scope required');
  });

  it('sin token → 401', async () => {
    const res = await request(app).post('/api/v1/reservations').send(createPayload());
    expect(res.status).toBe(401);
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
    expect(res.body.error).toBe('Reservation not found');
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
    expect(res.body.error).toBe('Reservation not found');
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
    expect(res.body.error).toContain('already');
  });

  it('token inválido → 404 en GET y POST', async () => {
    const getRes = await request(app).get('/api/v1/reservations/cancel/token-malo-000');
    expect(getRes.status).toBe(404);

    const postRes = await request(app).post('/api/v1/reservations/cancel/token-malo-000');
    expect(postRes.status).toBe(404);
    expect(postRes.body.error).toBe('Reservation not found');
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
