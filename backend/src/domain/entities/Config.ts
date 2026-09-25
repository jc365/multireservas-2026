// domain/entities/Config.ts

/**
 * @file Config.ts
 * @module domain/entities
 *
 * Entidad genérica de configuración centralizada.
 * Almacena pares key-value con categoría y metadatos.
 */

export type ConfigCategory = 'logging' | 'feature_flags' | 'limits' | 'integrations' | 'ui' | string;

export default class Config {
  private readonly _id: string;
  private readonly _key: string;
  private readonly _value: unknown;
  private readonly _description: string | null;
  private readonly _category: ConfigCategory | null;
  private readonly _updatedBy: string | null;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  static create(
    key: string,
    value: unknown,
    description?: string,
    category?: ConfigCategory,
    updatedBy?: string,
    id?: string
  ): Config {
    const now = new Date();
    return new Config(
      id || '',
      key,
      value,
      description ?? null,
      category ?? null,
      updatedBy ?? null,
      now,
      now
    );
  }

  private constructor(
    id: string,
    key: string,
    value: unknown,
    description: string | null,
    category: ConfigCategory | null,
    updatedBy: string | null,
    createdAt: Date,
    updatedAt: Date
  ) {
    this._id = id;
    this._key = key;
    this._value = value;
    this._description = description;
    this._category = category;
    this._updatedBy = updatedBy;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  get id(): string { return this._id; }
  get key(): string { return this._key; }
  get value(): unknown { return this._value; }
  get description(): string | null { return this._description; }
  get category(): ConfigCategory | null { return this._category; }
  get updatedBy(): string | null { return this._updatedBy; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  withValue(value: unknown, updatedBy?: string): Config {
    return new Config(
      this._id,
      this._key,
      value,
      this._description,
      this._category,
      updatedBy ?? this._updatedBy,
      this._createdAt,
      new Date()
    );
  }
}
