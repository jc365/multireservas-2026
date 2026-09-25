import { vi } from 'vitest';
import { CreateUserUseCase } from '../../../../backend/src/application/use-cases/CreateUserUseCase';
import IUserRepository from '../../../../backend/src/application/interfaces/IUserRepository';
import User from '../../../../backend/src/domain/entities/User';
import Email from '../../../../backend/src/domain/value-objects/Email';
import FullName from '../../../../backend/src/domain/value-objects/FullName';
import BitacoraService from '../../../../backend/src/infrastructure/logging/BitacoraService';
import HashService from '../../../../backend/src/infrastructure/security/HashService';

describe('CreateUserUseCase', () => {
  let useCase: CreateUserUseCase;
  let userRepo: jest.Mocked<IUserRepository>;
  let bitacoraService: jest.Mocked<BitacoraService>;
  let hashService: jest.Mocked<HashService>;

  beforeEach(() => {
    userRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findAll: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    bitacoraService = {
      log: vi.fn(),
    } as unknown as jest.Mocked<BitacoraService>;
    hashService = {
      hash: vi.fn().mockResolvedValue('$2b$10$hashedpassword'),
      compare: vi.fn(),
    } as unknown as jest.Mocked<HashService>;
    useCase = new CreateUserUseCase(userRepo, bitacoraService, hashService);
  });

  it('should create a user with provided id', async () => {
    userRepo.findByEmail.mockResolvedValue(null);
    userRepo.save.mockResolvedValue();

    const result = await useCase.execute({
      id: 'usr-1',
      name: 'Jane Doe',
      email: 'jane@test.com',
      password: 'secret123',
    });

    expect(result.id).toBe('usr-1');
    expect(result.name.getValue()).toBe('Jane Doe');
    expect(result.email.getValue()).toBe('jane@test.com');
    expect(hashService.hash).toHaveBeenCalledWith('secret123');
    expect(userRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should create a user without id (auto-generate)', async () => {
    userRepo.findByEmail.mockResolvedValue(null);
    userRepo.save.mockResolvedValue();

    const result = await useCase.execute({
      name: 'Jane Doe',
      email: 'jane@test.com',
      password: 'secret123',
    });

    expect(result.id).toBeDefined();
    expect(result.id.startsWith('usr-')).toBe(true);
    expect(result.name.getValue()).toBe('Jane Doe');
    expect(userRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should throw when email is already registered', async () => {
    const hash = '$2b$10$abcdefghijklmnopqrstuu';
    const existingUser = User.create(
      FullName.create('Jane Doe'),
      Email.create('jane@test.com'),
      hash,
      'usr-existing'
    );
    userRepo.findByEmail.mockResolvedValue(existingUser);

    await expect(
      useCase.execute({
        name: 'Jane Doe',
        email: 'jane@test.com',
        password: 'secret123',
      })
    ).rejects.toThrow('Email jane@test.com is already registered');

    expect(userRepo.save).not.toHaveBeenCalled();
    expect(bitacoraService.log).not.toHaveBeenCalled();
  });

  it('should log to bitacora when user is created', async () => {
    userRepo.findByEmail.mockResolvedValue(null);
    userRepo.save.mockResolvedValue();

    await useCase.execute({
      id: 'usr-1',
      name: 'Jane Doe',
      email: 'jane@test.com',
      password: 'secret123',
    });

    expect(bitacoraService.log).toHaveBeenCalledTimes(1);
    expect(bitacoraService.log).toHaveBeenCalledWith({
      userId: 'usr-1',
      action: 'create_user',
      metadata: { email: 'jane@test.com', name: 'Jane Doe' },
    });
  });
});
