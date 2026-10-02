/**
 * @file CheckEmail.test.tsx
 * @module pages
 *
 * Tests de CheckEmail (F4.4b): mensaje con el email de la query,
 * "Reenviar email" → POST /auth/resend-verification, y "Ya he verificado"
 * → GET /tenants/me fresco (sin caché): true → /tenant-config, false →
 * aviso "Aún no se ha verificado".
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CheckEmail from './CheckEmail';

const { mockShowSuccess, mockShowInfo, mockShowError } = vi.hoisted(() => ({
  mockShowSuccess: vi.fn(),
  mockShowInfo: vi.fn(),
  mockShowError: vi.fn(),
}));

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({
    showSuccess: mockShowSuccess,
    showInfo: mockShowInfo,
    showError: mockShowError,
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import client from '../api/client';

const mockedGet = vi.mocked(client.get);
const mockedPost = vi.mocked(client.post);

const EMAIL_QUERY = '/register/check-email?email=owner%40demo.com';

function renderCheckEmail(entry = EMAIL_QUERY) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/register/check-email" element={<CheckEmail />} />
        <Route path="/tenant-config" element={<div data-testid="tenant-config" />} />
      </Routes>
    </MemoryRouter>
  );
}

function mockTenantMe(emailVerified: boolean) {
  mockedGet.mockResolvedValue({ data: { settings: { emailVerified } } });
}

describe('CheckEmail (F4.4b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra el email de la query', () => {
    renderCheckEmail();
    expect(screen.getByText('owner@demo.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ya he verificado' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar email' })).toBeInTheDocument();
  });

  it('Reenviar email → POST /auth/resend-verification y toast de éxito', async () => {
    mockedPost.mockResolvedValue({ data: { sent: true } });
    renderCheckEmail();

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar email' }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/auth/resend-verification');
    });
    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalled();
    });
  });

  it('Reenviar con sent:false (ya verificado) → info, no éxito', async () => {
    mockedPost.mockResolvedValue({ data: { sent: false } });
    renderCheckEmail();

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar email' }));

    await waitFor(() => {
      expect(mockShowInfo).toHaveBeenCalled();
    });
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it('Ya he verificado + emailVerified=true → navega a /tenant-config', async () => {
    mockTenantMe(true);
    renderCheckEmail();

    fireEvent.click(screen.getByRole('button', { name: 'Ya he verificado' }));

    expect(await screen.findByTestId('tenant-config')).toBeInTheDocument();
    // Sin caché: el GET lleva params para leer fresco
    expect(mockedGet).toHaveBeenCalledWith(
      '/tenants/me',
      expect.objectContaining({ params: expect.anything() })
    );
  });

  it('Ya he verificado + emailVerified=false → aviso y sin navegación', async () => {
    mockTenantMe(false);
    renderCheckEmail();

    fireEvent.click(screen.getByRole('button', { name: 'Ya he verificado' }));

    expect(
      await screen.findByText('Aún no se ha verificado. Revisa tu email.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('tenant-config')).not.toBeInTheDocument();
  });

  it('si GET /tenants/me falla → muestra el error', async () => {
    mockedGet.mockRejectedValue({
      response: { status: 401, data: { error: 'Unauthorized' } },
    });
    renderCheckEmail();

    fireEvent.click(screen.getByRole('button', { name: 'Ya he verificado' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unauthorized');
    expect(screen.queryByTestId('tenant-config')).not.toBeInTheDocument();
  });
});
