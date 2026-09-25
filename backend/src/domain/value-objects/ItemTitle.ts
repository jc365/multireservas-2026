/**
 * @file ItemTitle.ts
 * @module domain/value-objects
 *
 * Value Object que representa el título de un Item.
 * Es inmutable y valida el formato en el momento de la creación.
 */
export default class ItemTitle {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  /**
   * Crea una nueva instancia de ItemTitle.
   * @param value - Título del item.
   * @returns Una nueva instancia de ItemTitle.
   * @throws {Error} Si el título está vacío, es demasiado corto o largo.
   */
  static create(value: string): ItemTitle {
    if (!value || value.trim().length === 0) {
      throw new Error('Item title cannot be empty');
    }
    if (value.trim().length < 3) {
      throw new Error('Item title must be at least 3 characters');
    }
    if (value.trim().length > 200) {
      throw new Error('Item title must be at most 200 characters');
    }
    return new ItemTitle(value.trim());
  }

  /**
   * Compara este ItemTitle con otro por valor.
   */
  equals(other: ItemTitle): boolean {
    return this._value === other._value;
  }

  /**
   * Devuelve el valor del título como string.
   */
  getValue(): string {
    return this._value;
  }

  /**
   * Valida si un string representa un título válido sin lanzar excepción.
   */
  static isValid(value: string): boolean {
    if (!value || value.trim().length < 3 || value.trim().length > 200) {
      return false;
    }
    return true;
  }
}
