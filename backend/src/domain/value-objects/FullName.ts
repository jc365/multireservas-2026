/**
 * @file FullName.ts
 * @module domain/value-objects
 *
 * Value Object que representa un nombre completo de persona.
 * Es inmutable, validado y normalizado en el momento de la creación.
 */

export default class FullName {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  /**
   * Crea una nueva instancia de FullName.
   * @param value - Nombre completo (p.ej. "Juan Pérez")
   * @throws {Error} Si el nombre está vacío, es demasiado corto/largo,
   * o contiene caracteres no permitidos.
   */
  static create(value: string): FullName {
    if (!value || value.trim().length === 0) {
      throw new Error('Name cannot be empty');
    }
    if (value.trim().length < 2) {
      throw new Error('Name must be at least 2 characters');
    }
    if (value.trim().length > 100) {
      throw new Error('Name must be at most 100 characters');
    }
    if (/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s'-]/.test(value)) {
      throw new Error('Name contains invalid characters');
    }
    return new FullName(value.trim().replace(/\s+/g, ' '));
  }

  /**
   * Devuelve el nombre completo como string normalizado.
   */
  getValue(): string {
    return this._value;
  }

  /**
   * Devuelve el primer nombre (primera palabra).
   */
  firstName(): string {
    return this._value.split(' ')[0];
  }

  /**
   * Devuelve los apellidos (todo después de la primera palabra).
   */
  lastName(): string {
    const parts = this._value.split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  }

  /**
   * Devuelve las iniciales en mayúsculas (p.ej. "JP").
   */
  initials(): string {
    return this._value
      .split(' ')
      .map(n => n[0].toUpperCase())
      .join('');
  }

  /**
   * Compara este FullName con otro por valor.
   */
  equals(other: FullName): boolean {
    return this._value === other._value;
  }

  /**
   * Valida si un string representa un nombre válido sin lanzar excepción.
   */
  static isValid(value: string): boolean {
    if (!value || value.trim().length < 2 || value.trim().length > 100) {
      return false;
    }
    return !/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s'-]/.test(value);
  }
}
