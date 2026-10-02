/**
 * @file auth.test.ts
 * @module tests/integration/api/v1/auth
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../backend/src/index';
import prisma from '../../../../backend/src/infrastructure/persistence/prismaClient';
import HashService from '../../../../backend/src/infrastructure/security/HashService';
import { signLegacyToken, signPayload, decodePayload } from '../../../helpers/jwt';

interface DemoUser {
  xUserId: string;
  id: string;
  email: string;
  role: 'owner' | 'employee' | 'admin' | 'client';
}

const DEMO_USERS: DemoUser[] = [
  { xUserId: 'owner', id: 'usr-demo-owner', email: 'owner@demo.com', role: 'owner' },
  { xUserId: 'employee', id: 'usr-demo-employee', email: 'employee@demo.com', role: 'employee' },
  { xUserId: 'admin', id: 'usr-demo-admin', email: 'admin@demo.com', role: 'admin' },
  { xUserId: 'client', id: 'usr-demo-client', email: 'client@demo.com', role: 'client' },
];

beforeEach(async () => {
  await prisma.bitacora.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.user.createMany({
    data: DEMO_USERS.map((d) => ({
      id: d.id,
      name: `Demo ${d.role}`,
      email: d.email,
      password: 'hash',
      role: d.role,
    })),
  });
});

afterAll(async () => {
  await prisma.bitacora.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
});

describe('POST /api/v1/auth/login (demo xUserId)', () => {
  DEMO_USERS.forEach(({ xUserId, id, email, role }) => {
    it(`logs in as ${xUserId} → token + role ${role}`, async () => {
      const login = await request(app).post('/api/v1/auth/login').send({ xUserId });

      expect(login.status).toBe(200);
      expect(login.body.token).toEqual(expect.any(String));
      expect(login.body.userId).toBe(id);

      const me = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${login.body.token}`);

      expect(me.status).toBe(200);
      expect(me.body.id).toBe(id);
      expect(me.body.email).toBe(email);
      expect(me.body.role).toBe(role);
    });
  });

  it.each(['user', 'guest'])('legacy alias %s ya no existe → 401 (SF3b)', async (xUserId) => {
    const login = await request(app).post('/api/v1/auth/login').send({ xUserId });

    expect(login.status).toBe(401);
  });

  it('rejects unknown xUserId (401)', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ xUserId: 'nope' });

    expect(login.status).toBe(401);
  });
});

describe('POST /api/v1/auth/login (password)', () => {
  it('logs in with email + password → 200 + role via /users/me', async () => {
    const hash = await new HashService().hash('secret123');
    await prisma.user.create({
      data: {
        id: 'usr-pw',
        name: 'Password User',
        email: 'pw@test.com',
        password: hash,
        role: 'employee',
      },
    });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'pw@test.com', password: 'secret123' });

    expect(login.status).toBe(200);
    expect(login.body.userId).toBe('usr-pw');

    const me = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(me.status).toBe(200);
    expect(me.body.role).toBe('employee');
  });

  it('rejects wrong password (401)', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@demo.com', password: 'wrong' });

    expect(login.status).toBe(401);
  });

  it('requires email and password (400 VALIDATION_ERROR, F4.2)', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({});

    expect(login.status).toBe(400);
    expect(login.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Email and password are required',
    });
  });
});

describe('JWT payload (SF4: userId + tenantId + role)', () => {
  DEMO_USERS.forEach(({ xUserId, id, role }) => {
    it(`login ${xUserId} → payload con los 3 campos`, async () => {
      const login = await request(app).post('/api/v1/auth/login').send({ xUserId });

      expect(login.status).toBe(200);
      const payload = decodePayload(login.body.token);
      expect(payload.userId).toBe(id);
      expect(payload.tenantId).toBeNull();
      expect(payload.role).toBe(role);
    });
  });

  it('usuario con tenant → tenantId en el payload', async () => {
    await prisma.tenant.deleteMany();
    await prisma.tenant.create({ data: { id: 'ten-1', name: 'Tenant One' } });
    const hash = await new HashService().hash('secret123');
    await prisma.user.create({
      data: { id: 'usr-ten', name: 'Tenant User', email: 'ten@test.com', password: hash, role: 'owner', tenantId: 'ten-1' },
    });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ten@test.com', password: 'secret123' });

    expect(login.status).toBe(200);
    const payload = decodePayload(login.body.token);
    expect(payload).toMatchObject({ userId: 'usr-ten', tenantId: 'ten-1', role: 'owner' });
  });
});

describe('política de tokens antiguos (SF4: rechazar)', () => {
  it('token con formato antiguo { userId } → 401 en /users/me', async () => {
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${signLegacyToken('usr-demo-admin')}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: 'UNAUTHORIZED', message: 'Invalid token' });
  });

  it('token con formato antiguo → 401 también en ruta sensible', async () => {
    const res = await request(app)
      .get('/api/v1/admin/bitacora')
      .set('Authorization', `Bearer ${signLegacyToken('usr-demo-admin')}`);

    expect(res.status).toBe(401);
  });
});

describe('D4 híbrido: adminMiddleware confía en DB, no en el rol del token', () => {
  it('token dice admin pero en DB es employee → 403', async () => {
    await prisma.user.create({
      data: { id: 'usr-emp', name: 'Employee', email: 'emp@test.com', password: 'hash', role: 'employee' },
    });
    const forged = signPayload({ userId: 'usr-emp', tenantId: null, role: 'admin' });

    const res = await request(app)
      .get('/api/v1/admin/bitacora')
      .set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('admin role required');
  });

  it('token y DB admin → 200', async () => {
    await prisma.user.create({
      data: { id: 'usr-adm', name: 'Admin', email: 'adm@test.com', password: 'hash', role: 'admin' },
    });
    const token = signPayload({ userId: 'usr-adm', tenantId: null, role: 'admin' });

    const res = await request(app)
      .get('/api/v1/admin/bitacora')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('DB admin con token role=employee → 200 (la DB es la verdad en sensibles)', async () => {
    await prisma.user.create({
      data: { id: 'usr-adm2', name: 'Admin Two', email: 'adm2@test.com', password: 'hash', role: 'admin' },
    });
    const token = signPayload({ userId: 'usr-adm2', tenantId: null, role: 'employee' });

    const res = await request(app)
      .get('/api/v1/admin/bitacora')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

// ============================================
// F4.4a — Registro público + verificación de email
// ============================================

const registerBody = {
  email: 'newowner@test.com',
  password: 'secret123',
  ownerName: 'New Owner',
  businessName: 'Mi Café Peluquería',
};

async function register(body = registerBody) {
  return request(app).post('/api/v1/auth/register').send(body);
}

describe('POST /auth/register (F4.4a)', () => {
  it('registro → 201 + JWT auto-login (role owner) + login con password', async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.userId).toEqual(expect.stringMatching(/^usr-/));
    expect(res.body.tenantId).toEqual(expect.stringMatching(/^ten-/));
    expect(res.body.role).toBe('owner');

    const payload = decodePayload(res.body.token);
    expect(payload).toMatchObject({
      userId: res.body.userId,
      tenantId: res.body.tenantId,
      role: 'owner',
    });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: registerBody.email, password: registerBody.password });
    expect(login.status).toBe(200);
    expect(login.body.userId).toBe(res.body.userId);
  });

  it('email ya registrado → 409 USER_EMAIL_EXISTS', async () => {
    expect((await register()).status).toBe(201);

    const again = await register();

    expect(again.status).toBe(409);
    expect(again.body.error).toEqual({
      code: 'USER_EMAIL_EXISTS',
      message: 'email is already registered',
    });
  });

  it('password corta → 400 VALIDATION_ERROR', async () => {
    const res = await register({ ...registerBody, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('at least 8 characters');
  });

  it('campos ausentes → 400', async () => {
    const res = await register({ email: '', password: '', ownerName: '', businessName: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('flujo de verificación de email (F4.4a)', () => {
  it('registro → bloqueos 403 → verify → desbloqueo completo', async () => {
    const reg = await register();
    expect(reg.status).toBe(201);
    const auth = { Authorization: `Bearer ${reg.body.token}` };

    // 1. GET /tenants/me → emailVerified false y SIN la clave/token
    const me = await request(app).get('/api/v1/tenants/me').set(auth);
    expect(me.status).toBe(200);
    expect(me.body.settings.emailVerified).toBe(false);
    expect(me.body.settings.email_verification).toBeUndefined();

    // 2. Rutas de edición bloqueadas → 403 EMAIL_NOT_VERIFIED
    const svc = await request(app)
      .post('/api/v1/services')
      .set(auth)
      .send({ name: 'Corte', duration: 30 });
    expect(svc.status).toBe(403);
    expect(svc.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const emp = await request(app).post('/api/v1/employees').set(auth).send({ name: 'Ana' });
    expect(emp.status).toBe(403);
    expect(emp.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const put = await request(app)
      .put('/api/v1/tenants/me')
      .set(auth)
      .send({
        name: 'Renombrado',
        currency: 'EUR',
        timezone: 'UTC',
        settings: {},
        schedules: [],
        holidays: [],
      });
    expect(put.status).toBe(403);
    expect(put.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    // 3. GET libre (listados sin comprobar nada)
    const services = await request(app).get('/api/v1/services').set(auth);
    expect(services.status).toBe(200);
    expect(services.body).toEqual([]);

    // 4. Resend → 200 y envía (provider console)
    const resend = await request(app).post('/api/v1/auth/resend-verification').set(auth);
    expect(resend.status).toBe(200);
    expect(resend.body).toEqual({ sent: true });

    // 5. El token (rotado) vive solo en la BD; nunca en la respuesta
    const row = await prisma.tenant.findUnique({ where: { id: reg.body.tenantId } });
    const settings = row!.settings as { email_verification?: { token: string } };
    const token = settings.email_verification!.token;
    expect(token).toEqual(expect.any(String));

    const me2 = await request(app).get('/api/v1/tenants/me').set(auth);
    expect(JSON.stringify(me2.body)).not.toContain(token);

    // 6. Verify válido → 200 tenant completo con emailVerified true
    const verify = await request(app)
      .post('/api/v1/tenants/verify-email')
      .set(auth)
      .send({ token });
    expect(verify.status).toBe(200);
    expect(verify.body.settings.emailVerified).toBe(true);
    expect(verify.body.settings.email_verification).toBeUndefined();
    expect(JSON.stringify(verify.body)).not.toContain(token);

    // 7. Token ya usado → 400 EMAIL_VERIFICATION_INVALID_TOKEN
    const again = await request(app)
      .post('/api/v1/tenants/verify-email')
      .set(auth)
      .send({ token });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('EMAIL_VERIFICATION_INVALID_TOKEN');

    // 8. Resend tras verificar → 200 no-op silencioso { sent: false }
    const resend2 = await request(app).post('/api/v1/auth/resend-verification').set(auth);
    expect(resend2.status).toBe(200);
    expect(resend2.body).toEqual({ sent: false });

    // 9. Desbloqueado: PUT + POST /services + POST /employees
    const put2 = await request(app)
      .put('/api/v1/tenants/me')
      .set(auth)
      .send({
        name: 'Mi Café Peluquería',
        currency: 'EUR',
        timezone: 'UTC',
        settings: { slotDuration: 30 },
        schedules: [],
        holidays: [],
      });
    expect(put2.status).toBe(200);
    expect(put2.body.settings.emailVerified).toBe(true);
    expect(put2.body.settings.slotDuration).toBe(30);

    const svc2 = await request(app)
      .post('/api/v1/services')
      .set(auth)
      .send({ name: 'Corte', duration: 30 });
    expect(svc2.status).toBe(201);

    const emp2 = await request(app).post('/api/v1/employees').set(auth).send({ name: 'Ana' });
    expect(emp2.status).toBe(201);
  });

  it('token caducado → 400 EMAIL_VERIFICATION_EXPIRED', async () => {
    const reg = await register({
      ...registerBody,
      email: 'expired@test.com',
      businessName: 'Otro Negocio',
    });
    expect(reg.status).toBe(201);

    const expiredToken = 'tok-expired';
    await prisma.tenant.update({
      where: { id: reg.body.tenantId },
      data: {
        settings: {
          email_verification: {
            token: expiredToken,
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
      },
    });

    const res = await request(app)
      .post('/api/v1/tenants/verify-email')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ token: expiredToken });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMAIL_VERIFICATION_EXPIRED');
  });

  it('admin con X-Tenant-Id está exento del bloqueo', async () => {
    await prisma.tenant.create({
      data: {
        id: 'ten-pending',
        name: 'Pending Biz',
        settings: {
          email_verification: {
            token: 'tok-manual',
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
        },
      },
    });

    const login = await request(app).post('/api/v1/auth/login').send({ xUserId: 'admin' });
    expect(login.status).toBe(200);

    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${login.body.token}`)
      .set('X-Tenant-Id', 'ten-pending')
      .send({ name: 'Corte Admin', duration: 30 });

    expect(res.status).toBe(201);

    // El owner (sin verificar) sigue bloqueado en ese mismo tenant
    const ownerHash = await new HashService().hash('secret123');
    await prisma.user.create({
      data: {
        id: 'usr-pending-owner',
        name: 'Pending Owner',
        email: 'pending-owner@test.com',
        password: ownerHash,
        role: 'owner',
        tenantId: 'ten-pending',
      },
    });
    const ownerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'pending-owner@test.com', password: 'secret123' });
    expect(ownerLogin.status).toBe(200);

    const ownerSvc = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${ownerLogin.body.token}`)
      .send({ name: 'Corte Owner', duration: 30 });
    expect(ownerSvc.status).toBe(403);
    expect(ownerSvc.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });
});
