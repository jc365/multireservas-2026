/**
 * @file employees.test.ts
 * @module tests/integration/api/v1/employees
 *
 * CRUD de /api/v1/employees: auth + tenantScope + aislamiento
 * cross-tenant + self-view del rol employee + M2M + userId +
 * soft delete (F3.2).
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
  await prisma.employee.deleteMany();
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
      { id: 'usr-spare', name: 'Spare', email: 'spare@test.com', password: 'hash', role: 'employee', tenantId: 'tenant-demo' },
    ],
  });
  await prisma.service.create({
    data: { id: 'svc-ten', tenantId: 'tenant-demo', name: 'Tenant Service', duration: 30, price: 25 },
  });
  await prisma.service.create({
    data: { id: 'svc-foreign', tenantId: 'tenant-other', name: 'Foreign Service', duration: 45, price: 40 },
  });
  await prisma.employee.create({
    data: { id: 'emp-ten', tenantId: 'tenant-demo', userId: 'usr-employee', name: 'Linked Employee', email: 'linked@test.com' },
  });
  await prisma.employee.create({
    data: { id: 'emp-unlinked', tenantId: 'tenant-demo', userId: null, name: 'Unlinked Employee' },
  });
  await prisma.employee.create({
    data: { id: 'emp-inactive', tenantId: 'tenant-demo', userId: null, name: 'Inactive Employee', isActive: false },
  });
  await prisma.employee.create({
    data: { id: 'emp-other', tenantId: 'tenant-other', userId: null, name: 'Other Employee' },
  });
});

afterAll(async () => {
  await prisma.employee.deleteMany();
  await prisma.service.deleteMany();
  await prisma.bitacora.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
});

describe('GET /api/v1/employees', () => {
  it('owner → 200 con solo los activos de su tenant', async () => {
    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.map((e: { id: string }) => e.id).sort();
    expect(ids).toEqual(['emp-ten', 'emp-unlinked']);
    expect(res.body[0].tenantId).toBe('tenant-demo');
  });

  it('owner con ?includeInactive=true → incluye inactivos', async () => {
    const res = await request(app)
      .get('/api/v1/employees?includeInactive=true')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.map((e: { id: string }) => e.id).sort();
    expect(ids).toEqual(['emp-inactive', 'emp-ten', 'emp-unlinked']);
  });

  it('employee → 200 y solo se ve a sí mismo (self-view DoD)', async () => {
    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('emp-ten');
    expect(res.body[0].userId).toBe('usr-employee');
  });

  it('employee con ?includeInactive=true → sigue viendo solo su registro activo', async () => {
    const res = await request(app)
      .get('/api/v1/employees?includeInactive=true')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.map((e: { id: string }) => e.id)).toEqual(['emp-ten']);
  });

  it('admin (plataforma) → 403 Tenant scope required', async () => {
    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Tenant scope required');
  });

  it('sin token → 401', async () => {
    const res = await request(app).get('/api/v1/employees');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/employees/:id', () => {
  it('owner → 200 con el empleado de su tenant', async () => {
    const res = await request(app)
      .get('/api/v1/employees/emp-ten')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Linked Employee');
    expect(res.body.email).toBe('linked@test.com');
    expect(res.body.offersAllServices).toBe(true);
    expect(res.body.serviceIds).toEqual([]);
    expect(res.body.isActive).toBe(true);
  });

  it('empleado inactivo → 200 (el detalle lo devuelve)', async () => {
    const res = await request(app)
      .get('/api/v1/employees/emp-inactive')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it('employee ve su propio detalle → 200', async () => {
    const res = await request(app)
      .get('/api/v1/employees/emp-ten')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('emp-ten');
  });

  it('employee no ve el detalle de otros → 404', async () => {
    const res = await request(app)
      .get('/api/v1/employees/emp-unlinked')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Employee not found');
  });

  it('empleado de otro tenant → 404 (no filtra existencia)', async () => {
    const res = await request(app)
      .get('/api/v1/employees/emp-other')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Employee not found');
  });

  it('empleado inexistente → 404', async () => {
    const res = await request(app)
      .get('/api/v1/employees/emp-404')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });

  it('admin → 403', async () => {
    const res = await request(app)
      .get('/api/v1/employees/emp-ten')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/employees', () => {
  it('owner crea un empleado → 201 con tenantId inyectado y defaults', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'New Employee', email: 'new@test.com', phone: '+34600000000' });

    expect(res.status).toBe(201);
    expect(res.body.id.startsWith('emp-')).toBe(true);
    expect(res.body.tenantId).toBe('tenant-demo');
    expect(res.body.name).toBe('New Employee');
    expect(res.body.userId).toBeNull();
    expect(res.body.offersAllServices).toBe(true);
    expect(res.body.isActive).toBe(true);
  });

  it('crear con serviceIds → conexión M2M verificada en BD', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Stylist', offersAllServices: false, serviceIds: ['svc-ten'] });

    expect(res.status).toBe(201);
    expect(res.body.offersAllServices).toBe(false);
    expect(res.body.serviceIds).toEqual(['svc-ten']);

    const row = await prisma.employee.findUnique({
      where: { id: res.body.id },
      include: { services: true },
    });
    expect(row?.services.map((s) => s.id)).toEqual(['svc-ten']);
  });

  it('serviceIds de otro tenant → 400', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Stylist', offersAllServices: false, serviceIds: ['svc-foreign'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('serviceIds must reference services of this tenant');
  });

  it('crear con userId → FK asignada', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Linked Again', userId: 'usr-spare' });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe('usr-spare');

    const row = await prisma.employee.findUnique({ where: { id: res.body.id } });
    expect(row?.userId).toBe('usr-spare');
  });

  it('userId ya vinculado a otro empleado → 400 (unique 1:1)', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Duplicate Link', userId: 'usr-employee' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('userId is already linked to another employee');
  });

  it('userId inexistente → 400', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Bad Link', userId: 'usr-404' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('userId does not reference an existing user');
  });

  it('userId de otro tenant → 400', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Bad Link', userId: 'usr-other' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('userId must belong to the same tenant');
  });

  it('name inválido → 400', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'ab' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Employee name must be at least 3 characters');
  });

  it('admin → 403', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Nope' });

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/employees/:id', () => {
  it('owner actualiza → 200', async () => {
    const res = await request(app)
      .put('/api/v1/employees/emp-unlinked')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Updated Employee', phone: '+34600000001', isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Employee');
    expect(res.body.phone).toBe('+34600000001');
    expect(res.body.isActive).toBe(false);
  });

  it('actualizar a offersAllServices = true limpia la M2M', async () => {
    const created = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Stylist', offersAllServices: false, serviceIds: ['svc-ten'] });

    const res = await request(app)
      .put(`/api/v1/employees/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ offersAllServices: true });

    expect(res.status).toBe(200);
    expect(res.body.offersAllServices).toBe(true);
    expect(res.body.serviceIds).toEqual([]);

    const row = await prisma.employee.findUnique({
      where: { id: created.body.id },
      include: { services: true },
    });
    expect(row?.services).toHaveLength(0);
  });

  it('serviceIds de otro tenant en update → 400', async () => {
    const res = await request(app)
      .put('/api/v1/employees/emp-unlinked')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ offersAllServices: false, serviceIds: ['svc-foreign'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('serviceIds must reference services of this tenant');
  });

  it('empleado de otro tenant → 404', async () => {
    const res = await request(app)
      .put('/api/v1/employees/emp-other')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Hacked' });

    expect(res.status).toBe(404);
  });

  it('admin → 403', async () => {
    const res = await request(app)
      .put('/api/v1/employees/emp-ten')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Nope' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/employees/:id (soft delete)', () => {
  it('owner elimina → 204 y isActive=false en BD (la fila sigue)', async () => {
    const res = await request(app)
      .delete('/api/v1/employees/emp-ten')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(204);

    const row = await prisma.employee.findUnique({ where: { id: 'emp-ten' } });
    expect(row).not.toBeNull();
    expect(row?.isActive).toBe(false);

    const detail = await request(app)
      .get('/api/v1/employees/emp-ten')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.isActive).toBe(false);

    const list = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.body.map((e: { id: string }) => e.id)).toEqual(['emp-unlinked']);
  });

  it('el soft delete conserva la conexión M2M', async () => {
    const created = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Stylist', offersAllServices: false, serviceIds: ['svc-ten'] });

    await request(app)
      .delete(`/api/v1/employees/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const row = await prisma.employee.findUnique({
      where: { id: created.body.id },
      include: { services: true },
    });
    expect(row?.isActive).toBe(false);
    expect(row?.services.map((s) => s.id)).toEqual(['svc-ten']);
  });

  it('empleado de otro tenant → 404 y sigue existiendo', async () => {
    const res = await request(app)
      .delete('/api/v1/employees/emp-other')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);

    const foreign = await prisma.employee.findUnique({ where: { id: 'emp-other' } });
    expect(foreign).not.toBeNull();
    expect(foreign?.isActive).toBe(true);
  });

  it('empleado inexistente → 404', async () => {
    const res = await request(app)
      .delete('/api/v1/employees/emp-404')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });

  it('admin → 403', async () => {
    const res = await request(app)
      .delete('/api/v1/employees/emp-ten')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/employees (aislamiento cross-tenant en list)', () => {
  it('owner de otro tenant no ve empleados ajenos', async () => {
    const res = await request(app)
      .get('/api/v1/employees?includeInactive=true')
      .set('Authorization', `Bearer ${otherOwnerToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.map((e: { id: string }) => e.id);
    expect(ids).toEqual(['emp-other']);
  });
});
