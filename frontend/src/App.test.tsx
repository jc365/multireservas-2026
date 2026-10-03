/**
 * @file App.test.tsx
 * @module tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';

vi.mock('./api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import client from './api/client';

const mockedGet = vi.mocked(client.get);
const mockedPost = vi.mocked(client.post);

function setupUserMocks() {
  mockedGet.mockImplementation((url: string | object) => {
    const urlStr = String(url);
    if (urlStr.includes('/users/user-1')) {
      return Promise.resolve({ data: { id: 'user-1', name: 'Test User', email: 'test@example.com', role: 'owner' } });
    }
    if (urlStr.includes('/services')) {
      return Promise.resolve({ data: [{ id: 'svc-1', name: 'Test Service', description: 'Desc', duration: 30, price: 25, category: 'hair', isActive: true, tenantId: 'tenant-demo', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] });
    }
    return Promise.resolve({ data: [] });
  });
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getAllByText('Events Starter').length).toBeGreaterThan(0);
  });

  it('shows login form when not authenticated', () => {
    render(<App />);
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  describe('login', () => {
    it('successful login shows dashboard', async () => {
      mockedPost.mockResolvedValueOnce({ data: { token: 'test-token', userId: 'user-1' } });
      setupUserMocks();

      const { container } = render(<App />);

      const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
      const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockedPost).toHaveBeenCalledWith('/auth/login', {
          email: 'test@example.com',
          password: 'password123',
        });
      });

      await waitFor(() => {
        expect(localStorage.getItem('token')).toBe('test-token');
        expect(localStorage.getItem('userId')).toBe('user-1');
      });
    });

    it('failed login shows error message', async () => {
      mockedPost.mockRejectedValueOnce({ message: 'Demo login failed' });
      mockedPost.mockRejectedValueOnce({ message: 'Credenciales inválidas' });

      const { container } = render(<App />);

      const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
      const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;

      fireEvent.change(emailInput, { target: { value: 'wrong@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText('Credenciales inválidas')).toBeInTheDocument();
      });
    });
  });

  describe('navigation', () => {
    it('shows Dashboard page after login', async () => {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('userId', 'user-1');
      setupUserMocks();

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Your services and team at a glance.')).toBeInTheDocument();
      });
    });

    it('loads services after login', async () => {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('userId', 'user-1');
      setupUserMocks();

      render(<App />);

      await waitFor(() => {
        expect(mockedGet).toHaveBeenCalledWith(
          expect.stringContaining('/services'),
        );
      });
    });

    it('loads employees after login', async () => {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('userId', 'user-1');
      setupUserMocks();

      render(<App />);

      await waitFor(() => {
        expect(mockedGet).toHaveBeenCalledWith(
          expect.stringContaining('/employees'),
        );
      });
    });
  });
});
