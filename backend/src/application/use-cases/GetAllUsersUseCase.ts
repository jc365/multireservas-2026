/**
 * @file GetAllUsersUseCase.ts
 * @module application/use-cases/users
 */

import User from '../../domain/entities/User';
import IUserRepository from '../interfaces/IUserRepository';
import logger from '../../infrastructure/logging/requestContext';

export class GetAllUsersUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(): Promise<User[]> {
    logger.info({}, 'GetAllUsersUseCase: starting');

    const users = await this.userRepository.findAll();

    logger.info({ count: users.length }, 'GetAllUsersUseCase: completed');
    return users;
  }
}
