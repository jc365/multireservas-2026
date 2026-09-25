---
name: testing-pattern
description: Patrón para escribir tests unitarios de Value Objects y Casos de Uso
---

# Patrón de Tests para Value Objects

## Estructura del archivo de test

```typescript
// tests/unit/domain/value-objects/<Nombre>.test.ts
import <Nombre> from '../../../src/domain/value-objects/<Nombre>';

describe('<Nombre> Value Object', () => {
  describe('create()', () => {
    it('should create a valid <Nombre>', () => {
      const vo = <Nombre>.create('valid-value');
      expect(vo.getValue()).toBe('valid-value');
    });

    it('should throw error for invalid <Nombre>', () => {
      expect(() => <Nombre>.create('invalid')).toThrow('Mensaje de error');
    });
  });

  describe('equals()', () => {
    it('should return true for equal values', () => {
      const vo1 = <Nombre>.create('value');
      const vo2 = <Nombre>.create('value');
      expect(vo1.equals(vo2)).toBe(true);
    });

    it('should return false for different values', () => {
      const vo1 = <Nombre>.create('value1');
      const vo2 = <Nombre>.create('value2');
      expect(vo1.equals(vo2)).toBe(false);
    });
  });

  describe('métodos de negocio', () => {
    // Tests específicos para métodos como isPassing(), toGrade(), etc.
  });
});
```