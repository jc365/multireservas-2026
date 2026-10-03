/**
 * @file LoginForm.test.tsx
 * @module tests
 *
 * Tests del formulario de login (F3.3/F4.4b) + PoC i18n (F4.6a):
 * el LoginForm traduce con `t(...)` — `en` por defecto, `es` si el
 * usuario lo pide en localStorage — y los errores de backend pasan
 * por `translateError` (code → clave i18n; si no hay clave, el
 * `message` del backend).
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LoginForm from './LoginForm';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';

function renderLogin() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <LoginForm onLoginSuccess={mockOnLoginSuccess} />
      </I18nProvider>
    </MemoryRouter>
  );
}

const mockOnLoginSuccess = vi.fn();
const mockLogin = vi.fn();

vi.mock('../context/UserContext', () => ({
  useUser: () => ({
    login: mockLogin,
  }),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.lang = '';
  });

  it('renders login form with email and password fields', () => {
    const { container } = renderLogin();
    expect(container.querySelector('input[type="email"]')).toBeInTheDocument();
    expect(container.querySelector('input[type="password"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('login exitoso llama a onLoginSuccess', async () => {
    mockLogin.mockResolvedValueOnce(undefined);

    const { container } = renderLogin();

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    await waitFor(() => {
      expect(mockOnLoginSuccess).toHaveBeenCalled();
    });
  });

  it('login fallido muestra el message del backend (fallback F0 #7)', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Credenciales inválidas'));

    const { container } = renderLogin();

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'wrong@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Credenciales inválidas')).toBeInTheDocument();
    });

    expect(mockOnLoginSuccess).not.toHaveBeenCalled();
  });

  it('shows loading state while submitting', async () => {
    mockLogin.mockImplementationOnce(() => new Promise(() => {}));

    const { container } = renderLogin();

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Signing in...')).toBeInTheDocument();
    });
  });

  it('muestra el link de registro a /register (F4.4b)', () => {
    renderLogin();
    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/register');
  });

  // ── F4.6a: PoC i18n ────────────────────────────────────

  it('locale por defecto (en) → textos en inglés y <html lang="en">', () => {
    renderLogin();

    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText("Don't have an account?")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('preferencia "es" en localStorage → textos en español y <html lang="es">', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');

    renderLogin();

    expect(screen.getByText('Contraseña')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByText('¿No tienes cuenta?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Regístrate' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
  });

  it('error de backend con code → se traduce (errors.UNAUTHORIZED)', async () => {
    mockLogin.mockRejectedValueOnce({
      code: 'UNAUTHORIZED',
      response: { data: { error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } } },
    });

    const { container } = renderLogin();

    fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: 'wrong@example.com' },
    });
    fireEvent.change(container.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: 'wrongpass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Authentication failed.')).toBeInTheDocument();
    });
  });

  it('error con code sin clave i18n → cae al message del backend', async () => {
    mockLogin.mockRejectedValueOnce({
      code: 'SOME_FUTURE_CODE',
      response: { data: { error: { code: 'SOME_FUTURE_CODE', message: 'Backend said it' } } },
    });

    const { container } = renderLogin();

    fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: 'wrong@example.com' },
    });
    fireEvent.change(container.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: 'wrongpass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Backend said it')).toBeInTheDocument();
    });
  });

  it('error sin code ni message → clave de fallback del diccionario', async () => {
    mockLogin.mockRejectedValueOnce(undefined);

    const { container } = renderLogin();

    fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: 'wrong@example.com' },
    });
    fireEvent.change(container.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: 'wrongpass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });
});
