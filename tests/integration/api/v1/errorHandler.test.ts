/**
 * @file errorHandler.test.ts
 * @module tests/integration/api/v1/errorHandler
 *
 * F4.2: contrato del handler global de errores end-to-end — envelope
 * único `{ error: { code, message } }`, JSON siempre (nunca HTML),
 * 500 con mensaje genérico y el nuevo DATE_START_TIME_MISMATCH.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../backend/src/index';
import prisma from '../../../../backend/src/infrastructure/persistence/prismaClient';
import { generateToken } from '../../../../backend/src/infrastructure/middleware/auth';

const ownerToken = generateToken('usr-owner', 'tenant-demo', 'owner');
const adminToken = generateToken('usr-admin', null, 'admin');

function futureStart(hour = 10, daysAhead = 7): Date {
  const start = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  start.setUTCHours(hour, 0, 0, 0);
  return start;
}

const CLIENT_DATA = {
  firstName: 'Laura',
  lastName: 'Gómez',
  phone: '+34600111222',
  email: 'laura@example.com',
};

function reservationPayload(overrides: Record<string, unknown> = {}) {
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
  await prisma.user.createMany({
    data: [
      { id: 'usr-owner', name: 'Owner', email: 'owner@test.com', password: 'hash', role: 'owner', tenantId: 'tenant-demo' },
      { id: 'usr-admin', name: 'Admin', email: 'admin@test.com', password: 'hash', role: 'admin' },
    ],
  });
  await prisma.service.create({
    data: { id: 'svc-ten', tenantId: 'tenant-demo', name: 'Tenant Service', duration: 30, price: 25 },
  });
  await prisma.employee.create({
    data: { id: 'emp-ten', tenantId: 'tenant-demo', userId: null, name: 'Tenant Employee' },
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

describe('envelope global (F4.2)', () => {
  it('sin token → 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/v1/reservations');

    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
  });

  it('404 → RESERVATION_NOT_FOUND', async () => {
    const res = await request(app)
      .get('/api/v1/reservations/res-ghost')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({
      code: 'RESERVATION_NOT_FOUND',
      message: 'Reservation not found',
    });
  });

  it('403 → FORBIDDEN (admin sin scope de tenant)', async () => {
    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({
      code: 'FORBIDDEN',
      message: 'Tenant scope required',
    });
  });

  it('400 → VALIDATION_ERROR (name de servicio inválido)', async () => {
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'ab', duration: 30 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('Service name');
  });

  it('409 → RESERVATION_OVERLAP (solapamiento)', async () => {
    await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(reservationPayload());

    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(reservationPayload());

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: 'RESERVATION_OVERLAP',
      message: 'Reservation overlaps an existing reservation',
    });
  });

  it('JSON malformado → 400 JSON (nunca HTML)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBeTruthy();
    expect(res.text).not.toContain('<html');
  });

  it('500 forzado → INTERNAL_ERROR con mensaje genérico (no filtra)', async () => {
    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(reservationPayload({ employeeId: { x: 1 } }));

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(res.text).not.toContain('Prisma');
  });

  it('400 → DATE_START_TIME_MISMATCH (date ≠ día local de startTimeUTC)', async () => {
    const payload = reservationPayload();
    const wrongDate = new Date(Date.parse(payload.date) + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...payload, date: wrongDate });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DATE_START_TIME_MISMATCH');
    expect(res.body.error.message).toContain(wrongDate);
  });
});
