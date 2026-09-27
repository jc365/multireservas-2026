/**
 * @file UserContext.test.tsx
 * @module tests
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserProvider, useUser } from './UserContext';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
  },
}));

import client from '../api/client';

function TestComponent() {
  const { user, isLoading, refreshUser, isAdmin } = useUser();
  return (
    <div>
      <div data-testid="loading">{isLoading.toString()}</div>
      <div data-testid="user">{user ? user.name : 'null'}</div>
      <div data-testid="role">{user ? user.role : 'none'}</div>
      <div data-testid="is-admin">{isAdmin().toString()}</div>
      <button onClick={refreshUser}>Refresh</button>
    </div>
  );
}

describe('UserContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('refreshUser carga usuario', async () => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('userId', 'user-123');

    const mockGet = vi.mocked(client.get);
    mockGet.mockImplementation((url: string | object) => {
      const urlStr = String(url);
      if (urlStr.includes('/users/user-123')) {
        return Promise.resolve({ data: { id: 'user-123', name: 'Test User', email: 'test@example.com', role: 'admin' } });
      }
      return Promise.resolve({ data: [] });
    });

    await act(async () => {
      render(
        <UserProvider>
          <TestComponent />
        </UserProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('Test User');
      expect(screen.getByTestId('role')).toHaveTextContent('admin');
      expect(screen.getByTestId('is-admin')).toHaveTextContent('true');
    });
  });

  it('no carga datos cuando no hay token', async () => {
    await act(async () => {
      render(
        <UserProvider>
          <TestComponent />
        </UserProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('null');
      expect(screen.getByTestId('role')).toHaveTextContent('none');
    });
  });

  it('refreshUser actualiza el usuario', async () => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('userId', 'user-123');

    const mockGet = vi.mocked(client.get);
    mockGet.mockImplementation((url: string | object) => {
      const urlStr = String(url);
      if (urlStr.includes('/users/user-123')) {
        return Promise.resolve({ data: { id: 'user-123', name: 'Test User', email: 'test@example.com', role: 'employee' } });
      }
      return Promise.resolve({ data: [] });
    });

    await act(async () => {
      render(
        <UserProvider>
          <TestComponent />
        </UserProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('Test User');
    });

    await act(async () => {
      screen.getByText('Refresh').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('Test User');
    });
  });

  it('role owner → no es admin', async () => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('userId', 'user-123');

    const mockGet = vi.mocked(client.get);
    mockGet.mockImplementation((url: string | object) => {
      const urlStr = String(url);
      if (urlStr.includes('/users/user-123')) {
        return Promise.resolve({ data: { id: 'user-123', name: 'Owner User', email: 'owner@demo.com', role: 'owner' } });
      }
      return Promise.resolve({ data: [] });
    });

    await act(async () => {
      render(
        <UserProvider>
          <TestComponent />
        </UserProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('role')).toHaveTextContent('owner');
      expect(screen.getByTestId('is-admin')).toHaveTextContent('false');
    });
  });
});
