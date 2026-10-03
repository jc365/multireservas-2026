/**
 * @file Dashboard.test.tsx
 * @module pages
 *
 * Tests del Dashboard (F4.4b): banner de verificación de email cuando
 * settings.emailVerified === false, sin banner si está verificado o si
 * el campo falta, y admin exento (el hook ni siquiera hace el fetch).
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';

let mockUser: { id: string; name: string; email: string; role: string } | null = null;

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../context/UserContext', () => ({
  useUser: () => ({ user: mockUser }),
  UserProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import client from '../api/client';

const mockedGet = vi.mocked(client.get);

function mockGetByRoute(emailVerified: boolean | undefined) {
  mockedGet.mockImplementation((url: string | object) => {
    const urlStr = String(url);
    if (urlStr.includes('/tenants/me')) {
      return Promise.resolve({
        data: { settings: emailVerified === undefined ? {} : { emailVerified } },
      });
    }
    return Promise.resolve({ data: [] });
  });
}

const BANNER_TEXT = 'Confirm your email to start using MultiReservas';

function renderDashboard() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </I18nProvider>
  );
}

describe('Dashboard: banner de verificación (F4.4b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
  });

  it('emailVerified=false → banner con link a /tenant-config', async () => {
    mockGetByRoute(false);
    renderDashboard();

    expect(await screen.findByText(BANNER_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up now' })).toHaveAttribute(
      'href',
      '/tenant-config'
    );
  });

  it('emailVerified=true → sin banner', async () => {
    mockGetByRoute(true);
    renderDashboard();

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith(
        '/tenants/me',
        expect.objectContaining({ params: expect.anything() })
      );
    });
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
  });

  it('campo ausente (tenant antiguo) → sin banner (verificado por defecto)', async () => {
    mockGetByRoute(undefined);
    renderDashboard();

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalled();
    });
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
  });

  it('admin exento → sin banner y sin fetch de /tenants/me', async () => {
    mockUser = { id: 'usr-admin', name: 'Admin', email: 'admin@demo.com', role: 'admin' };
    mockGetByRoute(false);
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Your services and team at a glance.')).toBeInTheDocument();
    });
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
    expect(
      mockedGet.mock.calls.some(([url]) => String(url).includes('/tenants/me'))
    ).toBe(false);
  });

  it('locale es → banner y link traducidos', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');
    mockGetByRoute(false);
    renderDashboard();

    expect(
      await screen.findByText('Confirma tu email para empezar a usar MultiReservas')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configurar ahora' })).toHaveAttribute(
      'href',
      '/tenant-config'
    );
  });
});
