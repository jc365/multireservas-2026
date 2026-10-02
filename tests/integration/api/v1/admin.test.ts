/**
 * @file admin.test.ts
 * @module tests/integration/api/v1/admin
 *
 * F4.0: superficie A (/admin/tenants/*), superficie B (admin +
 * header X-Tenant-Id operando como owner), permisos (owner 403,
 * admin sin header 403) y bitácora con metadata `admin-as-owner`.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../backend/src/index';
import prisma from '../../../../backend/src/infrastructure/persistence/prismaClient';
import { generateToken } from '../../../../backend/src/infrastructure/middleware/auth';

const adminToken = generateToken('usr-admin', null, 'admin');
const ownerToken = generateToken('usr-owner', 'tenant-demo', 'owner');
const employeeToken = generateToken('usr-employee', 'tenant-demo', 'employee');

const OWNER_PUT_PAYLOAD = {
  name: 'Tenant Demo Renombrado',
  currency: 'EUR',
  timezone: 'UTC',
  settings: { slotDuration: 15, maxServiceDuration: 240 },
  schedules: [],
  holidays: [],
};

beforeEach(async () => {
  await prisma.reservation.deleteMany();
  await prisma.client.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.service.deleteMany();
  await prisma.bitacora.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  await prisma.tenant.createMany({
    data: [
      { id: 'tenant-demo', name: 'Tenant Demo', slug: 'demo', currency: 'EUR', timezone: 'UTC', settings: { requireClientPhone: true } },
      { id: 'tenant-other', name: 'Tenant Other', slug: 'other' },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: 'usr-admin', name: 'Admin', email: 'admin@test.com', password: 'hash', role: 'admin' },
      { id: 'usr-owner', name: 'Owner', email: 'owner@test.com', password: 'hash', role: 'owner', tenantId: 'tenant-demo' },
      { id: 'usr-employee', name: 'Employee', email: 'employee@test.com', password: 'hash', role: 'employee', tenantId: 'tenant-demo' },
    ],
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

describe('GET /api/v1/admin/tenants (superficie A)', () => {
  it('admin → 200 con resumen de todos los tenants (sin settings)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 'tenant-demo', slug: 'demo', isActive: true });
    expect(res.body[0]).not.toHaveProperty('settings');
    expect(res.body[1]).toMatchObject({ id: 'tenant-other' });
  });

  it('owner → 403 (superficie A es solo admin)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(403);
  });

  it('employee → 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/admin/tenants/:tenantId', () => {
  it('admin → 200 con config completa', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants/tenant-demo')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'tenant-demo',
      name: 'Tenant Demo',
      slug: 'demo',
      isActive: true,
    });
    expect(res.body.settings).toMatchObject({ requireClientPhone: true });
    expect(res.body).toHaveProperty('schedules');
    expect(res.body).toHaveProperty('holidays');
    expect(res.body).toHaveProperty('updatedAt');
  });

  it('tenant inexistente → 404', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants/tenant-ghost')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'TENANT_NOT_FOUND', message: 'Tenant not found' });
  });
});

describe('POST /api/v1/admin/tenants', () => {
  it('admin → 201 crea SOLO el tenant (defaults EUR/UTC) y bitácora create_tenant con tenantId null', async () => {
    const res = await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Nuevo Tenant', slug: 'nuevo' });

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^ten-/);
    expect(res.body).toMatchObject({
      name: 'Nuevo Tenant',
      slug: 'nuevo',
      currency: 'EUR',
      timezone: 'UTC',
      isActive: true,
    });

    const entry = await prisma.bitacora.findFirst({ where: { action: 'create_tenant' } });
    expect(entry).not.toBeNull();
    expect(entry?.tenantId).toBeNull();
    expect(entry?.entityId).toBe(res.body.id);
    expect(entry?.userId).toBe('usr-admin');
  });

  it('slug duplicado → 409', async () => {
    const res = await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dup', slug: 'demo' });

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: 'SLUG_ALREADY_EXISTS', message: 'slug already exists' });
  });

  it('name vacío → 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '  ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'name is required' });
  });

  it('owner → 403', async () => {
    const res = await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Nope' });

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/admin/tenants/:tenantId', () => {
  it('admin → 200 con maxServiceDuration actualizado y bitácora update_tenant', async () => {
    const res = await request(app)
      .put('/api/v1/admin/tenants/tenant-demo')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(OWNER_PUT_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'tenant-demo',
      name: 'Tenant Demo Renombrado',
      settings: { slotDuration: 15, maxServiceDuration: 240 },
    });

    const entry = await prisma.bitacora.findFirst({ where: { action: 'update_tenant' } });
    expect(entry).not.toBeNull();
    expect(entry?.tenantId).toBe('tenant-demo');
    expect(entry?.userId).toBe('usr-admin');
  });

  it('tenant inexistente → 404', async () => {
    const res = await request(app)
      .put('/api/v1/admin/tenants/tenant-ghost')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(OWNER_PUT_PAYLOAD);

    expect(res.status).toBe(404);
  });

  it('payload inválido → 400', async () => {
    const res = await request(app)
      .put('/api/v1/admin/tenants/tenant-demo')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...OWNER_PUT_PAYLOAD, timezone: 'Marte/Olympus' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/admin/tenants/:tenantId/active (soft delete)', () => {
  it('isActive=false → 200 + bitácora delete_tenant', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/tenants/tenant-demo/active')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);

    const entry = await prisma.bitacora.findFirst({ where: { action: 'delete_tenant' } });
    expect(entry).not.toBeNull();
    expect(entry?.tenantId).toBe('tenant-demo');

    const row = await prisma.tenant.findUnique({ where: { id: 'tenant-demo' } });
    expect(row?.isActive).toBe(false);
  });

  it('isActive=true → 200 reactiva', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/tenants/tenant-demo/active')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true });

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(true);
  });

  it('body sin isActive → 400', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/tenants/tenant-demo/active')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'isActive must be a boolean' });
  });

  it('tenant inexistente → 404', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/tenants/tenant-ghost/active')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/admin/tenants/:tenantId/{services,employees,reservations}', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Corte', duration: 30, price: 20 });
  });

  it('services → 200 con los servicios del tenant', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants/tenant-demo/services')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: 'Corte', tenantId: 'tenant-demo' });
  });

  it('employees → 200 (lista del tenant)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants/tenant-demo/employees')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('reservations → 200 (lista del tenant)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants/tenant-demo/reservations')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('tenant inexistente → 404', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants/tenant-ghost/services')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    // Rutas de lectura de recursos del tenant (no migradas en F4.2)
    expect(res.body.error).toBe('Tenant not found');
  });
});

describe('Superficie B: admin + header X-Tenant-Id (modo owner)', () => {
  it('admin + header → 200 GET /services (mismo scope que el owner)', async () => {
    await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Corte', duration: 30, price: 20 });

    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', 'tenant-demo');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tenantId).toBe('tenant-demo');
  });

  it('admin + header → 201 POST /services', async () => {
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', 'tenant-demo')
      .send({ name: 'Desde Admin', duration: 45, price: 30 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Desde Admin', tenantId: 'tenant-demo' });
  });

  it('admin + header → 200 GET /tenants/me (rol owner, F4.0)', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', 'tenant-demo');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('tenant-demo');
  });

  it('admin + header → 200 PUT /tenants/me (DoD F4.0)', async () => {
    const res = await request(app)
      .put('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', 'tenant-demo')
      .send(OWNER_PUT_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Tenant Demo Renombrado');
  });

  it('admin sin header → 403 en GET /services', async () => {
    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ code: 'FORBIDDEN', message: 'Tenant scope required' });
  });

  it('admin + header inexistente → 404', async () => {
    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', 'tenant-ghost');

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'TENANT_NOT_FOUND', message: 'Tenant not found' });
  });

  it('owner CON header → ignora el header (usa su token)', async () => {
    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-Id', 'tenant-other');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('Bitácora con admin-as-owner (F4.0)', () => {
  it('acción del admin en modo owner → metadata admin-as-owner + filtros adminAsOwner', async () => {
    await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', 'tenant-demo')
      .send({ name: 'Modo Owner', duration: 30, price: 25 });

    // Query por tenant concreto (F0 #12)
    const byTenant = await request(app)
      .get('/api/v1/admin/bitacora')
      .query({ adminAsOwner: 'tenant-demo' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(byTenant.status).toBe(200);
    expect(byTenant.body.data).toHaveLength(1);
    const entry = byTenant.body.data[0];
    expect(entry.action).toBe('create_service');
    expect(entry.tenantId).toBe('tenant-demo');
    expect(entry.metadata['admin-as-owner']).toBe('tenant-demo');
    expect(entry.userId).toBe('usr-admin');

    // Query genérica: cualquier evento con la clave (F0 #12)
    const any = await request(app)
      .get('/api/v1/admin/bitacora')
      .query({ adminAsOwner: 'any' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(any.status).toBe(200);
    expect(any.body.data).toHaveLength(1);
    expect(any.body.data[0].metadata['admin-as-owner']).toBe('tenant-demo');
  });

  it('acciones de la superficie A no llevan admin-as-owner', async () => {
    await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Plataforma', slug: 'plataforma' });

    const res = await request(app)
      .get('/api/v1/admin/bitacora')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].action).toBe('create_tenant');
    expect(res.body.data[0].metadata['admin-as-owner']).toBeUndefined();

    const filtered = await request(app)
      .get('/api/v1/admin/bitacora')
      .query({ adminAsOwner: 'any' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(filtered.body.data).toHaveLength(0);
  });

  it('PUT /tenants/me en modo owner → update_tenant_config con admin-as-owner', async () => {
    const res = await request(app)
      .put('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', 'tenant-demo')
      .send(OWNER_PUT_PAYLOAD);

    expect(res.status).toBe(200);

    const entry = await prisma.bitacora.findFirst({
      where: { action: 'update_tenant_config' },
    });
    expect(entry).not.toBeNull();
    expect(entry?.tenantId).toBe('tenant-demo');
    expect((entry?.metadata as Record<string, unknown>)['admin-as-owner']).toBe('tenant-demo');
  });
});
