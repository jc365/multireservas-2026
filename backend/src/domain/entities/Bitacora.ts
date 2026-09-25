/**
 * @file Bitacora.ts
 * @module domain/entities
 *
 * Entidad de bitácora. Representa un evento de actividad del sistema.
 * Immutable — se crea con `create()` factory.
 */

export interface BitacoraProps {
  id: string;
  userId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export default class Bitacora {
  private readonly _id: string;
  private readonly _userId: string;
  private readonly _action: string;
  private readonly _entityType: string | null;
  private readonly _entityId: string | null;
  private readonly _metadata: Record<string, unknown> | null;
  private readonly _createdAt: Date;

  static create(
    id: string,
    userId: string,
    action: string,
    entityType?: string | null,
    entityId?: string | null,
    metadata?: Record<string, unknown> | null,
    createdAt?: Date
  ): Bitacora {
    return new Bitacora(
      id,
      userId,
      action,
      entityType ?? null,
      entityId ?? null,
      metadata ?? null,
      createdAt ?? new Date()
    );
  }

  private constructor(
    id: string,
    userId: string,
    action: string,
    entityType: string | null,
    entityId: string | null,
    metadata: Record<string, unknown> | null,
    createdAt: Date
  ) {
    this._id = id;
    this._userId = userId;
    this._action = action;
    this._entityType = entityType;
    this._entityId = entityId;
    this._metadata = metadata;
    this._createdAt = createdAt;
  }

  get id(): string { return this._id; }
  get userId(): string { return this._userId; }
  get action(): string { return this._action; }
  get entityType(): string | null { return this._entityType; }
  get entityId(): string | null { return this._entityId; }
  get metadata(): Record<string, unknown> | null { return this._metadata; }
  get createdAt(): Date { return this._createdAt; }
}
