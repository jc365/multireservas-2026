/**
 * @file tenantScope.test.ts
 * @module tests/integration/api/v1/tenantScope
 *
 * Rutas de zona tenant desde F3.1: /services (antes /items).
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../backend/src/index';
import prisma from '../../../../backend/src/infrastructure/persistence/prismaClient';
import { generateToken } from '../../../../backend/src/infrastructure/middleware/auth';

const ownerToken = generateToken('usr-owner', 'tenant-demo', 'owner');
const employeeToken = generateToken('usr-employee', 'tenant-demo', 'employee');
const adminToken = generateToken('usr-admin', null, 'admin');

beforeEach(async () => {
  await prisma.service.deleteMany();
  await prisma.bitacora.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  await prisma.tenant.create({ data: { id: 'tenant-demo', name: 'Tenant Demo', slug: 'demo' } });
  await prisma.user.createMany({
    data: [
      { id: 'usr-owner', name: 'Owner', email: 'owner@test.com', password: 'hash', role: 'owner', tenantId: 'tenant-demo' },
      { id: 'usr-employee', name: 'Employee', email: 'employee@test.com', password: 'hash', role: 'employee', tenantId: 'tenant-demo' },
      { id: 'usr-admin', name: 'Admin', email: 'admin@test.com', password: 'hash', role: 'admin' },
    ],
  });
  await prisma.service.create({
    data: { id: 'svc-ten', tenantId: 'tenant-demo', name: 'Tenant Service', duration: 30 },
  });
});

afterAll(async () => {
  await prisma.service.deleteMany();
  await prisma.bitacora.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
});

describe('GET /api/v1/services (zona tenant)', () => {
  it('owner con tenantId → 200', async () => {
    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('employee con tenantId → 200', async () => {
    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
  });

  it('superadmin sin tenantId → 403', async () => {
    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ code: 'FORBIDDEN', message: 'Tenant scope required' });
  });

  it('sin token → 401 (authMiddleware antes que tenantScope)', async () => {
    const res = await request(app).get('/api/v1/services');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/services/:id (zona tenant)', () => {
  it('owner → 200', async () => {
    const res = await request(app)
      .get('/api/v1/services/svc-ten')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('svc-ten');
  });

  it('superadmin → 403 antes de llegar al handler (no 404)', async () => {
    const res = await request(app)
      .get('/api/v1/services/svc-ten')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/services y archivos (zona tenant)', () => {
  it('POST /services superadmin → 403', async () => {
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Nope', duration: 30 });

    expect(res.status).toBe(403);
  });

  it('PUT /services/:id superadmin → 403 (sin excepción: todas las rutas con tenantScope)', async () => {
    const res = await request(app)
      .put('/api/v1/services/svc-ten')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated by platform' });

    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ code: 'FORBIDDEN', message: 'Tenant scope required' });
  });

  it('GET /files/:key/url superadmin → 403', async () => {
    const res = await request(app)
      .get('/api/v1/files/any-key/url')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });
});

describe('rutas fuera de zona tenant (regresión)', () => {
  it('GET /users sin tenantId → 200 (directorio plataforma)', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it('GET /users/me con tenant → 200', async () => {
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('usr-owner');
    expect(res.body.role).toBe('owner');
  });
});
