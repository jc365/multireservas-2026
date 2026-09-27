// domain/entities/User.ts

/**
 * @file User.ts
 * @module domain/entities
 */

import genUUID from '../utils/genUUID';
import Email from '../value-objects/Email';
import FullName from '../value-objects/FullName';

export type UserRole = 'owner' | 'employee' | 'admin' | 'client';

export class User {
  private readonly _id: string;
  private readonly _name: FullName;
  private readonly _email: Email;
  private readonly _password: string;
  private readonly _role: UserRole;
  private readonly _tenantId: string | null;

  private constructor(id: string, name: FullName, email: Email, password: string, role: UserRole, tenantId: string | null) {
    this._id = id;
    this._name = name;
    this._email = email;
    this._password = password;
    this._role = role;
    this._tenantId = tenantId;
  }

  /**
   * @static
   * @param {FullName} name - Name of the User.
   * @param {Email} email - Email address of the User.
   * @param {string} password - Hashed password of the User.
   * @param {string} [id] - Optional unique identifier for the User.
   * @param {UserRole} [role] - Optional role (default: 'client').
   * @param {string | null} [tenantId] - Optional tenant (default: null = platform user).
   * @returns {User} - A new instance of User.
   */
  static create(name: FullName, email: Email, password: string, id?: string, role: UserRole = 'client', tenantId: string | null = null): User {
    const finalId = id || genUUID('usr');
    return new User(finalId, name, email, password, role, tenantId);
  }

  get id(): string {
    return this._id;
  }

  get name(): FullName {
    return this._name;
  }

  get email(): Email {
    return this._email;
  }

  get password(): string {
    return this._password;
  }

  get role(): UserRole {
    return this._role;
  }

  get tenantId(): string | null {
    return this._tenantId;
  }
}

export default User;
