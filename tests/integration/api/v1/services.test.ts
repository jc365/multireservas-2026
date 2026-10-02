/**
 * @file services.test.ts
 * @module tests/integration/api/v1/services
 *
 * CRUD de /api/v1/services: auth + tenantScope + aislamiento
 * cross-tenant + validación de duration (F3.1).
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

beforeEach(async () => {
  await prisma.service.deleteMany();
  await prisma.bitacora.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  await prisma.tenant.create({ data: { id: 'tenant-demo', name: 'Tenant Demo', slug: 'demo' } });
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
});

afterAll(async () => {
  await prisma.service.deleteMany();
  await prisma.bitacora.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
});

describe('GET /api/v1/services', () => {
  it('owner → 200 y solo los servicios de su tenant', async () => {
    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('svc-ten');
    expect(res.body[0].tenantId).toBe('tenant-demo');
  });

  it('employee → 200', async () => {
    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('admin (plataforma) → 403 Tenant scope required', async () => {
    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ code: 'FORBIDDEN', message: 'Tenant scope required' });
  });

  it('sin token → 401', async () => {
    const res = await request(app).get('/api/v1/services');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/services/:id', () => {
  it('owner → 200 con el servicio de su tenant', async () => {
    const res = await request(app)
      .get('/api/v1/services/svc-ten')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Tenant Service');
    expect(res.body.duration).toBe(30);
    expect(res.body.price).toBe(25);
  });

  it('servicio de otro tenant → 404 (no filtra existencia)', async () => {
    const res = await request(app)
      .get('/api/v1/services/svc-foreign')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'SERVICE_NOT_FOUND', message: 'Service not found' });
  });

  it('servicio inexistente → 404', async () => {
    const res = await request(app)
      .get('/api/v1/services/svc-404')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });

  it('admin → 403', async () => {
    const res = await request(app)
      .get('/api/v1/services/svc-ten')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/services', () => {
  it('owner crea un servicio → 201 con tenantId inyectado', async () => {
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Classic Haircut', description: 'Cut & style', duration: 30, price: 25, category: 'hair' });

    expect(res.status).toBe(201);
    expect(res.body.id.startsWith('svc-')).toBe(true);
    expect(res.body.tenantId).toBe('tenant-demo');
    expect(res.body.name).toBe('Classic Haircut');
    expect(res.body.duration).toBe(30);
    expect(res.body.isActive).toBe(true);
  });

  it('duration no múltiplo de slotDuration (15) → 400', async () => {
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Bad Duration', duration: 20 });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Service duration must be a multiple of 15 minutes' });
  });

  it('duration < slotDuration → 400', async () => {
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Too Short', duration: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Service duration must be at least 15 minutes' });
  });

  it('duration > maxServiceDuration (180) → 400', async () => {
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Too Long', duration: 300 });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Service duration cannot exceed 180 minutes' });
  });

  it('name inválido → 400', async () => {
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'ab', duration: 30 });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Service name must be at least 3 characters' });
  });

  it('admin → 403', async () => {
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Nope', duration: 30 });

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/services/:id', () => {
  it('owner actualiza → 200', async () => {
    const res = await request(app)
      .put('/api/v1/services/svc-ten')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Updated Service', price: 35, isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Service');
    expect(res.body.price).toBe(35);
    expect(res.body.isActive).toBe(false);
    expect(res.body.duration).toBe(30);
  });

  it('duration inválida en update → 400', async () => {
    const res = await request(app)
      .put('/api/v1/services/svc-ten')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ duration: 20 });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Service duration must be a multiple of 15 minutes' });
  });

  it('servicio de otro tenant → 404', async () => {
    const res = await request(app)
      .put('/api/v1/services/svc-foreign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Hacked' });

    expect(res.status).toBe(404);
  });

  it('admin → 403', async () => {
    const res = await request(app)
      .put('/api/v1/services/svc-ten')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Nope' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/services/:id', () => {
  it('owner elimina → 204', async () => {
    const res = await request(app)
      .delete('/api/v1/services/svc-ten')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(204);

    const after = await request(app)
      .get('/api/v1/services/svc-ten')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(after.status).toBe(404);
  });

  it('servicio de otro tenant → 404 y sigue existiendo', async () => {
    const res = await request(app)
      .delete('/api/v1/services/svc-foreign')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);

    const foreign = await prisma.service.findUnique({ where: { id: 'svc-foreign' } });
    expect(foreign).not.toBeNull();
  });

  it('servicio inexistente → 404', async () => {
    const res = await request(app)
      .delete('/api/v1/services/svc-404')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });

  it('admin → 403', async () => {
    const res = await request(app)
      .delete('/api/v1/services/svc-ten')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });
});
