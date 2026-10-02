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
    post: vi.fn(),
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

function RegisterComponent() {
  const { register, user } = useUser();
  return (
    <div>
      <div data-testid="user">{user ? user.name : 'null'}</div>
      <button
        onClick={() =>
          register({
            email: 'new@demo.com',
            password: 'password123',
            ownerName: 'New Owner',
            businessName: 'New Shop',
          })
        }
      >
        Register
      </button>
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

describe('UserContext.register (F4.4b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('register llama a POST /auth/register, guarda el JWT y refresca el usuario', async () => {
    const mockPost = vi.mocked(client.post);
    mockPost.mockResolvedValue({ data: { token: 'reg-token', userId: 'user-9' } });

    const mockGet = vi.mocked(client.get);
    mockGet.mockImplementation((url: string | object) => {
      const urlStr = String(url);
      if (urlStr.includes('/users/user-9')) {
        return Promise.resolve({
          data: { id: 'user-9', name: 'New Owner', email: 'new@demo.com', role: 'owner' },
        });
      }
      return Promise.resolve({ data: [] });
    });

    await act(async () => {
      render(
        <UserProvider>
          <RegisterComponent />
        </UserProvider>
      );
    });

    await act(async () => {
      screen.getByText('Register').click();
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/auth/register', {
        email: 'new@demo.com',
        password: 'password123',
        ownerName: 'New Owner',
        businessName: 'New Shop',
      });
      expect(localStorage.getItem('token')).toBe('reg-token');
      expect(localStorage.getItem('userId')).toBe('user-9');
    });

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('New Owner');
    });
  });
});
