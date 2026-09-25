/**
 * @file Layout.test.tsx
 * @module tests
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';

const mockRefreshUser = vi.fn();
const mockLogin = vi.fn();
const mockLogout = vi.fn();

vi.mock('../context/UserContext', () => ({
  useUser: () => ({
    user: null,
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
    localStorage.clear();
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

  it('shows nav items', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Items')).toBeInTheDocument();
    expect(screen.getByText('Create Item')).toBeInTheDocument();
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
});
