/**
 * @file LoginUseCase.test.ts
 * @module tests/unit/application/use-cases/auth
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LoginUseCase } from '../../../../../backend/src/application/use-cases/LoginUseCase';
import type IUserRepository from '../../../../../backend/src/application/interfaces/IUserRepository';
import type HashService from '../../../../../backend/src/infrastructure/security/HashService';
import User from '../../../../../backend/src/domain/entities/User';
import Email from '../../../../../backend/src/domain/value-objects/Email';
import FullName from '../../../../../backend/src/domain/value-objects/FullName';
import type { UserRole } from '../../../../../backend/src/domain/entities/User';
import { decodePayload } from '../../../../helpers/jwt';

const makeDemoUser = (id: string, email: string, role: UserRole, tenantId: string | null = null): User =>
  User.create(FullName.create('Demo User'), Email.create(email), 'hash-bcrypt', id, role, tenantId);

const DEMO_LOGINS: Array<{ xUserId: string; email: string; userId: string; role: UserRole }> = [
  { xUserId: 'owner', email: 'owner@demo.com', userId: 'usr-demo-owner', role: 'owner' },
  { xUserId: 'employee', email: 'employee@demo.com', userId: 'usr-demo-employee', role: 'employee' },
  { xUserId: 'admin', email: 'admin@demo.com', userId: 'usr-demo-admin', role: 'admin' },
  { xUserId: 'client', email: 'client@demo.com', userId: 'usr-demo-client', role: 'client' },
];

describe('LoginUseCase', () => {
  let userRepository: jest.Mocked<IUserRepository>;
  let hashService: jest.Mocked<HashService>;
  let useCase: LoginUseCase;

  beforeEach(() => {
    userRepository = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findAll: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    hashService = {
      hash: vi.fn(),
      compare: vi.fn(),
    } as unknown as jest.Mocked<HashService>;
    useCase = new LoginUseCase(userRepository, hashService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('demo login via xUserId', () => {
    it.each(DEMO_LOGINS)(
      'logs in $xUserId and returns token for $role',
      async ({ xUserId, email, userId, role }) => {
        userRepository.findByEmail.mockResolvedValue(makeDemoUser(userId, email, role));

        const result = await useCase.execute({ xUserId });

        expect(userRepository.findByEmail).toHaveBeenCalledWith(email);
        expect(result.userId).toBe(userId);
        expect(result.token).toEqual(expect.any(String));
        expect(result.token.length).toBeGreaterThan(0);

        const payload = decodePayload(result.token);
        expect(payload).toMatchObject({ userId, tenantId: null, role });
      }
    );

    it('token incluye tenantId cuando el usuario tiene tenant (SF4)', async () => {
      userRepository.findByEmail.mockResolvedValue(
        makeDemoUser('usr-demo-owner', 'owner@demo.com', 'owner', 'ten-42')
      );

      const result = await useCase.execute({ xUserId: 'owner' });

      const payload = decodePayload(result.token);
      expect(payload).toMatchObject({ userId: 'usr-demo-owner', tenantId: 'ten-42', role: 'owner' });
    });

    it('rejects unknown xUserId', async () => {
      await expect(useCase.execute({ xUserId: 'nope' })).rejects.toThrow('Invalid demo role');
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
    });

    it.each(['user', 'guest'])('rejects legacy alias %s (eliminated in SF3b)', async (xUserId) => {
      await expect(useCase.execute({ xUserId })).rejects.toThrow('Invalid demo role');
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
    });

    it('rejects when demo user is missing in DB', async () => {
      userRepository.findByEmail.mockResolvedValue(null);

      await expect(useCase.execute({ xUserId: 'owner' })).rejects.toThrow('Invalid credentials');
    });
  });

  describe('demo mode disabled', () => {
    it('rejects xUserId when DEMO_MODE is off', async () => {
      vi.resetModules();
      const previous = process.env.DEMO_MODE;
      delete process.env.DEMO_MODE;

      try {
        const { LoginUseCase: FreshLoginUseCase } = await import(
          '../../../../../backend/src/application/use-cases/LoginUseCase'
        );
        const fresh = new FreshLoginUseCase(userRepository, hashService);
        await expect(fresh.execute({ xUserId: 'admin' })).rejects.toThrow('Demo mode is disabled');
        expect(userRepository.findByEmail).not.toHaveBeenCalled();
      } finally {
        if (previous === undefined) delete process.env.DEMO_MODE;
        else process.env.DEMO_MODE = previous;
      }
    });
  });

  describe('password login', () => {
    it('returns token when password matches', async () => {
      const user = makeDemoUser('usr-1', 'jane@test.com', 'client');
      userRepository.findByEmail.mockResolvedValue(user);
      hashService.compare.mockResolvedValue(true);

      const result = await useCase.execute({ email: 'jane@test.com', password: 'secret123' });

      expect(hashService.compare).toHaveBeenCalledWith('secret123', 'hash-bcrypt');
      expect(result.userId).toBe('usr-1');
      expect(result.token).toEqual(expect.any(String));

      const payload = decodePayload(result.token);
      expect(payload).toMatchObject({ userId: 'usr-1', tenantId: null, role: 'client' });
    });

    it('rejects invalid credentials when password does not match', async () => {
      userRepository.findByEmail.mockResolvedValue(
        makeDemoUser('usr-1', 'jane@test.com', 'client')
      );
      hashService.compare.mockResolvedValue(false);

      await expect(
        useCase.execute({ email: 'jane@test.com', password: 'wrong' })
      ).rejects.toThrow('Invalid credentials');
    });

    it('rejects invalid credentials when user does not exist', async () => {
      userRepository.findByEmail.mockResolvedValue(null);

      await expect(
        useCase.execute({ email: 'nobody@test.com', password: 'x' })
      ).rejects.toThrow('Invalid credentials');
    });

    it('requires email and password', async () => {
      await expect(useCase.execute({})).rejects.toThrow('Email and password are required');
    });
  });
});
