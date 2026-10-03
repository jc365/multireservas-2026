/**
 * @file TenantConfig.test.tsx
 * @module pages
 *
 * Tests de TenantConfig (F3.4): carga GET /tenants/me, edición de
 * perfil + settings + schedules + holidays, validación doble de la
 * regla #11 antes del PUT, gating por editTenantConfig, y los flags
 * de CreateReservation leídos de GET /tenants/me (#12).
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TenantConfig from './TenantConfig';
import CreateReservation from './CreateReservation';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';

let mockUser: { id: string; name: string; email: string; role: string } | null = null;

const { mockShowSuccess } = vi.hoisted(() => ({ mockShowSuccess: vi.fn() }));

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
  useToast: () => ({ showSuccess: mockShowSuccess, showError: vi.fn(), showInfo: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import client from '../api/client';

const mockedGet = vi.mocked(client.get);
const mockedPut = vi.mocked(client.put);
const mockedPost = vi.mocked(client.post);

const tenantMe = {
  id: 'tenant-demo',
  name: 'Tenant Demo',
  slug: 'demo',
  currency: 'EUR',
  timezone: 'Europe/Madrid',
  isActive: true,
  settings: {
    slotDuration: 30,
    maxServiceDuration: 240,
    clientDataRetention: 'nextMonth',
    defaultLanguage: 'en',
    requireClientPhone: false,
    requireClientEmail: true,
    allowCustomerAssignment: false,
  },
  schedules: [
    {
      label: 'Horario semanal',
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      start: '09:00',
      end: '18:00',
      breaks: [{ start: '13:00', end: '14:00' }],
      rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    },
  ],
  holidays: [
    { label: 'Navidad', date: '2026-12-25', recurring: true, rrule: 'RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

function mockTenantGet(
  settings: typeof tenantMe.settings & { emailVerified?: boolean } = tenantMe.settings
) {
  mockedGet.mockImplementation((url: string | object) => {
    const urlStr = String(url);
    if (urlStr.includes('/tenants/me')) {
      return Promise.resolve({ data: { ...tenantMe, settings } });
    }
    if (urlStr.includes('/services')) return Promise.resolve({ data: [] });
    if (urlStr.includes('/employees')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

/** Todas las páginas i18n necesitan el provider (F4.6a). */
function renderI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe('TenantConfig (F3.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
    mockTenantGet();
  });

  it('owner: carga GET /tenants/me y puebla perfil, settings, schedules y holidays', async () => {
    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText('Name')).toBeInTheDocument();
    // F4.4b: se lee sin caché (param _t) para que el banner/gating
    // siempre tenga el estado de verificación fresco.
    expect(mockedGet).toHaveBeenCalledWith(
      '/tenants/me',
      expect.objectContaining({ params: expect.anything() })
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Tenant Demo');
    expect(screen.getByLabelText('Currency')).toHaveValue('EUR');
    expect(screen.getByLabelText('Timezone (IANA)')).toHaveValue('Europe/Madrid');
    expect(screen.getByLabelText('Slot duration (minutes)')).toHaveValue('30');
    expect(screen.getByLabelText('Max service duration (minutes)')).toHaveValue(240);
    expect(screen.getByLabelText('Client data retention')).toHaveValue('nextMonth');
    expect(screen.getByLabelText('Default language')).toHaveValue('en');
    expect(screen.getByLabelText('Require client phone')).not.toBeChecked();
    expect(screen.getByLabelText('Require client email')).toBeChecked();
    expect(screen.getByDisplayValue('Horario semanal')).toBeInTheDocument();
    expect(screen.getByLabelText('Mon')).toBeChecked();
    expect(screen.getByDisplayValue('Navidad')).toBeInTheDocument();
    expect(screen.getByLabelText('Recurring every year')).toBeChecked();
  });

  it('owner: guarda el payload completo con PUT (#10)', async () => {
    mockedPut.mockResolvedValue({ data: tenantMe });

    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );
    await screen.findByLabelText('Name');

    fireEvent.click(screen.getByRole('button', { name: /save configuration/i }));

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith('/tenants/me', {
        name: 'Tenant Demo',
        currency: 'EUR',
        timezone: 'Europe/Madrid',
        settings: {
          slotDuration: 30,
          maxServiceDuration: 240,
          clientDataRetention: 'nextMonth',
          defaultLanguage: 'en',
          requireClientPhone: false,
          requireClientEmail: true,
          allowCustomerAssignment: false,
        },
        schedules: [
          {
            label: 'Horario semanal',
            days: ['mon', 'tue', 'wed', 'thu', 'fri'],
            start: '09:00',
            end: '18:00',
            breaks: [{ start: '13:00', end: '14:00' }],
          },
        ],
        holidays: [{ label: 'Navidad', date: '2026-12-25', recurring: true }],
      });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockShowSuccess).toHaveBeenCalled();
  });

  it('F4.4c: el toggle allowCustomerAssignment se carga y se envía en el PUT', async () => {
    mockedPut.mockResolvedValue({ data: tenantMe });

    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );
    const toggle = await screen.findByLabelText('Let customers choose the employee');
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /save configuration/i }));

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith(
        '/tenants/me',
        expect.objectContaining({
          settings: expect.objectContaining({ allowCustomerAssignment: true }),
        })
      );
    });
  });

  it('validación doble: schedule start > end → error local y NO PUT (#11)', async () => {
    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );
    await screen.findByLabelText('Name');

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '18:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /save configuration/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('start must be before end');
    expect(mockedPut).not.toHaveBeenCalled();
  });

  it('validación doble: timezone no IANA → error local y NO PUT (#11)', async () => {
    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );
    await screen.findByLabelText('Name');

    fireEvent.change(screen.getByLabelText('Timezone (IANA)'), {
      target: { value: 'Not/AZone' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save configuration/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('valid IANA time zone');
    expect(mockedPut).not.toHaveBeenCalled();
  });

  it('validación doble: holiday con fecha inexistente → error local y NO PUT (#11)', async () => {
    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );
    await screen.findByLabelText('Name');

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-02-31' } });
    fireEvent.click(screen.getByRole('button', { name: /save configuration/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('valid YYYY-MM-DD');
    expect(mockedPut).not.toHaveBeenCalled();
  });

  it('muestra el error 400 del backend si la validación del servidor rechaza', async () => {
    mockedPut.mockRejectedValue({
      response: { status: 400, data: { error: 'slotDuration must be one of 15, 30, 45 or 60' } },
    });

    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );
    await screen.findByLabelText('Name');

    fireEvent.click(screen.getByRole('button', { name: /save configuration/i }));

    expect(
      await screen.findByText('slotDuration must be one of 15, 30, 45 or 60')
    ).toBeInTheDocument();
  });

  it('añade y elimina bloques de horario visualmente', async () => {
    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );
    await screen.findByLabelText('Name');
    expect(screen.getByTestId('schedule-block-0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add schedule/i }));
    expect(screen.getByTestId('schedule-block-1')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /^remove$/i })[1]);
    expect(screen.queryByTestId('schedule-block-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('schedule-block-0')).toBeInTheDocument();
  });

  it('añade y elimina breaks dentro de un bloque', async () => {
    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );
    await screen.findByLabelText('Name');
    expect(screen.getByLabelText('Break 1 start of Horario semanal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add break/i }));
    expect(screen.getByLabelText('Break 2 start of Horario semanal')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /remove break/i })[1]);
    expect(screen.queryByLabelText('Break 2 start of Horario semanal')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Break 1 start of Horario semanal')).toBeInTheDocument();
  });

  it('añade y elimina holidays visualmente', async () => {
    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );
    await screen.findByLabelText('Name');

    fireEvent.click(screen.getByRole('button', { name: /add holiday/i }));
    expect(screen.getByTestId('holiday-1')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /^remove$/i })[1]);
    expect(screen.queryByTestId('holiday-1')).not.toBeInTheDocument();
  });

  it('employee: sin editTenantConfig → denegado y sin GET (#13)', () => {
    mockUser = { id: 'usr-emp', name: 'Employee', email: 'employee@demo.com', role: 'employee' };

    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );

    expect(
      screen.getByText('Only the owner can edit the tenant configuration.')
    ).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
    expect(mockedPut).not.toHaveBeenCalled();
  });

  it('admin: sin editTenantConfig → denegado y sin GET', () => {
    mockUser = { id: 'usr-admin', name: 'Admin', email: 'admin@demo.com', role: 'admin' };

    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );

    expect(
      screen.getByText('Only the owner can edit the tenant configuration.')
    ).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });
});

describe('CreateReservation: flags de GET /tenants/me (#12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
  });

  it('requireClientPhone=false / requireClientEmail=true → labels y required del tenant', async () => {
    mockTenantGet({
      ...tenantMe.settings,
      requireClientPhone: false,
      requireClientEmail: true,
    });

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    const phone = await screen.findByLabelText('Phone (optional)');
    expect(phone).not.toBeRequired();
    expect(screen.getByLabelText('Email (required)')).toBeRequired();
    expect(mockedGet).toHaveBeenCalledWith('/tenants/me');
  });

  it('si /tenants/me falla → defaults phone requerido, email opcional', async () => {
    mockedGet.mockImplementation((url: string | object) => {
      const urlStr = String(url);
      if (urlStr.includes('/tenants/me')) return Promise.reject(new Error('network'));
      return Promise.resolve({ data: [] });
    });

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    const phone = await screen.findByLabelText('Phone (required)');
    expect(phone).toBeRequired();
    expect(screen.getByLabelText('Email (optional)')).not.toBeRequired();
  });
});

describe('TenantConfig: verificación de email (F4.4b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
    mockTenantGet();
  });

  it('?token → POST /tenants/verify-email y la respuesta puebla el form (sin GET extra)', async () => {
    mockedPost.mockResolvedValue({
      data: {
        ...tenantMe,
        name: 'Verified Tenant',
        settings: { ...tenantMe.settings, emailVerified: true },
      },
    });

    renderI18n(
      <MemoryRouter initialEntries={['/tenant-config?token=abc123']}>
        <TenantConfig />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText('Name')).toHaveValue('Verified Tenant');
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/tenants/verify-email', { token: 'abc123' });
    });
    expect(mockedGet).not.toHaveBeenCalled();
    expect(
      screen.queryByText('Confirm your email to edit your configuration')
    ).not.toBeInTheDocument();
    expect(mockShowSuccess).toHaveBeenCalled();
  });

  it('token inválido → error + GET de fallback + banner con reenviar', async () => {
    mockedPost
      .mockRejectedValueOnce({
        response: { status: 400, data: { error: 'Invalid verification token' } },
      })
      .mockResolvedValueOnce({ data: { sent: true } });
    mockTenantGet({ ...tenantMe.settings, emailVerified: false });

    renderI18n(
      <MemoryRouter initialEntries={['/tenant-config?token=bad']}>
        <TenantConfig />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid verification token');
    expect(
      await screen.findByText('Confirm your email to edit your configuration')
    ).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith(
      '/tenants/me',
      expect.objectContaining({ params: expect.anything() })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Resend email' }));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/auth/resend-verification');
    });
  });

  it('sin token + emailVerified=false → banner con botón reenviar', async () => {
    mockTenantGet({ ...tenantMe.settings, emailVerified: false });

    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );

    expect(
      await screen.findByText('Confirm your email to edit your configuration')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Tenant Demo');
  });

  it('sin token + emailVerified=true → sin banner', async () => {
    mockTenantGet({ ...tenantMe.settings, emailVerified: true });

    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );

    await screen.findByLabelText('Name');
    expect(
      screen.queryByText('Confirm your email to edit your configuration')
    ).not.toBeInTheDocument();
  });

  it('locale es → título, labels y banner en español', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');
    mockTenantGet({ ...tenantMe.settings, emailVerified: false });

    renderI18n(
      <MemoryRouter>
        <TenantConfig />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText('Nombre')).toHaveValue('Tenant Demo');
    expect(screen.getByRole('heading', { name: 'Configuración del negocio' })).toBeInTheDocument();
    expect(
      await screen.findByText('Confirma tu email para editar tu configuración')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar email' })).toBeInTheDocument();
  });
});
