import User from '../../../../backend/src/domain/entities/User';
import Email from '../../../../backend/src/domain/value-objects/Email';
import FullName from '../../../../backend/src/domain/value-objects/FullName';

describe('User Entity', () => {
  const name = FullName.create('Juan Perez');
  const email = Email.create('juan@test.com');
  const hash = '$2b$10$abcdefghijklmnopqrstuu';

  it('should create a user with create()', () => {
    const user = User.create(name, email, hash, 'usr-1');
    expect(user.id).toBe('usr-1');
    expect(user.name.getValue()).toBe('Juan Perez');
    expect(user.email.getValue()).toBe('juan@test.com');
    expect(user.password).toBe(hash);
  });

  it('should generate an id when not provided', () => {
    const user = User.create(name, email, hash);
    expect(user.id).toBeDefined();
    expect(user.id.startsWith('usr-')).toBe(true);
  });

  it('should default role to client', () => {
    const user = User.create(name, email, hash);
    expect(user.role).toBe('client');
  });

  it.each(['owner', 'employee', 'admin', 'client'] as const)(
    'should create a user with role %s',
    (role) => {
      const user = User.create(name, email, hash, undefined, role);
      expect(user.role).toBe(role);
    }
  );
});
