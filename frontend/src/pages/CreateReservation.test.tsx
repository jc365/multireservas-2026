/**
 * @file CreateReservation.test.tsx
 * @module pages
 *
 * Tests del formulario de alta de reservas (F4.1b): los tests de
 * creación/errores/permisos venían de Reservations.test.tsx y aquí
 * se adaptan al selector de slots (GET /availability) + los nuevos:
 * toggle ASAP/fecha, paginación "Cargar más", sin disponibilidad,
 * validación de slot obligatorio y date = día calendario del tenant.
 *
 * F4.5d (multi-servicio): el select de servicio pasa a checkbox-list;
 * los params de /availability llevan SIEMPRE `serviceIds` (CSV, nunca
 * `duration`) y el body lleva `serviceIds` como array. Nuevos tests
 * de suma de duración/precio, resumen visible, selección múltiple,
 * "sin preferencia" + multi y day-gap con multi.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CreateReservation from './CreateReservation';
import { formatPrice } from '../utils/booking';
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

import client from '../api/client';

const mockedGet = vi.mocked(client.get);
const mockedPost = vi.mocked(client.post);

/**
 * F4.5d: `formatPrice` emite NBSP antes del símbolo y los
 * matchers de texto lo normalizan a espacio — se normaliza a mano.
 */
function normalizedText(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/\u00A0/g, ' ');
}

const demoService = {
  id: 'svc-1',
  tenantId: 'tenant-demo',
  name: 'Classic Haircut',
  duration: 30,
  price: 25,
  isActive: true,
};

// F4.5d: 30 + 45 = 75 min y 25 + 83,5 = 108,5 € (resumen de DoD).
const demoService2 = {
  id: 'svc-2',
  tenantId: 'tenant-demo',
  name: 'Full Color',
  duration: 45,
  price: 83.5,
  isActive: true,
};

const demoEmployee = {
  id: 'emp-1',
  tenantId: 'tenant-demo',
  name: 'Employee Demo',
  isActive: true,
};

const demoReservation = {
  id: 'res-1',
  tenantId: 'tenant-demo',
  clientId: 'cli-1',
  employeeId: 'emp-1',
  serviceId: 'svc-1',
  date: '2026-10-15',
  startTimeUTC: '2026-10-15T07:00:00.000Z',
  endTimeUTC: '2026-10-15T07:30:00.000Z',
  timezone: 'Europe/Madrid',
  duration: 30,
  status: 'pending',
  notes: null,
  activeKey: 'emp-1-2026-10-15-07:00',
  cancelToken: 'token-para-demo-0001',
  client: { id: 'cli-1', firstName: 'Laura', lastName: 'Gómez', email: 'laura@example.com', phone: '+34600111222' },
  employee: { id: 'emp-1', name: 'Employee Demo', isActive: true },
  service: { id: 'svc-1', name: 'Classic Haircut', duration: 30, price: 25 },
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

// 09:00 local Madrid (UTC+2 en octubre) — 07:00Z
const slot1 = {
  startUTC: '2026-10-15T07:00:00.000Z',
  endUTC: '2026-10-15T07:30:00.000Z',
  localStart: '09:00',
  localEnd: '09:30',
};

const slot2 = {
  startUTC: '2026-10-15T07:30:00.000Z',
  endUTC: '2026-10-15T08:00:00.000Z',
  localStart: '09:30',
  localEnd: '10:00',
};

// Slot de madrugada: 22:30Z del día 15 = 00:30 del 16 en Madrid
const slotNextDay = {
  startUTC: '2026-10-15T22:30:00.000Z',
  endUTC: '2026-10-15T23:00:00.000Z',
  localStart: '00:30',
  localEnd: '01:00',
};

const slot3 = {
  startUTC: '2026-10-15T08:00:00.000Z',
  endUTC: '2026-10-15T08:30:00.000Z',
  localStart: '10:00',
  localEnd: '10:30',
};

/** Todas las páginas i18n necesitan el provider (F4.6c). */
function renderI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

interface SlotFixture {
  startUTC: string;
  endUTC: string;
  localStart: string;
  localEnd: string;
  employeeId?: string;
}

interface AvailabilityPage {
  slots: SlotFixture[];
  hasMore: boolean;
  nextFrom?: string;
}

let availabilityCall = 0;
let availabilityPage1: AvailabilityPage;
let availabilityPage2: AvailabilityPage;

function mockRoutes() {
  mockedGet.mockImplementation((url: string | object) => {
    const urlStr = String(url);
    if (urlStr.includes('/services')) return Promise.resolve({ data: [demoService, demoService2] });
    if (urlStr.includes('/employees')) return Promise.resolve({ data: [demoEmployee] });
    if (urlStr.includes('/tenants/me')) {
      return Promise.resolve({
        data: {
          timezone: 'Europe/Madrid',
          settings: { requireClientPhone: false, requireClientEmail: false },
        },
      });
    }
    if (urlStr.includes('/availability')) {
      availabilityCall += 1;
      return Promise.resolve({
        data: availabilityCall === 1 ? availabilityPage1 : availabilityPage2,
      });
    }
    return Promise.resolve({ data: [] });
  });
}

async function selectEmployeeAndService() {
  fireEvent.change(await screen.findByLabelText('Employee'), { target: { value: 'emp-1' } });
  // F4.5d: checkbox-list en lugar de select.
  fireEvent.click(screen.getByRole('checkbox', { name: /Classic Haircut/ }));
}

async function fillClient() {
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Laura' } });
  fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Gómez' } });
}

describe('CreateReservation (crear)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
    availabilityCall = 0;
    availabilityPage1 = { slots: [slot1, slot2], hasMore: false };
    availabilityPage2 = { slots: [slot3], hasMore: false };
    mockRoutes();
  });

  it('crea una reserva con el slot elegido (ASAP)', async () => {
    mockedPost.mockResolvedValue({ data: demoReservation });

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    await selectEmployeeAndService();

    fireEvent.click(await screen.findByText('09:00 - 09:30'));
    await fillClient();
    fireEvent.click(screen.getByRole('button', { name: /create reservation/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/reservations', {
        employeeId: 'emp-1',
        serviceIds: ['svc-1'],
        date: '2026-10-15',
        startTimeUTC: '2026-10-15T07:00:00.000Z',
        notes: null,
        client: {
          firstName: 'Laura',
          lastName: 'Gómez',
          phone: '',
          email: null,
        },
      });
    });
  });

  it('envía como date el día calendario del tenant (no el UTC)', async () => {
    mockedPost.mockResolvedValue({ data: demoReservation });
    availabilityPage1 = { slots: [slotNextDay], hasMore: false };

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    await selectEmployeeAndService();

    fireEvent.click(await screen.findByText('00:30 - 01:00'));
    await fillClient();
    fireEvent.click(screen.getByRole('button', { name: /create reservation/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        '/reservations',
        expect.objectContaining({
          date: '2026-10-16',
          startTimeUTC: '2026-10-15T22:30:00.000Z',
        })
      );
    });
  });

  it('sin slot seleccionado → error de validación local y no hace POST', async () => {
    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    await selectEmployeeAndService();
    await screen.findByText('09:00 - 09:30');
    await fillClient();
    fireEvent.click(screen.getByRole('button', { name: /create reservation/i }));

    expect(await screen.findByText('Select an available slot.')).toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('GET /availability ASAP: employeeId + duration sin from/to', async () => {
    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    await selectEmployeeAndService();
    await screen.findByText('09:00 - 09:30');

    expect(mockedGet).toHaveBeenCalledWith('/availability', {
      params: { employeeId: 'emp-1', serviceIds: 'svc-1' },
    });
  });

  it('toggle "Choose date" → date picker + refetch con from SIN to (F4.4c); volver resetea selección', async () => {
    availabilityPage2 = { slots: [slot1, slot2], hasMore: false };

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    await selectEmployeeAndService();
    fireEvent.click(await screen.findByText('09:00 - 09:30'));
    expect(
      screen.getByRole('button', { name: '09:00 - 09:30' }).getAttribute('aria-pressed')
    ).toBe('true');

    fireEvent.click(screen.getByText('Choose date'));
    expect(screen.getByLabelText('Date')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-20' } });

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/availability', {
        params: { employeeId: 'emp-1', serviceIds: 'svc-1', from: '2026-10-20' },
      });
    });

    fireEvent.click(screen.getByText('As soon as possible'));
    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/availability', {
        params: { employeeId: 'emp-1', serviceIds: 'svc-1' },
      });
    });
    expect(
      screen.getByRole('button', { name: '09:00 - 09:30' }).getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('"Load more" → añade la siguiente tanda con from=nextFrom', async () => {
    availabilityPage1 = {
      slots: [slot1, slot2],
      hasMore: true,
      nextFrom: '2026-10-15T07:31:00.000Z',
    };

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    await selectEmployeeAndService();
    await screen.findByText('09:00 - 09:30');
    expect(screen.getByText('09:30 - 10:00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('10:00 - 10:30')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('/availability', {
      params: { employeeId: 'emp-1', serviceIds: 'svc-1', from: '2026-10-15T07:31:00.000Z' },
    });
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('sin disponibilidad → mensaje de vacío', async () => {
    availabilityPage1 = { slots: [], hasMore: false };

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    await selectEmployeeAndService();

    expect(
      await screen.findByText(
        'No availability for this combination. Try another date or employee.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('muestra el error del backend (ej. overlap 409) sin navegar', async () => {
    mockedPost.mockRejectedValue({
      response: { status: 409, data: { error: 'Reservation overlaps an existing reservation' } },
    });

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    await selectEmployeeAndService();
    fireEvent.click(await screen.findByText('09:00 - 09:30'));
    await fillClient();
    fireEvent.click(screen.getByRole('button', { name: /create reservation/i }));

    expect(
      await screen.findByText('Reservation overlaps an existing reservation')
    ).toBeInTheDocument();
  });

  it('error de availability → mensaje con role=alert', async () => {
    mockedGet.mockImplementation((url: string | object) => {
      const urlStr = String(url);
      if (urlStr.includes('/services')) return Promise.resolve({ data: [demoService, demoService2] });
      if (urlStr.includes('/employees')) return Promise.resolve({ data: [demoEmployee] });
      if (urlStr.includes('/tenants/me')) return Promise.resolve({ data: { timezone: 'Europe/Madrid' } });
      if (urlStr.includes('/availability')) {
        return Promise.reject({ response: { data: { error: 'duration must be a multiple of slotDuration' } } });
      }
      return Promise.resolve({ data: [] });
    });

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    await selectEmployeeAndService();

    expect(
      await screen.findByText('duration must be a multiple of slotDuration')
    ).toBeInTheDocument();
  });

  it('admin no ve el formulario', () => {
    mockUser = { id: 'usr-admin', name: 'Admin', email: 'admin@demo.com', role: 'admin' };

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    expect(
      screen.getByText("You don't have permission to create reservations.")
    ).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('employee sí ve el formulario (DoD #13 T/T)', async () => {
    mockUser = { id: 'usr-emp', name: 'Employee', email: 'employee@demo.com', role: 'employee' };

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText('Employee')).toBeInTheDocument();
  });

  // ── F4.4c "sin preferencia" ─────────────────────────────

  it('F4.4c: el select abre en "No preference" y busca huecos sin employeeId', async () => {
    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    const select = await screen.findByLabelText('Employee');
    expect(select).toHaveValue('');
    expect(screen.getByRole('option', { name: 'No preference' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /Classic Haircut/ }));
    await screen.findByText('09:00 - 09:30');

    expect(mockedGet).toHaveBeenCalledWith('/availability', {
      params: { serviceIds: 'svc-1' },
    });
  });

  it('F4.4c: reserva sin elegir empleado → POST sin employeeId', async () => {
    availabilityPage1 = { slots: [{ ...slot1, employeeId: 'emp-1' }], hasMore: false };
    mockedPost.mockResolvedValue({ data: demoReservation });

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('checkbox', { name: /Classic Haircut/ }));
    fireEvent.click(await screen.findByRole('button', { name: /09:00 - 09:30/ }));
    await fillClient();
    fireEvent.click(screen.getByRole('button', { name: /create reservation/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        '/reservations',
        expect.objectContaining({
          serviceIds: ['svc-1'],
          employeeId: undefined,
          startTimeUTC: '2026-10-15T07:00:00.000Z',
        })
      );
    });
  });

  it('F4.4c: los slots sin preferencia muestran el nombre del empleado asignado', async () => {
    availabilityPage1 = {
      slots: [
        { ...slot1, employeeId: 'emp-1' },
        { ...slot2, employeeId: 'emp-2' },
      ],
      hasMore: false,
    };

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('checkbox', { name: /Classic Haircut/ }));
    fireEvent.click(await screen.findByRole('button', { name: /09:00 - 09:30/ }));

    // Slot con empleado desconocido → solo el horario (sin nombre).
    expect(screen.getByRole('button', { name: '09:30 - 10:00' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Employee Demo/ })).toBeInTheDocument();
  });

  it('F4.4c: allowCustomerAssignment=false → no se muestra el select de empleado', async () => {
    mockedGet.mockImplementation((url: string | object) => {
      const urlStr = String(url);
      if (urlStr.includes('/services')) return Promise.resolve({ data: [demoService, demoService2] });
      if (urlStr.includes('/employees')) return Promise.resolve({ data: [demoEmployee] });
      if (urlStr.includes('/tenants/me')) {
        return Promise.resolve({
          data: {
            timezone: 'Europe/Madrid',
            settings: {
              requireClientPhone: false,
              requireClientEmail: false,
              allowCustomerAssignment: false,
            },
          },
        });
      }
      if (urlStr.includes('/availability')) {
        availabilityCall += 1;
        return Promise.resolve({
          data: availabilityCall === 1 ? availabilityPage1 : availabilityPage2,
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('checkbox', { name: /Classic Haircut/ }));

    expect(screen.queryByLabelText('Employee')).not.toBeInTheDocument();
    expect(await screen.findByText('09:00 - 09:30')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('/availability', {
      params: { serviceIds: 'svc-1' },
    });
  });

  it('F4.4c: fecha sin huecos → aviso "No slots on X. Showing slots from Y"', async () => {
    availabilityPage2 = {
      slots: [
        {
          startUTC: '2026-10-22T07:00:00.000Z',
          endUTC: '2026-10-22T07:30:00.000Z',
          localStart: '09:00',
          localEnd: '09:30',
          employeeId: 'emp-1',
        },
      ],
      hasMore: false,
    };

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    await selectEmployeeAndService();
    await screen.findByText('09:00 - 09:30');

    fireEvent.click(screen.getByText('Choose date'));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-20' } });

    expect(
      await screen.findByText(
        'No slots on 2026-10-20. Showing slots from 2026-10-22.'
      )
    ).toBeInTheDocument();

    // Volver a "Lo antes posible" → sin fecha pedida, sin aviso.
    fireEvent.click(screen.getByText('As soon as possible'));
    await waitFor(() => {
      expect(screen.queryByTestId('slot-day-gap-notice')).not.toBeInTheDocument();
    });
  });

  // ── F4.5d multi-servicio ───────────────────────────────

  describe('F4.5d (multi-servicio)', () => {
    it('resumen con la suma de duración y de precio', async () => {
      renderI18n(
        <MemoryRouter>
          <CreateReservation />
        </MemoryRouter>
      );

      fireEvent.change(await screen.findByLabelText('Employee'), { target: { value: 'emp-1' } });
      fireEvent.click(screen.getByRole('checkbox', { name: /Classic Haircut/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Full Color/ }));

      expect(normalizedText(await screen.findByTestId('reservation-summary'))).toBe(
        `2 services · 75 min · ${formatPrice(108.5)}`.replace(/\u00A0/g, ' ')
      );
      await waitFor(() => {
        expect(mockedGet).toHaveBeenCalledWith('/availability', {
          params: { employeeId: 'emp-1', serviceIds: 'svc-1,svc-2' },
        });
      });
    });

    it('1 servicio → igual que hoy: serviceIds SIEMPRE en params y array en el body', async () => {
      mockedPost.mockResolvedValue({ data: demoReservation });

      renderI18n(
        <MemoryRouter>
          <CreateReservation />
        </MemoryRouter>
      );

      await selectEmployeeAndService();
      await screen.findByText('09:00 - 09:30');

      expect(normalizedText(screen.getByTestId('reservation-summary'))).toBe(
        `1 service · 30 min · ${formatPrice(25)}`.replace(/\u00A0/g, ' ')
      );
      expect(mockedGet).toHaveBeenCalledWith('/availability', {
        params: { employeeId: 'emp-1', serviceIds: 'svc-1' },
      });

      fireEvent.click(screen.getByText('09:00 - 09:30'));
      await fillClient();
      fireEvent.click(screen.getByRole('button', { name: /create reservation/i }));

      await waitFor(() => {
        expect(mockedPost).toHaveBeenCalledWith(
          '/reservations',
          expect.objectContaining({ serviceIds: ['svc-1'], employeeId: 'emp-1' })
        );
      });
      expect(mockedPost.mock.calls[0][1]).not.toHaveProperty('serviceId');
    });

    it('body con serviceIds en el orden de selección (multi)', async () => {
      // Los slots del 2º fetch son los mismos: cambiar de servicio
      // vuelve a pedir disponibilidad y repinta los botones.
      availabilityPage2 = { slots: [slot1, slot2], hasMore: false };
      mockedPost.mockResolvedValue({ data: demoReservation });

      renderI18n(
        <MemoryRouter>
          <CreateReservation />
        </MemoryRouter>
      );

      await selectEmployeeAndService();
      fireEvent.click(screen.getByRole('checkbox', { name: /Full Color/ }));
      await waitFor(() => {
        expect(screen.queryByTestId('slot-picker-loading')).not.toBeInTheDocument();
      });
      fireEvent.click(await screen.findByText('09:00 - 09:30'));
      await fillClient();
      fireEvent.click(screen.getByRole('button', { name: /create reservation/i }));

      await waitFor(() => {
        expect(mockedPost).toHaveBeenCalledWith(
          '/reservations',
          expect.objectContaining({ serviceIds: ['svc-1', 'svc-2'] })
        );
      });
      expect(mockedPost.mock.calls[0][1]).not.toHaveProperty('serviceId');
    });

    it('sin preferencia + multi → params con serviceIds y POST sin employeeId', async () => {
      availabilityPage1 = { slots: [{ ...slot1, employeeId: 'emp-1' }], hasMore: false };
      availabilityPage2 = { slots: [{ ...slot1, employeeId: 'emp-1' }], hasMore: false };
      mockedPost.mockResolvedValue({ data: demoReservation });

      renderI18n(
        <MemoryRouter>
          <CreateReservation />
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('checkbox', { name: /Classic Haircut/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Full Color/ }));
      await waitFor(() => {
        expect(screen.queryByTestId('slot-picker-loading')).not.toBeInTheDocument();
      });
      await screen.findByText('09:00 - 09:30');

      expect(mockedGet).toHaveBeenCalledWith('/availability', {
        params: { serviceIds: 'svc-1,svc-2' },
      });

      fireEvent.click(screen.getByRole('button', { name: /09:00 - 09:30/ }));
      await fillClient();
      fireEvent.click(screen.getByRole('button', { name: /create reservation/i }));

      await waitFor(() => {
        expect(mockedPost).toHaveBeenCalledWith(
          '/reservations',
          expect.objectContaining({ employeeId: undefined, serviceIds: ['svc-1', 'svc-2'] })
        );
      });
    });

    it('day-gap con multi: from sin to y bloque de la suma', async () => {
      availabilityPage2 = {
        slots: [
          {
            startUTC: '2026-10-22T07:00:00.000Z',
            endUTC: '2026-10-22T07:30:00.000Z',
            localStart: '09:00',
            localEnd: '09:30',
            employeeId: 'emp-1',
          },
        ],
        hasMore: false,
      };

      renderI18n(
        <MemoryRouter>
          <CreateReservation />
        </MemoryRouter>
      );

      await selectEmployeeAndService();
      fireEvent.click(screen.getByRole('checkbox', { name: /Full Color/ }));
      await screen.findByText('09:00 - 09:30');

      fireEvent.click(screen.getByText('Choose date'));
      fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-20' } });

      expect(
        await screen.findByText(
          'No slots on 2026-10-20. Showing slots from 2026-10-22.'
        )
      ).toBeInTheDocument();
      expect(mockedGet).toHaveBeenCalledWith('/availability', {
        params: { employeeId: 'emp-1', serviceIds: 'svc-1,svc-2', from: '2026-10-20' },
      });
    });
  });

  it('locale es → controles y resumen en español (F4.6c)', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');

    renderI18n(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    expect(await screen.findByText('Lo antes posible')).toBeInTheDocument();
    expect(screen.getByText('Elegir fecha')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sin preferencia' })).toBeInTheDocument();
  });
});
