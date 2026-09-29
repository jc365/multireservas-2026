/**
 * @file tenants.test.ts
 * @module tests/integration/api/v1/tenants
 *
 * GET/PUT /api/v1/tenants/me (F3.4): tenant completo sin
 * empleados/servicios, validación doble (400), regeneración de
 * RRules al guardar, permisos (owner edita, employee solo lee,
 * admin fuera por tenantScope) y bitácora update_tenant_config.
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
const ghostToken = generateToken('usr-ghost', 'tenant-ghost', 'owner');

const RAW_SCHEDULES = [
  {
    label: 'Horario semanal',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    start: '09:00',
    end: '18:00',
    breaks: [{ start: '13:00', end: '14:00' }],
  },
  {
    label: 'Sábado',
    days: ['sat'],
    start: '10:00',
    end: '14:00',
    breaks: [],
  },
];

const RAW_HOLIDAYS = [
  { label: 'Navidad', date: '2026-12-25', recurring: true },
  { label: 'Puente local', date: '2026-10-12', recurring: false },
];

beforeEach(async () => {
  await prisma.bitacora.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  await prisma.tenant.create({
    data: {
      id: 'tenant-demo',
      name: 'Tenant Demo',
      slug: 'demo',
      currency: 'EUR',
      timezone: 'UTC',
      settings: { requireClientPhone: true },
      schedules: RAW_SCHEDULES,
      holidays: RAW_HOLIDAYS,
    },
  });
  await prisma.tenant.create({
    data: { id: 'tenant-other', name: 'Tenant Other', slug: 'other' },
  });
  await prisma.user.createMany({
    data: [
      { id: 'usr-owner', name: 'Owner', email: 'owner@test.com', password: 'hash', role: 'owner', tenantId: 'tenant-demo' },
      { id: 'usr-employee', name: 'Employee', email: 'employee@test.com', password: 'hash', role: 'employee', tenantId: 'tenant-demo' },
      { id: 'usr-admin', name: 'Admin', email: 'admin@test.com', password: 'hash', role: 'admin' },
      { id: 'usr-other', name: 'Other Owner', email: 'other@test.com', password: 'hash', role: 'owner', tenantId: 'tenant-other' },
    ],
  });
});

afterAll(async () => {
  await prisma.bitacora.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
});

describe('GET /api/v1/tenants/me', () => {
  it('owner → 200 con el tenant completo saneado y rrules derivadas', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'tenant-demo',
      name: 'Tenant Demo',
      slug: 'demo',
      currency: 'EUR',
      timezone: 'UTC',
      isActive: true,
    });
    expect(res.body.settings).toMatchObject({
      slotDuration: 15,
      maxServiceDuration: 180,
      clientDataRetention: 'nextMonth',
      defaultLanguage: 'en',
      requireClientPhone: true,
      requireClientEmail: false,
    });
    expect(res.body.schedules).toHaveLength(2);
    expect(res.body.schedules[0]).toMatchObject({
      label: 'Horario semanal',
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      start: '09:00',
      end: '18:00',
      breaks: [{ start: '13:00', end: '14:00' }],
      rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    });
    expect(res.body.schedules[1].rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=SA');
    expect(res.body.holidays).toHaveLength(2);
    expect(res.body.holidays[0].rrule).toBe('RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25');
    expect(res.body.holidays[1].rrule).toBe('DTSTART;VALUE=DATE:20261012');
    expect(res.body).not.toHaveProperty('employees');
    expect(res.body).not.toHaveProperty('services');
    expect(res.body).toHaveProperty('createdAt');
    expect(res.body).toHaveProperty('updatedAt');
  });

  it('employee → 200 (lectura para los flags de CreateReservation, #12)', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('tenant-demo');
    expect(res.body.settings.requireClientPhone).toBe(true);
  });

  it('admin (plataforma) → 403 Tenant scope required', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Tenant scope required');
  });

  it('sin token → 401', async () => {
    const res = await request(app).get('/api/v1/tenants/me');
    expect(res.status).toBe(401);
  });

  it('token con tenant inexistente → 404 Tenant not found', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${ghostToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Tenant not found');
  });

  it('aislamiento: other owner ve SU tenant, no tenant-demo', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${otherOwnerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('tenant-other');
    expect(res.body.schedules).toEqual([]);
    expect(res.body.holidays).toEqual([]);
  });
});

describe('PUT /api/v1/tenants/me', () => {
  const payload = {
    name: 'Renombrado',
    currency: 'USD',
    timezone: 'America/New_York',
    settings: {
      slotDuration: 30,
      maxServiceDuration: 240,
      clientDataRetention: 'never',
      defaultLanguage: 'es',
      requireClientPhone: false,
      requireClientEmail: true,
    },
    schedules: [
      {
        label: 'Tarde',
        days: ['tue', 'thu'],
        start: '15:00',
        end: '20:00',
        breaks: [{ start: '17:00', end: '17:30' }],
      },
    ],
    holidays: [{ label: 'Año Nuevo', date: '2027-01-01', recurring: true }],
  };

  async function getToken(role: 'owner' | 'employee' | 'admin' | 'otherOwner'): Promise<string> {
    if (role === 'owner') return ownerToken;
    if (role === 'employee') return employeeToken;
    if (role === 'admin') return adminToken;
    return otherOwnerToken;
  }

  it('owner → 200, persiste todo en un solo guardado con rrules y registra bitácora', async () => {
    const res = await request(app)
      .put('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'tenant-demo',
      name: 'Renombrado',
      slug: 'demo',
      currency: 'USD',
      timezone: 'America/New_York',
      settings: payload.settings,
    });
    expect(res.body.schedules[0].rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=TU,TH');
    expect(res.body.holidays[0].rrule).toBe('RRULE:FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1');

    const get = await request(app)
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(get.status).toBe(200);
    expect(get.body.name).toBe('Renombrado');
    expect(get.body.settings.slotDuration).toBe(30);
    expect(get.body.schedules).toHaveLength(1);
    expect(get.body.holidays).toHaveLength(1);

    const row = await prisma.tenant.findUnique({ where: { id: 'tenant-demo' } });
    expect(row?.name).toBe('Renombrado');
    expect(row?.currency).toBe('USD');
    expect((row?.schedules as Array<{ rrule: string }>)[0].rrule).toBe(
      'RRULE:FREQ=WEEKLY;BYDAY=TU,TH'
    );

    const bitacora = await prisma.bitacora.findFirst({
      where: { action: 'update_tenant_config' },
    });
    expect(bitacora).not.toBeNull();
    expect(bitacora?.userId).toBe('usr-owner');
    expect(bitacora?.entityType).toBe('tenant');
    expect(bitacora?.entityId).toBe('tenant-demo');
  });

  it('employee → 403 Owner access required (no edita)', async () => {
    const token = await getToken('employee');
    const res = await request(app)
      .put('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Owner access required');

    const row = await prisma.tenant.findUnique({ where: { id: 'tenant-demo' } });
    expect(row?.name).toBe('Tenant Demo');
  });

  it('admin → 403 Tenant scope required', async () => {
    const token = await getToken('admin');
    const res = await request(app)
      .put('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Tenant scope required');
  });

  it('sin token → 401', async () => {
    const res = await request(app).put('/api/v1/tenants/me').send(payload);
    expect(res.status).toBe(401);
  });

  describe('validación → 400 sin tocar la BD', () => {
    async function expectRejected(badPayload: Record<string, unknown>, message: string) {
      const res = await request(app)
        .put('/api/v1/tenants/me')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(badPayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain(message);

      const row = await prisma.tenant.findUnique({ where: { id: 'tenant-demo' } });
      expect(row?.name).toBe('Tenant Demo');
      expect(row?.currency).toBe('EUR');
      const bitacora = await prisma.bitacora.findFirst({
        where: { action: 'update_tenant_config' },
      });
      expect(bitacora).toBeNull();
    }

    it('slotDuration fuera del set (DoD)', async () => {
      await expectRejected(
        { ...payload, settings: { ...payload.settings, slotDuration: 20 } },
        'slotDuration must be one of 15, 30, 45 or 60'
      );
    });

    it('maxServiceDuration que no es múltiplo del slot', async () => {
      await expectRejected(
        { ...payload, settings: { slotDuration: 30, maxServiceDuration: 45 } },
        'maxServiceDuration must be a multiple of slotDuration'
      );
    });

    it('timezone no IANA (DoD)', async () => {
      await expectRejected(
        { ...payload, timezone: 'Not/AZone' },
        'timezone must be a valid IANA time zone'
      );
    });

    it('schedule start >= end (DoD)', async () => {
      await expectRejected(
        {
          ...payload,
          schedules: [
            { label: 'Roto', days: ['mon'], start: '18:00', end: '09:00', breaks: [] },
          ],
        },
        'schedule start must be before schedule end'
      );
    });

    it('holiday con fecha inexistente', async () => {
      await expectRejected(
        { ...payload, holidays: [{ label: 'X', date: '2026-02-31', recurring: false }] },
        'holiday date must be a valid YYYY-MM-DD date'
      );
    });

    it('perfil: name vacío y currency fuera de enum', async () => {
      await expectRejected(
        { ...payload, name: '   ' },
        'Tenant name is required'
      );
      await expectRejected(
        { ...payload, currency: 'JPY' },
        'currency must be EUR, USD or GBP'
      );
    });
  });

  it('tenant inexistente → 404', async () => {
    const res = await request(app)
      .put('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${ghostToken}`)
      .send(payload);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Tenant not found');
  });

  it('body vacío → 400 (perfil obligatorio)', async () => {
    const res = await request(app)
      .put('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Tenant name is required');
  });
});
