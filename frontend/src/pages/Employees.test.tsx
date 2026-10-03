/**
 * @file Employees.test.tsx
 * @module pages
 *
 * Tests de las páginas de employees: lista, crear, editar (F3.2).
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Employees from './Employees';
import CreateEmployee from './CreateEmployee';
import EmployeeDetail from './EmployeeDetail';
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
const mockedPost = vi.mocked(client.post);
const mockedPut = vi.mocked(client.put);

const demoEmployee = {
  id: 'emp-1',
  tenantId: 'tenant-demo',
  userId: null,
  name: 'Employee Demo',
  email: 'emp@demo.com',
  phone: '+34600000000',
  offersAllServices: true,
  serviceIds: [],
  customSchedule: null,
  customHolidays: null,
  isActive: true,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

const demoService = {
  id: 'svc-1',
  tenantId: 'tenant-demo',
  name: 'Classic Haircut',
  description: 'Cut, wash and style.',
  duration: 30,
  price: 25,
  category: 'hair',
  isActive: true,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

/** Todas las páginas i18n necesitan el provider (F4.6c). */
function renderI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

function mockGetByRoute() {
  mockedGet.mockImplementation((url: string | object) => {
    const urlStr = String(url);
    if (urlStr.includes('/services')) return Promise.resolve({ data: [demoService] });
    if (/\/employees\/.+/.test(urlStr)) return Promise.resolve({ data: demoEmployee });
    if (urlStr.includes('/employees')) return Promise.resolve({ data: [demoEmployee] });
    return Promise.resolve({ data: [] });
  });
}

describe('Employees (lista)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
  });

  it('lista los empleados del tenant', async () => {
    mockGetByRoute();

    renderI18n(
      <MemoryRouter>
        <Employees />
      </MemoryRouter>
    );

    expect(await screen.findByText('Employee Demo')).toBeInTheDocument();
    expect(screen.getByText('emp@demo.com')).toBeInTheDocument();
    expect(screen.getByText('all services')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('/employees');
  });

  it('el owner puede pedir inactivos con includeInactive', async () => {
    mockGetByRoute();

    renderI18n(
      <MemoryRouter>
        <Employees />
      </MemoryRouter>
    );

    await screen.findByText('Employee Demo');
    fireEvent.click(screen.getByLabelText('Include inactive'));

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/employees?includeInactive=true');
    });
  });

  it('estado vacío sin empleados', async () => {
    mockedGet.mockResolvedValue({ data: [] });

    renderI18n(
      <MemoryRouter>
        <Employees />
      </MemoryRouter>
    );

    expect(await screen.findByText('No employees yet.')).toBeInTheDocument();
  });

  it('admin (plataforma) no tiene acceso', () => {
    mockUser = { id: 'usr-admin', name: 'Admin', email: 'admin@demo.com', role: 'admin' };

    renderI18n(
      <MemoryRouter>
        <Employees />
      </MemoryRouter>
    );

    expect(screen.getByText("You don't have access to employees.")).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });
});

describe('CreateEmployee (crear)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
    mockGetByRoute();
  });

  it('crea un empleado con offersAllServices por defecto', async () => {
    mockedPost.mockResolvedValue({ data: demoEmployee });

    renderI18n(
      <MemoryRouter>
        <CreateEmployee />
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Employee Demo' } });
    fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: 'emp@demo.com' } });
    fireEvent.change(screen.getByLabelText('Phone (optional)'), { target: { value: '+34600000000' } });
    fireEvent.click(screen.getByRole('button', { name: /create employee/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/employees', {
        name: 'Employee Demo',
        email: 'emp@demo.com',
        phone: '+34600000000',
        offersAllServices: true,
        serviceIds: [],
        customSchedule: null,
        customHolidays: null,
      });
    });
  });

  it('offersAllServices desmarcado → checkboxes habilitados y serviceIds enviados', async () => {
    mockedPost.mockResolvedValue({ data: demoEmployee });

    renderI18n(
      <MemoryRouter>
        <CreateEmployee />
      </MemoryRouter>
    );

    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByLabelText('Offers all services'));

    const serviceCheckbox = screen.getByLabelText(/Classic Haircut/) as HTMLInputElement;
    expect(serviceCheckbox.disabled).toBe(false);
    fireEvent.click(serviceCheckbox);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Stylist' } });
    fireEvent.click(screen.getByRole('button', { name: /create employee/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        '/employees',
        expect.objectContaining({
          offersAllServices: false,
          serviceIds: ['svc-1'],
        })
      );
    });
  });

  it('con offersAllServices los checkboxes de servicios están deshabilitados', async () => {
    renderI18n(
      <MemoryRouter>
        <CreateEmployee />
      </MemoryRouter>
    );

    await screen.findByLabelText('Name');
    const serviceCheckbox = screen.getByLabelText(/Classic Haircut/) as HTMLInputElement;
    expect(serviceCheckbox.disabled).toBe(true);
    expect(serviceCheckbox.checked).toBe(true);
  });

  it('JSON inválido en custom schedule → error y no hace POST', async () => {
    renderI18n(
      <MemoryRouter>
        <CreateEmployee />
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Employee Demo' } });
    fireEvent.change(screen.getByPlaceholderText('{"monday": "09:00-17:00"}'), {
      target: { value: 'not-json' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create employee/i }));

    expect(
      await screen.findByText('Custom schedule must be valid JSON')
    ).toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('employee sin editEmployees no ve el formulario', () => {
    mockUser = { id: 'usr-emp', name: 'Employee', email: 'employee@demo.com', role: 'employee' };

    renderI18n(
      <MemoryRouter>
        <CreateEmployee />
      </MemoryRouter>
    );

    expect(screen.getByText("You don't have permission to create employees.")).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });
});

describe('EmployeeDetail (editar)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
    mockGetByRoute();
  });

  it('muestra el detalle y actualiza el empleado', async () => {
    mockedPut.mockResolvedValue({ data: demoEmployee });

    renderI18n(
      <MemoryRouter initialEntries={['/employees/emp-1']}>
        <Routes>
          <Route path="/employees/:id" element={<EmployeeDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Employee Demo')).toBeInTheDocument();
    expect(screen.getByText('emp@demo.com')).toBeInTheDocument();
    expect(screen.getByText('No custom schedule')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit employee' }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Renamed Employee' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith(
        '/employees/emp-1',
        expect.objectContaining({
          name: 'Renamed Employee',
          email: 'emp@demo.com',
          offersAllServices: true,
          serviceIds: [],
          isActive: true,
          customSchedule: null,
          customHolidays: null,
        })
      );
    });
  });

  it('employee sin editEmployees no ve los botones de editar/borrar', async () => {
    mockUser = { id: 'usr-emp', name: 'Employee', email: 'employee@demo.com', role: 'employee' };

    renderI18n(
      <MemoryRouter initialEntries={['/employees/emp-1']}>
        <Routes>
          <Route path="/employees/:id" element={<EmployeeDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Employee Demo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit employee' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete employee')).not.toBeInTheDocument();
  });
});

describe('Employees/CreateEmployee: gating de email (F4.4b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
  });

  function mockVerifiedGet(emailVerified: boolean) {
    mockedGet.mockImplementation((url: string | object) => {
      const urlStr = String(url);
      if (urlStr.includes('/tenants/me')) {
        return Promise.resolve({ data: { settings: { emailVerified } } });
      }
      if (urlStr.includes('/services')) return Promise.resolve({ data: [demoService] });
      if (urlStr.includes('/employees')) return Promise.resolve({ data: [demoEmployee] });
      return Promise.resolve({ data: [] });
    });
  }

  it('lista sin verificar → banner con link a /tenant-config', async () => {
    mockVerifiedGet(false);

    renderI18n(
      <MemoryRouter>
        <Employees />
      </MemoryRouter>
    );

    expect(await screen.findByText('Confirm your email to edit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Confirm email' })).toHaveAttribute(
      'href',
      '/tenant-config'
    );
  });

  it('lista verificada → sin banner', async () => {
    mockVerifiedGet(true);

    renderI18n(
      <MemoryRouter>
        <Employees />
      </MemoryRouter>
    );

    expect(await screen.findByText('Employee Demo')).toBeInTheDocument();
    expect(screen.queryByText('Confirm your email to edit')).not.toBeInTheDocument();
  });

  it('CreateEmployee sin verificar → formulario deshabilitado y sin POST', async () => {
    mockVerifiedGet(false);

    renderI18n(
      <MemoryRouter>
        <CreateEmployee />
      </MemoryRouter>
    );

    expect(await screen.findByText('Confirm your email to edit')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByLabelText('Email (optional)')).toBeDisabled();
    expect(screen.getByRole('button', { name: /create employee/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /create employee/i }));
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('CreateEmployee verificado → formulario habilitado y sin banner', async () => {
    mockVerifiedGet(true);

    renderI18n(
      <MemoryRouter>
        <CreateEmployee />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText('Name')).toBeEnabled();
    expect(screen.queryByText('Confirm your email to edit')).not.toBeInTheDocument();
  });

  it('locale es → título, badge y banner en español (F4.6c)', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');
    mockVerifiedGet(false);

    renderI18n(
      <MemoryRouter>
        <Employees />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Empleados' })).toBeInTheDocument();
    expect(screen.getByText('Confirma tu email para editar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Confirmar email' })).toBeInTheDocument();
  });
});
