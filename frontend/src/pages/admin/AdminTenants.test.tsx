/**
 * @file AdminTenants.test.tsx
 * @module tests
 *
 * F4.0: lista admin de tenants — carga, filas con link al detalle,
 * badge de estado, estado vacío y error.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AdminTenants from './AdminTenants';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import client from '../../api/client';

const mockedGet = vi.mocked(client.get);

const tenants = [
  {
    id: 'tenant-demo',
    name: 'Tenant Demo',
    slug: 'demo',
    currency: 'EUR',
    timezone: 'UTC',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'tenant-off',
    name: 'Tenant Off',
    slug: null,
    currency: 'USD',
    timezone: 'America/New_York',
    isActive: false,
    createdAt: '2026-02-01T00:00:00Z',
  },
];

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <AdminTenants />
      </MemoryRouter>
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AdminTenants (F4.0)', () => {
  it('carga la lista y pinta filas con link al detalle', async () => {
    mockedGet.mockResolvedValue({ data: tenants } as never);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Tenant Demo')).toBeInTheDocument();
    });

    expect(mockedGet).toHaveBeenCalledWith('/admin/tenants');
    const link = screen.getByRole('link', { name: 'Tenant Demo' });
    expect(link).toHaveAttribute('href', '/admin/tenants/tenant-demo');
    expect(screen.getByText('Tenant Off')).toBeInTheDocument();
  });

  it('muestra badges de estado (active/inactive)', async () => {
    mockedGet.mockResolvedValue({ data: tenants } as never);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('active')).toBeInTheDocument();
    });
    expect(screen.getByText('inactive')).toBeInTheDocument();
  });

  it('sin tenants → mensaje vacío', async () => {
    mockedGet.mockResolvedValue({ data: [] } as never);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No tenants yet.')).toBeInTheDocument();
    });
  });

  it('error de API → muestra el mensaje del backend', async () => {
    mockedGet.mockRejectedValue({ response: { data: { error: 'Forbidden' } } } as never);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Forbidden')).toBeInTheDocument();
    });
  });

  it('locale es → título, tabla y vacío traducidos', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');
    mockedGet.mockResolvedValue({ data: [] } as never);
    renderPage();

    expect(await screen.findByText('Aún no hay negocios.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Negocios' })).toBeInTheDocument();
    expect(
      screen.getByText('Resumen de la plataforma — haz clic en un negocio para gestionar su configuración.')
    ).toBeInTheDocument();
  });

  it('locale es → cabeceras de tabla y badges en español', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');
    mockedGet.mockResolvedValue({ data: tenants } as never);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Tenant Demo')).toBeInTheDocument();
    });
    expect(screen.getByText('Nombre')).toBeInTheDocument();
    expect(screen.getByText('Estado')).toBeInTheDocument();
    expect(screen.getByText('activo')).toBeInTheDocument();
    expect(screen.getByText('inactivo')).toBeInTheDocument();
  });
});
