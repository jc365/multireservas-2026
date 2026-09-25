/**
 * @file LoginUseCase.ts
 * @module application/use-cases/auth
 */

import IUserRepository from '../interfaces/IUserRepository';
import { LoginInput, LoginOutput } from '../dtos';
import { generateToken } from '../../infrastructure/middleware/auth';
import logger from '../../infrastructure/logging/requestContext';
import HashService from '../../infrastructure/security/HashService';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

const DEMO_USERS: Record<string, string> = {
  admin: 'admin@demo.com',
  user: 'user1@demo.com',
  guest: 'guest@demo.com',
};

export class LoginUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly hashService: HashService
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const { email, password, xUserId } = input;

    if (xUserId) {
      if (!DEMO_MODE) {
        logger.error({}, 'LoginUseCase: demo mode disabled, rejected xUserId');
        throw new Error('Demo mode is disabled');
      }

      const demoEmail = DEMO_USERS[xUserId];
      if (!demoEmail) {
        logger.error({ xUserId }, 'LoginUseCase: invalid demo role');
        throw new Error('Invalid demo role');
      }

      logger.info({ xUserId, demoEmail }, 'LoginUseCase: demo login via xUserId');
      const user = await this.userRepository.findByEmail(demoEmail);
      if (!user) {
        logger.error({ demoEmail }, 'LoginUseCase: demo user not found');
        throw new Error('Invalid credentials');
      }

      const token = generateToken(user.id);
      logger.info({ userId: user.id }, 'LoginUseCase: demo login completed');
      return { token, userId: user.id };
    }

    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    logger.info({ email }, 'LoginUseCase: starting');

    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      logger.error({ email }, 'LoginUseCase: user not found');
      throw new Error('Invalid credentials');
    }

    const passwordMatch = await this.hashService.compare(password, user.password);
    if (!passwordMatch) {
      logger.error({ email }, 'LoginUseCase: invalid password');
      throw new Error('Invalid credentials');
    }

    const token = generateToken(user.id);

    logger.info({ userId: user.id }, 'LoginUseCase: completed');
    return { token, userId: user.id };
  }
}
