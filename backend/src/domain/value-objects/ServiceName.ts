/**
 * @file ServiceName.ts
 * @module domain/value-objects
 *
 * Value Object que representa el nombre de un Service.
 * Es inmutable y valida el formato en el momento de la creación.
 */
export default class ServiceName {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  /**
   * Crea una nueva instancia de ServiceName.
   * @param value - Nombre del servicio.
   * @returns Una nueva instancia de ServiceName.
   * @throws {Error} Si el nombre está vacío, es demasiado corto o largo.
   */
  static create(value: string): ServiceName {
    if (!value || value.trim().length === 0) {
      throw new Error('Service name cannot be empty');
    }
    if (value.trim().length < 3) {
      throw new Error('Service name must be at least 3 characters');
    }
    if (value.trim().length > 200) {
      throw new Error('Service name must be at most 200 characters');
    }
    return new ServiceName(value.trim());
  }

  /**
   * Compara este ServiceName con otro por valor.
   */
  equals(other: ServiceName): boolean {
    return this._value === other._value;
  }

  /**
   * Devuelve el valor del nombre como string.
   */
  getValue(): string {
    return this._value;
  }

  /**
   * Valida si un string representa un nombre válido sin lanzar excepción.
   */
  static isValid(value: string): boolean {
    if (!value || value.trim().length < 3 || value.trim().length > 200) {
      return false;
    }
    return true;
  }
}
