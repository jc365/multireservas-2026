// frontend/src/api/client.ts
import axios from 'axios';
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

const TTL_CONFIG: Record<string, number> = {
  '/services': 5 * 60 * 1000,
  '/employees': 5 * 60 * 1000,
  '/reservations': 60 * 1000,
  '/tenants/me': 60 * 1000,
  '/users': 10 * 60 * 1000,
  '/bitacora': 30 * 1000,
  '/files': 2 * 60 * 1000,
  // F4.1b: sin cache — la disponibilidad cambia con cada reserva
  // y la paginación usa claves de `from` distintas por tanda.
  '/availability': 0,
};

const DEFAULT_TTL = 2 * 60 * 1000;

// ── F4.0: modo owner (admin impersonando un tenant) ──
// El context AdminTenantContext llama a setImpersonationTenantId al
// entrar/salir del modo owner. El interceptor añade X-Tenant-Id solo
// en las rutas de zona tenant (el resto de rutas son de plataforma y
// el header molestaría). El rol lo controla el caller (AdminGuard) —
// el client no conoce el usuario.

let impersonationTenantId: string | null = null;

const TENANT_ZONE_PATTERNS = ['/services', '/employees', '/reservations', '/tenants/me', '/availability'];

export function setImpersonationTenantId(tenantId: string | null): void {
  impersonationTenantId = tenantId;
}

export function getImpersonationTenantId(): string | null {
  return impersonationTenantId;
}

function isTenantZoneUrl(url: string): boolean {
  return TENANT_ZONE_PATTERNS.some((pattern) => url.includes(pattern));
}

function getTTL(url: string): number {
  for (const [pattern, ttl] of Object.entries(TTL_CONFIG)) {
    if (url.includes(pattern)) return ttl;
  }
  return DEFAULT_TTL;
}

function getCacheKey(config: AxiosRequestConfig): string | null {
  if (config.method && config.method.toUpperCase() !== 'GET') return null;
  const params = config.params ? JSON.stringify(config.params) : '';
  const url = config.url || '';
  // F4.0: el cache de zona tenant se aísla por tenant impersonado —
  // sin el sufijo, entrar al modo owner de otro tenant devolvería la
  // respuesta cacheada del tenant anterior.
  const tenantSuffix =
    impersonationTenantId && isTenantZoneUrl(url) ? `@${impersonationTenantId}` : '';
  return `${url}${params}${tenantSuffix}`;
}

function isValidEntry(entry: CacheEntry, ttl: number): boolean {
  return Date.now() - entry.timestamp < ttl;
}

function invalidateExact(key: string): void {
  cache.delete(key);
}

function invalidateByPattern(pattern: string): void {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
}

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
});

client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (
    impersonationTenantId &&
    config.url &&
    isTenantZoneUrl(config.url)
  ) {
    config.headers['X-Tenant-Id'] = impersonationTenantId;
  }

  if (config.method && config.method.toUpperCase() === 'GET') {
    const cacheKey = getCacheKey(config);
    if (cacheKey) {
      const entry = cache.get(cacheKey);
      const ttl = getTTL(config.url || '');
      if (ttl > 0 && entry && isValidEntry(entry, ttl)) {
        if (import.meta.env.DEV) console.log(`... usando CACHE en ${cacheKey}`);
        (config as AxiosRequestConfig & { adapter: unknown }).adapter = () =>
          Promise.resolve({
            data: entry.data,
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          });
      }
    }
  }

  return config;
});

client.interceptors.response.use(
  (response) => {
    const url = response.config.url || '';
    const method = response.config.method?.toUpperCase();

    if (import.meta.env.DEV) {
      console.log(`✅ ${method} ${url}`, response.data);
    }

    if (method === 'GET') {
      const ttl = getTTL(url);
      const cacheKey = ttl > 0 ? getCacheKey(response.config) : null;
      if (cacheKey) {
        cache.set(cacheKey, { data: response.data, timestamp: Date.now() });
      }
    }

    if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (url.includes('/services')) {
        invalidateByPattern('/services');
        const parts = url.split('/');
        const idx = parts.indexOf('services');
        if (idx !== -1 && idx + 1 < parts.length) {
          invalidateExact(`/services/${parts[idx + 1]}`);
        }
      }
      if (url.includes('/employees')) {
        invalidateByPattern('/employees');
        const parts = url.split('/');
        const idx = parts.indexOf('employees');
        if (idx !== -1 && idx + 1 < parts.length) {
          invalidateExact(`/employees/${parts[idx + 1]}`);
        }
      }
      if (url.includes('/reservations')) {
        invalidateByPattern('/reservations');
        const parts = url.split('/');
        const idx = parts.indexOf('reservations');
        if (idx !== -1 && idx + 1 < parts.length) {
          invalidateExact(`/reservations/${parts[idx + 1]}`);
        }
      }
      if (url.includes('/tenants/me')) {
        invalidateByPattern('/tenants/me');
      }
      if (url.includes('/users')) {
        invalidateByPattern('/users');
      }
      if (url.includes('/bitacora')) {
        invalidateByPattern('/bitacora');
      }
    }

    return response;
  },
  (error) => {
    // F4.2: envelope del backend → `{ error: { code, message } }`.
    // Se guarda el `code` en el propio objeto de error (para i18n /
    // lógica por código en F4.6) y se normaliza `data.error` a
    // string, que es lo que leen los `apiError()` de las páginas.
    const payload = error.response?.data?.error;
    if (payload && typeof payload === 'object' && typeof payload.code === 'string') {
      error.code = payload.code;
      if (typeof payload.message === 'string') {
        error.response.data.error = payload.message;
      }
    }
    return Promise.reject(error);
  }
);

export default client;
