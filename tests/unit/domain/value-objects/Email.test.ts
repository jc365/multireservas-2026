import Email from '../../../../backend/src/domain/value-objects/Email';

describe('Email Value Object', () => {
  describe('create()', () => {
    it('should create a valid Email', () => {
      const email = Email.create('user@example.com');
      expect(email.getValue()).toBe('user@example.com');
    });

    it('should throw error for invalid format', () => {
      expect(() => Email.create('not-an-email')).toThrow('Invalid email format');
    });

    it('should throw error for empty string', () => {
      expect(() => Email.create('')).toThrow('Invalid email format');
    });

    it('should throw error for missing domain', () => {
      expect(() => Email.create('user@')).toThrow('Invalid email format');
    });
  });

  describe('equals()', () => {
    it('should return true for equal emails', () => {
      const e1 = Email.create('a@b.com');
      const e2 = Email.create('a@b.com');
      expect(e1.equals(e2)).toBe(true);
    });

    it('should return false for different emails', () => {
      const e1 = Email.create('a@b.com');
      const e2 = Email.create('c@d.com');
      expect(e1.equals(e2)).toBe(false);
    });
  });

  describe('isValid()', () => {
    it('should return true for valid email', () => {
      expect(Email.isValid('test@example.com')).toBe(true);
    });

    it('should return false for invalid email', () => {
      expect(Email.isValid('invalid')).toBe(false);
    });
  });
});
