/**
 * @file EmployeeName.ts
 * @module domain/value-objects
 *
 * Value Object que representa el nombre de un Employee.
 * Es inmutable y valida el formato en el momento de la creación.
 * Espejo de ServiceName (3–200) — ver docu/FINDINGS.md, "F3 / F3.2".
 */
export default class EmployeeName {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  /**
   * Crea una nueva instancia de EmployeeName.
   * @param value - Nombre del empleado.
   * @returns Una nueva instancia de EmployeeName.
   * @throws {Error} Si el nombre está vacío, es demasiado corto o largo.
   */
  static create(value: string): EmployeeName {
    if (!value || value.trim().length === 0) {
      throw new Error('Employee name cannot be empty');
    }
    if (value.trim().length < 3) {
      throw new Error('Employee name must be at least 3 characters');
    }
    if (value.trim().length > 200) {
      throw new Error('Employee name must be at most 200 characters');
    }
    return new EmployeeName(value.trim());
  }

  /**
   * Compara este EmployeeName con otro por valor.
   */
  equals(other: EmployeeName): boolean {
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
