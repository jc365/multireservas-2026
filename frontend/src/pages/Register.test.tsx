/**
 * @file Register.test.tsx
 * @module pages
 *
 * Tests de Register (F4.4b): campos + validación local (email, password
 * ≥ 8, obligatorios), auto-login vía UserContext.register, redirección
 * a /register/check-email?email=X, 409 USER_EMAIL_EXISTS y errores 400
 * del backend.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Register from './Register';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';

const mockRegister = vi.fn();

vi.mock('../context/UserContext', () => ({
  useUser: () => ({ register: mockRegister }),
  UserProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function CheckEmailSpy() {
  const location = useLocation();
  return <div data-testid="check-email">{location.pathname + location.search}</div>;
}

function renderRegister() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/register/check-email" element={<CheckEmailSpy />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
}

interface RegisterLabels {
  password: string;
  ownerName: string;
  businessName: string;
  submit: RegExp;
}

const EN: RegisterLabels = {
  password: 'Password',
  ownerName: 'Your name',
  businessName: 'Business name',
  submit: /create account/i,
};

function fillValidForm(labels: RegisterLabels = EN) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@demo.com' } });
  fireEvent.change(screen.getByLabelText(labels.password), { target: { value: 'password123' } });
  fireEvent.change(screen.getByLabelText(labels.ownerName), { target: { value: 'New Owner' } });
  fireEvent.change(screen.getByLabelText(labels.businessName), {
    target: { value: 'New Shop' },
  });
}

describe('Register (F4.4b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('muestra los 4 campos y el link a /login (en)', () => {
    renderRegister();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    expect(screen.getByLabelText('Business name')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

  it('locale es → labels del formulario en español', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');
    renderRegister();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByLabelText('Tu nombre')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del negocio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /inicia sesión/i })).toHaveAttribute('href', '/login');
  });

  it('validación local: campos vacíos → error y NO register', () => {
    const { container } = renderRegister();
    // fireEvent.submit: jsdom bloquea click en submit con required vacío
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Enter a valid email');
    expect(alert.textContent).toContain('The name is required');
    expect(alert.textContent).toContain('The business name is required');
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('validación local: email inválido y password < 8 → error y NO register', () => {
    const { container } = renderRegister();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'no-es-email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'corta' } });
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Owner' } });
    fireEvent.change(screen.getByLabelText('Business name'), {
      target: { value: 'Shop' },
    });

    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Enter a valid email');
    expect(alert.textContent).toContain('The password must be at least 8 characters');
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('registro OK → register(payload) y navegación a check-email con el email', async () => {
    mockRegister.mockResolvedValue(undefined);
    renderRegister();

    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: EN.submit }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        email: 'new@demo.com',
        password: 'password123',
        ownerName: 'New Owner',
        businessName: 'New Shop',
      });
    });

    expect(await screen.findByTestId('check-email')).toHaveTextContent(
      '/register/check-email?email=new%40demo.com'
    );
  });

  it('409 USER_EMAIL_EXISTS → mensaje traducido del diccionario errors (en)', async () => {
    mockRegister.mockRejectedValue({ code: 'USER_EMAIL_EXISTS', response: { status: 409 } });
    renderRegister();

    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: EN.submit }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email is already registered.'
    );
    expect(screen.queryByTestId('check-email')).not.toBeInTheDocument();
  });

  it('400 → muestra el message del backend', async () => {
    mockRegister.mockRejectedValue({
      response: { status: 400, data: { error: 'Password too weak' } },
    });
    renderRegister();

    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: EN.submit }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Password too weak');
  });
});
