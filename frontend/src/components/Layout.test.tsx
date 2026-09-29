/**
 * @file Layout.test.tsx
 * @module tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';

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
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getAllByText('Events Starter').length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows nav items para owner (Services + Create Service)', () => {
    mockUser = { id: 'u-1', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
    render(
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
    const { container } = render(
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
    render(
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
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
  });

  it('shows logout button', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('demo select muestra roles MR (owner/employee/admin, sin legacy)', () => {
    localStorage.setItem('token', 'test-token');

    render(
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

    render(
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

  it.each([
    ['owner', false],
    ['employee', false],
    ['admin', true],
    ['client', false],
  ])('link Admin visible=%s para rol %s', (role, visible) => {
    localStorage.setItem('token', 'test-token');
    mockUser = { id: 'u-1', name: 'Demo', email: `${role}@demo.com`, role };

    const { container } = render(
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
