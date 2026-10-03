/**
 * @file Layout.test.tsx
 * @module tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';

/** Layout monta LoginForm (PoC i18n F4.6a) → necesita el provider. */
function renderLayout(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

const mockRefreshUser = vi.fn();
const mockLogin = vi.fn();
const mockLogout = vi.fn();

let mockUser: { id: string; name: string; email: string; role: string } | null = null;

vi.mock('../context/UserContext', () => ({
  useUser: () => ({
    user: mockUser,
    refreshUser: mockRefreshUser,
    login: mockLogin,
    logout: mockLogout,
  }),
  UserProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'dark',
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
    themes: [
      { id: 'light', label: 'Light', cssClass: '' },
      { id: 'dark', label: 'Dark', cssClass: 'dark' },
      { id: 'ocean', label: 'Ocean', cssClass: 'theme-ocean' },
      { id: 'forest', label: 'Forest', cssClass: 'theme-forest' },
      { id: 'sunset', label: 'Sunset', cssClass: 'theme-sunset' },
      { id: 'night', label: 'Night', cssClass: 'theme-night' },
    ],
    getThemeLabel: (id: string) => id,
    getThemeClass: (id: string) => id === 'dark' ? 'dark' : '',
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../context/AdminTenantContext', () => ({
  useAdminTenant: () => ({
    tenantId: null,
    ownerMode: false,
    enterOwnerMode: vi.fn(),
    exitOwnerMode: vi.fn(),
  }),
  AdminTenantProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    localStorage.clear();
    mockUser = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows login form when not authenticated', () => {
    renderLayout(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getAllByText('Events Starter').length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows nav items para owner (Services + Create Service)', () => {
    mockUser = { id: 'u-1', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
    renderLayout(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('Create Service')).toBeInTheDocument();
    expect(screen.getByText('Employees')).toBeInTheDocument();
    expect(screen.getByText('Create Employee')).toBeInTheDocument();
  });

  it('admin no ve Services ni Create Service en la nav (zona tenant)', () => {
    mockUser = { id: 'u-1', name: 'Admin', email: 'admin@demo.com', role: 'admin' };
    const { container } = renderLayout(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Services')).not.toBeInTheDocument();
    expect(screen.queryByText('Create Service')).not.toBeInTheDocument();
    expect(screen.queryByText('Employees')).not.toBeInTheDocument();
    expect(screen.queryByText('Create Employee')).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/admin/bitacora"]')).toBeInTheDocument();
  });

  it('employee ve Services y Employees pero no Create', () => {
    mockUser = { id: 'u-1', name: 'Employee', email: 'employee@demo.com', role: 'employee' };
    renderLayout(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.queryByText('Create Service')).not.toBeInTheDocument();
    expect(screen.getByText('Employees')).toBeInTheDocument();
    expect(screen.queryByText('Create Employee')).not.toBeInTheDocument();
  });

  it('shows Admin Panel subtitle', () => {
    renderLayout(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
  });

  it('shows logout button', () => {
    renderLayout(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('demo select muestra roles MR (owner/employee/admin, sin legacy)', () => {
    localStorage.setItem('token', 'test-token');

    renderLayout(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );

    const demoSelect = screen.getByDisplayValue('Admin') as HTMLSelectElement;
    const values = Array.from(demoSelect.options).map((o) => o.value);

    expect(values).toEqual(['owner', 'employee', 'admin']);
    expect(values).not.toContain('user');
    expect(values).not.toContain('guest');
  });

  it('cambiar de rol en el select hace login con xUserId MR', async () => {
    localStorage.setItem('token', 'test-token');

    renderLayout(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );

    const demoSelect = screen.getByDisplayValue('Admin');
    fireEvent.change(demoSelect, { target: { value: 'employee' } });

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ xUserId: 'employee' });
    });
  });

  it('nav + labels traducidos al español (locale es)', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');
    mockUser = { id: 'u-1', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
    renderLayout(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getByText('Panel')).toBeInTheDocument();
    expect(screen.getByText('Servicios')).toBeInTheDocument();
    expect(screen.getByText('Crear servicio')).toBeInTheDocument();
    expect(screen.getByText('Configuración del negocio')).toBeInTheDocument();
    expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
    expect(screen.getByText('Tema')).toBeInTheDocument();
  });

  it('auto-login demo SOLO con VITE_DEMO_MODE=true (F4.6b fix)', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    renderLayout(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ xUserId: 'admin' });
    });
  });

  it('VITE_DEMO_MODE=false → sin auto-login y se ve el LoginForm', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    renderLayout(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockRefreshUser).not.toHaveBeenCalled();
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it.each([
    ['owner', false],
    ['employee', false],
    ['admin', true],
    ['client', false],
  ])('link Admin visible=%s para rol %s', (role, visible) => {
    localStorage.setItem('token', 'test-token');
    mockUser = { id: 'u-1', name: 'Demo', email: `${role}@demo.com`, role };

    const { container } = renderLayout(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );

    const adminLink = container.querySelector('a[href="/admin/bitacora"]');
    if (visible) {
      expect(adminLink).toBeInTheDocument();
    } else {
      expect(adminLink).not.toBeInTheDocument();
    }
  });
});
