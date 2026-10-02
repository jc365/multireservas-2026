/**
 * @file useEmailVerified.ts
 * @module hooks
 *
 * F4.4b: lee `settings.emailVerified` de `GET /tenants/me` para el
 * gating local (banner + formularios deshabilitados). El backend
 * sigue siendo la autoridad (403 `EMAIL_NOT_VERIFIED`); esto es solo
 * defensa en profundidad y feedback al usuario.
 *
 * Decisiones:
 * - **Admin exento** → `true` sin fetch (coincide con el backend).
 * - **Sin caché**: `client.ts` cachea `/tenants/me` 60s y no se
 *   invalida tras `POST /tenants/verify-email`; el parámetro `_t`
 *   fuerza una clave de cache distinta para leer siempre fresco
 *   (sin tocar `client.ts`).
 * - **Por defecto verificado**: si el campo falta (tenants antiguos
 *   o mocks de tests) o el fetch falla → `true`. Un falso "bloqueado"
 *   sería peor que no mostrar el banner (el backend decide de verdad).
 */

import { useEffect, useState } from 'react';
import client from '../api/client';
import { useUser } from '../context/UserContext';

interface EmailVerifiedState {
  emailVerified: boolean;
  loading: boolean;
}

export default function useEmailVerified(): EmailVerifiedState {
  const { user } = useUser();
  const isAdmin = user?.role === 'admin';
  const [emailVerified, setEmailVerified] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || isAdmin) {
      setEmailVerified(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    client
      .get('/tenants/me', { params: { _t: Date.now() } })
      .then((res) => {
        if (cancelled) return;
        setEmailVerified(res.data?.settings?.emailVerified !== false);
      })
      .catch(() => {
        if (!cancelled) setEmailVerified(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin]);

  return { emailVerified, loading };
}
