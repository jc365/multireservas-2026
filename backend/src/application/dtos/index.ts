// application/dtos/index.ts

/**
 * @file DTOs para la capa de aplicación
 * @module application/dtos
 */

// ============================================
// DTOs para Auth
// ============================================
export interface LoginInput {
  email?: string;
  password?: string;
  xUserId?: string;
}

export interface LoginOutput {
  token: string;
  userId: string;
}

// ============================================
// DTOs para la entidad User
// ============================================
export interface CreateUserInput {
  id?: string;
  name: string;
  email: string;
  password: string;
}

// ============================================
// DTOs para la entidad Item
// ============================================
export interface CreateItemInput {
  title: string;
  description?: string;
}

export interface UpdateItemInput {
  title?: string;
  description?: string | null;
  status?: 'active' | 'archived';
}

// ============================================
// DTOs para Config
// ============================================
export interface UpsertConfigInput {
  key: string;
  value: unknown;
  description?: string;
  category?: string;
  updatedBy?: string;
}
