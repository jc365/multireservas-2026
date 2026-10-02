/**
 * @file AdminTenantDetail.test.tsx
 * @module tests
 *
 * F4.0: detalle admin de un tenant — carga config + recursos, PUT con
 * maxServiceDuration, soft delete (PATCH active), y "Operate as owner"
 * que dispara enterOwnerMode.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminTenantDetail from './AdminTenantDetail';

const { mockShowSuccess, mockShowError, mockEnterOwnerMode } = vi.hoisted(() => ({
  mockShowSuccess: vi.fn(),
  mockShowError: vi.fn(),
  mockEnterOwnerMode: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showInfo: vi.fn(),
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../context/AdminTenantContext', () => ({
  useAdminTenant: () => ({
    tenantId: null,
    ownerMode: false,
    enterOwnerMode: mockEnterOwnerMode,
    exitOwnerMode: vi.fn(),
  }),
  AdminTenantProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import client from '../../api/client';

const mockedGet = vi.mocked(client.get);
const mockedPut = vi.mocked(client.put);
const mockedPatch = vi.mocked(client.patch);

const tenantDetail = {
  id: 'tenant-demo',
  name: 'Tenant Demo',
  slug: 'demo',
  currency: 'EUR',
  timezone: 'UTC',
  isActive: true,
  settings: { slotDuration: 15, maxServiceDuration: 180, requireClientPhone: true },
  schedules: [{ label: 'Semanal', days: ['mon'], start: '09:00', end: '18:00', breaks: [] }],
  holidays: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
};

function mockApi() {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/admin/tenants/tenant-demo') return Promise.resolve({ data: tenantDetail } as never);
    if (url.endsWith('/services')) return Promise.resolve({ data: [] } as never);
    if (url.endsWith('/employees')) return Promise.resolve({ data: [] } as never);
    if (url.endsWith('/reservations')) return Promise.resolve({ data: [] } as never);
    return Promise.reject(new Error(`unexpected url: ${url}`));
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/tenants/tenant-demo']}>
      <Routes>
        <Route path="/admin/tenants/:tenantId" element={<AdminTenantDetail />} />
        <Route path="/tenant-config" element={<p>tenant-config page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
  mockedPut.mockResolvedValue({ data: tenantDetail } as never);
});

/** jsdom no dispara submit por click en form multi-campo → submit directo. */
function submitForm(container: HTMLElement) {
  const form = container.querySelector('form');
  if (!form) throw new Error('form not found');
  fireEvent.submit(form);
}

describe('AdminTenantDetail (F4.0)', () => {
  it('carga el detalle y rellena el formulario', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Tenant Demo')).toBeInTheDocument();
    });

    expect(mockedGet).toHaveBeenCalledWith('/admin/tenants/tenant-demo');
    expect(mockedGet).toHaveBeenCalledWith('/admin/tenants/tenant-demo/services');
    expect(screen.getByDisplayValue('180')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('PUT con todos los campos (incl. maxServiceDuration editado) → showSuccess', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Tenant Demo')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Max service duration (min)'), {
      target: { value: '240' },
    });
    submitForm(container);

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledTimes(1);
    });
    const [url, payload] = mockedPut.mock.calls[0] as [
      string,
      {
        name: string;
        settings: Record<string, unknown>;
        schedules: unknown[];
        holidays: unknown[];
      },
    ];
    expect(url).toBe('/admin/tenants/tenant-demo');
    expect(payload.name).toBe('Tenant Demo');
    expect(payload.settings).toMatchObject({ slotDuration: 15, maxServiceDuration: 240 });
    // round-trip de schedules/holidays (la edición visual vive en modo owner)
    expect(payload.schedules).toEqual(tenantDetail.schedules);
    expect(payload.holidays).toEqual(tenantDetail.holidays);
    expect(mockShowSuccess).toHaveBeenCalledWith('Tenant configuration saved');
  });

  it('valida maxServiceDuration múltiplo del slot antes del PUT', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Tenant Demo')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Max service duration (min)'), {
      target: { value: '200' },
    });
    submitForm(container);

    expect(mockedPut).not.toHaveBeenCalled();
    expect(
      screen.getByText('Max service duration must be a multiple of the slot duration')
    ).toBeInTheDocument();
  });

  it('Deactivate → PATCH active con isActive:false y badge a inactive', async () => {
    mockedPatch.mockResolvedValue({ data: { ...tenantDetail, isActive: false } } as never);
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Tenant Demo')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith('/admin/tenants/tenant-demo/active', {
        isActive: false,
      });
    });
    expect(mockShowSuccess).toHaveBeenCalledWith('Tenant deactivated');
    await waitFor(() => {
      expect(screen.getByText('inactive')).toBeInTheDocument();
    });
  });

  it('Operate as owner → enterOwnerMode y navega a /tenant-config', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Tenant Demo')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Operate as owner' }));

    expect(mockEnterOwnerMode).toHaveBeenCalledWith('tenant-demo');
    await waitFor(() => {
      expect(screen.getByText('tenant-config page')).toBeInTheDocument();
    });
  });

  it('tenant inexistente → muestra el error del backend', async () => {
    mockedGet.mockRejectedValue({ response: { data: { error: 'Tenant not found' } } } as never);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Tenant not found')).toBeInTheDocument();
    });
  });
});
