/**
 * @file client.test.ts
 * @module tests
 *
 * F4.0: interceptor del axios client —
 * - header X-Tenant-Id solo en rutas de zona tenant con impersonación.
 * - aislamiento del cache GET por tenant impersonado (misma URL,
 *   distinto tenant → distinta clave).
 * F4.2: interceptor de error — guarda `error.code` del envelope y
 * normaliza `data.error` a string (lo que leen los apiError()).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { requestUse, responseUse } = vi.hoisted(() => ({
  requestUse: vi.fn(),
  responseUse: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: requestUse },
        response: { use: responseUse },
      },
    })),
  },
}));

import client, {
  setImpersonationTenantId,
  getImpersonationTenantId,
} from './client';

type RequestHandler = (config: {
  url?: string;
  method?: string;
  headers: Record<string, unknown>;
  params?: unknown;
}) => { headers: Record<string, unknown>; adapter?: unknown };

type ResponseHandler = (response: {
  config: { url?: string; method?: string; params?: unknown };
  data: unknown;
  status: number;
  statusText: string;
  headers: Record<string, unknown>;
}) => unknown;

function getRequestHandler(): RequestHandler {
  return requestUse.mock.calls[0][0] as RequestHandler;
}

function getResponseHandler(): ResponseHandler {
  return responseUse.mock.calls[0][0] as ResponseHandler;
}

type ErrorEnvelope = {
  response?: { data: { error: unknown } };
  code?: string;
  message?: string;
};

function getErrorHandler(): (error: ErrorEnvelope) => Promise<unknown> {
  return responseUse.mock.calls[0][1] as (error: ErrorEnvelope) => Promise<unknown>;
}

function makeRequestConfig(url: string, method = 'get') {
  return { url, method, headers: {} as Record<string, unknown> };
}

beforeEach(() => {
  // Ojo: los interceptors se registran UNA vez al importar ./client —
  // no usar vi.clearAllMocks() aquí (borraría esas llamadas).
  setImpersonationTenantId(null);
});

describe('X-Tenant-Id interceptor (F4.0)', () => {
  it('sin impersonación → no añade el header', () => {
    const handler = getRequestHandler();
    const config = makeRequestConfig('/services');

    const result = handler(config);

    expect(result.headers['X-Tenant-Id']).toBeUndefined();
  });

  it('con impersonación en ruta de zona tenant → añade X-Tenant-Id', () => {
    setImpersonationTenantId('tenant-demo');
    const handler = getRequestHandler();

    for (const url of ['/services', '/employees', '/reservations', '/tenants/me']) {
      const result = handler(makeRequestConfig(url));
      expect(result.headers['X-Tenant-Id']).toBe('tenant-demo');
    }
  });

  it('con impersonación fuera de la zona tenant → NO añade el header', () => {
    setImpersonationTenantId('tenant-demo');
    const handler = getRequestHandler();

    for (const url of ['/admin/tenants', '/admin/bitacora', '/users', '/config']) {
      const result = handler(makeRequestConfig(url));
      expect(result.headers['X-Tenant-Id']).toBeUndefined();
    }
  });

  it('setImpersonationTenantId(null) limpia el header', () => {
    setImpersonationTenantId('tenant-demo');
    setImpersonationTenantId(null);
    expect(getImpersonationTenantId()).toBeNull();

    const handler = getRequestHandler();
    const result = handler(makeRequestConfig('/services'));
    expect(result.headers['X-Tenant-Id']).toBeUndefined();
  });
});

describe('cache GET aislado por tenant (F4.0)', () => {
  it('la respuesta cacheada para un tenant no se sirve a otro tenant', () => {
    const request = getRequestHandler();
    const response = getResponseHandler();

    // Admin en modo owner de tenant-a: cachea GET /services
    setImpersonationTenantId('tenant-a');
    response({
      config: { url: '/services', method: 'get' },
      data: [{ id: 'svc-a' }],
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    // Mismo admin, ahora tenant-b → NO debe servir la caché de tenant-a
    setImpersonationTenantId('tenant-b');
    const otherTenant = request(makeRequestConfig('/services'));
    expect(otherTenant.adapter).toBeUndefined();

    // Vuelve a tenant-a → sí debe servir su caché
    setImpersonationTenantId('tenant-a');
    const sameTenant = request(makeRequestConfig('/services'));
    expect(sameTenant.adapter).toBeDefined();
  });

  it('GET fuera de la zona tenant no usa el sufijo de tenant', () => {
    const request = getRequestHandler();
    const response = getResponseHandler();

    response({
      config: { url: '/admin/tenants', method: 'get' },
      data: [],
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    // Con impersonación activa pero URL de plataforma → misma clave base
    setImpersonationTenantId('tenant-a');
    const result = request(makeRequestConfig('/admin/tenants'));
    expect(result.adapter).toBeDefined();
  });
});

describe('availability (F4.1b)', () => {
  it('GET /availability en zona tenant → añade X-Tenant-Id con impersonación', () => {
    const request = getRequestHandler();

    setImpersonationTenantId('tenant-a');
    const result = request(makeRequestConfig('/availability'));
    expect(result.headers['X-Tenant-Id']).toBe('tenant-a');
  });

  it('GET /availability no se cachea (TTL 0)', () => {
    const request = getRequestHandler();
    const response = getResponseHandler();

    response({
      config: { url: '/availability', method: 'get' },
      data: { slots: [], hasMore: false },
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    const result = request(makeRequestConfig('/availability'));
    expect(result.adapter).toBeUndefined();
  });
});

describe('error interceptor (F4.2)', () => {
  it('envelope { error: { code, message } } → guarda el code y normaliza data.error a string', async () => {
    const handler = getErrorHandler();
    const error: ErrorEnvelope = {
      response: {
        data: {
          error: { code: 'RESERVATION_OVERLAP', message: 'Reservation overlaps an existing reservation' },
        },
      },
    };

    await expect(handler(error)).rejects.toBe(error);
    expect(error.code).toBe('RESERVATION_OVERLAP');
    expect(error.response?.data.error).toBe('Reservation overlaps an existing reservation');
  });

  it('sin respuesta (error de red) → se propaga sin tocar nada', async () => {
    const handler = getErrorHandler();
    const error: ErrorEnvelope = { message: 'Network Error' };

    await expect(handler(error)).rejects.toBe(error);
    expect(error.code).toBeUndefined();
  });

  it('data.error ya string (legacy) → se propaga sin cambios', async () => {
    const handler = getErrorHandler();
    const error: ErrorEnvelope = { response: { data: { error: 'Unauthorized' } } };

    await expect(handler(error)).rejects.toBe(error);
    expect(error.response?.data.error).toBe('Unauthorized');
    expect(error.code).toBeUndefined();
  });
});

describe('axios create', () => {
  it('expone los interceptors registrados', () => {
    expect(client).toBeDefined();
    expect(requestUse).toHaveBeenCalled();
    expect(responseUse).toHaveBeenCalled();
  });
});
