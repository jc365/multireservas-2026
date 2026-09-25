/**
 * @file Email.ts
 * @module domain/value-objects
 * 
 * Value Object que representa una dirección de correo electrónico.
 * Es inmutable y valida el formato en el momento de la creación.
 */
export default class Email {
  private readonly _value: string;

  /**
   * Constructor privado. Usar `Email.create()` para instanciar.
   */
  private constructor(value: string) {
    this._value = value;
  }

  /**
   * Crea una nueva instancia de Email.
   * @param value - Dirección de correo electrónico.
   * @returns Una nueva instancia de Email.
   * @throws {Error} Si el formato del email no es válido.
   */
  static create(value: string): Email {
    if (!Email.isValid(value)) {
      throw new Error(`Invalid email format: "${value}"`);
    }
    return new Email(value);
  }

  /**
   * Compara este Email con otro.
   * @param other - Otro objeto Email.
   * @returns `true` si son iguales, `false` en caso contrario.
   */
  equals(other: Email): boolean {
    return this._value === other._value;
  }

  /**
   * Devuelve el valor del email como string.
   */
  getValue(): string {
    return this._value;
  }

  /**
   * Valida que el email tenga un formato correcto.
   * @param value - Email a validar.
   * @returns `true` si el formato es válido, `false` en caso contrario.
   */
  static isValid(value: string): boolean {
    // Expresión regular para validar email (estándar RFC 5322 simplificado)
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(value);
  }
}