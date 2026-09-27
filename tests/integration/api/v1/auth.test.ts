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
  await prisma.user.deleteMany();
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
  await prisma.user.deleteMany();
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

  it('requires email and password (401)', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({});

    expect(login.status).toBe(401);
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
    expect(res.body.error).toBe('Invalid token');
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
    expect(res.body.error).toContain('admin role required');
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
