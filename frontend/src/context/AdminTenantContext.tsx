/**
 * @file AdminTenantContext.tsx
 * @module context
 *
 * F4.0: estado del "modo owner" de un admin. Cuando un admin entra en
 * modo owner de un tenant:
 * - `tenantId` queda seleccionado → api/client añade el header
 *   X-Tenant-Id a las rutas de zona tenant.
 * - Las páginas de la zona tenant operan como si el admin fuera el
 *   owner (banner "Operando como owner…" en Layout).
 *
 * Solo se monta tras UserProvider (App); el guard de rol es el
 * AdminGuard de las rutas admin (este context no decide acceso).
 */

import { createContext, useContext, useState, useCallback } from 'react';
import { setImpersonationTenantId } from '../api/client';

interface AdminTenantContextValue {
  /** Tenant seleccionado (modo owner activo o navegable). */
  tenantId: string | null;
  /** true mientras el admin esté operando como owner. */
  ownerMode: boolean;
  enterOwnerMode: (tenantId: string) => void;
  exitOwnerMode: () => void;
}

const AdminTenantContext = createContext<AdminTenantContextValue | null>(null);

export function AdminTenantProvider({ children }: { children: React.ReactNode }) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [ownerMode, setOwnerMode] = useState(false);

  const enterOwnerMode = useCallback((id: string) => {
    setTenantId(id);
    setOwnerMode(true);
    setImpersonationTenantId(id);
  }, []);

  const exitOwnerMode = useCallback(() => {
    setOwnerMode(false);
    setTenantId(null);
    setImpersonationTenantId(null);
  }, []);

  return (
    <AdminTenantContext.Provider value={{ tenantId, ownerMode, enterOwnerMode, exitOwnerMode }}>
      {children}
    </AdminTenantContext.Provider>
  );
}

export function useAdminTenant(): AdminTenantContextValue {
  const ctx = useContext(AdminTenantContext);
  if (!ctx) throw new Error('useAdminTenant must be used within AdminTenantProvider');
  return ctx;
}
