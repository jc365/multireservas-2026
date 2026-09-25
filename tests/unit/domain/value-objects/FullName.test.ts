import FullName from '../../../../backend/src/domain/value-objects/FullName';

describe('FullName Value Object', () => {
  describe('create()', () => {
    it('should create a valid FullName', () => {
      const name = FullName.create('Juan Perez');
      expect(name.getValue()).toBe('Juan Perez');
    });

    it('should normalize whitespace', () => {
      const name = FullName.create('  Juan   Perez  ');
      expect(name.getValue()).toBe('Juan Perez');
    });

    it('should throw error for empty string', () => {
      expect(() => FullName.create('')).toThrow('Name cannot be empty');
    });

    it('should throw error for single character', () => {
      expect(() => FullName.create('A')).toThrow('Name must be at least 2 characters');
    });

    it('should throw error for exceeding 100 characters', () => {
      expect(() => FullName.create('A'.repeat(101))).toThrow('Name must be at most 100 characters');
    });

    it('should throw error for invalid characters', () => {
      expect(() => FullName.create('Juan123')).toThrow('Name contains invalid characters');
    });
  });

  describe('firstName()', () => {
    it('should return first name', () => {
      const name = FullName.create('Juan Perez Lopez');
      expect(name.firstName()).toBe('Juan');
    });
  });

  describe('lastName()', () => {
    it('should return last names', () => {
      const name = FullName.create('Juan Perez Lopez');
      expect(name.lastName()).toBe('Perez Lopez');
    });

    it('should return empty for single name', () => {
      const name = FullName.create('Juan');
      expect(name.lastName()).toBe('');
    });
  });

  describe('initials()', () => {
    it('should return initials', () => {
      const name = FullName.create('Juan Perez');
      expect(name.initials()).toBe('JP');
    });
  });

  describe('equals()', () => {
    it('should return true for equal names', () => {
      const n1 = FullName.create('Juan Perez');
      const n2 = FullName.create('Juan Perez');
      expect(n1.equals(n2)).toBe(true);
    });

    it('should return false for different names', () => {
      const n1 = FullName.create('Juan Perez');
      const n2 = FullName.create('Maria Lopez');
      expect(n1.equals(n2)).toBe(false);
    });
  });

  describe('isValid()', () => {
    it('should return true for valid name', () => {
      expect(FullName.isValid('Juan Perez')).toBe(true);
    });

    it('should return false for empty', () => {
      expect(FullName.isValid('')).toBe(false);
    });

    it('should return false for single char', () => {
      expect(FullName.isValid('A')).toBe(false);
    });
  });
});
