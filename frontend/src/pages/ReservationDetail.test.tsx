/**
 * @file ReservationDetail.test.tsx
 * @module pages
 *
 * Tests de grupo en el detalle de reserva (F4.5d): total del grupo
 * (`groupTotalPrice`) y aviso de cancelación — nota visible y mensaje
 * del `window.confirm` con el número de filas. El resto de tests del
 * detalle (relaciones, notes, cancelación simple) viven en
 * `Reservations.test.tsx` (F3.3).
 *
 * F4.7b: botón "Reprogramar" (apertura del modal, ausencia en filas
 * inactivas) y flujo de grupo anclado en la primera fila — el PUT va
 * a la fila 1 aunque se esté viendo la 2ª, y la recarga trae el
 * `cancelToken` nuevo.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ReservationDetail from './ReservationDetail';
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

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import client from '../api/client';

const mockedGet = vi.mocked(client.get);
const mockedPut = vi.mocked(client.put);

const baseRow = {
  tenantId: 'tenant-demo',
  clientId: 'cli-1',
  employeeId: 'emp-1',
  date: '2026-10-12',
  startTimeUTC: '2026-10-12T10:00:00.000Z',
  endTimeUTC: '2026-10-12T10:30:00.000Z',
  timezone: 'UTC',
  status: 'confirmed',
  notes: null,
  activeKey: 'emp-1-2026-10-12-10:00',
  cancelToken: 'token-grupo-0001',
  client: { id: 'cli-1', firstName: 'Laura', lastName: 'Gómez', email: null, phone: '+34600111222' },
  employee: { id: 'emp-1', name: 'Employee Demo', isActive: true },
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

// Fila 1 del grupo: 25 €, 30 min (25 + 18 = 43 € en total).
const groupRow1 = {
  ...baseRow,
  id: 'res-g1',
  serviceId: 'svc-1',
  duration: 30,
  groupBookingId: 'grp-1',
  groupTotalPrice: 43,
  service: { id: 'svc-1', name: 'Classic Haircut', duration: 30, price: 25 },
};

// Fila 2 del grupo: 18 €, 45 min.
const groupRow2 = {
  ...baseRow,
  id: 'res-g2',
  serviceId: 'svc-2',
  duration: 45,
  startTimeUTC: '2026-10-12T10:30:00.000Z',
  endTimeUTC: '2026-10-12T11:15:00.000Z',
  activeKey: 'emp-1-2026-10-12-10:30',
  groupBookingId: 'grp-1',
  groupTotalPrice: 43,
  service: { id: 'svc-2', name: 'Full Color', duration: 45, price: 18 },
};

const soloRow = {
  ...baseRow,
  id: 'res-solo',
  serviceId: 'svc-1',
  duration: 30,
  groupBookingId: null,
  service: { id: 'svc-1', name: 'Classic Haircut', duration: 30, price: 25 },
};

function mockRoutes(detail: unknown, list: unknown[]) {
  mockedGet.mockImplementation((url: string | object) => {
    const urlStr = String(url);
    if (urlStr === '/reservations') return Promise.resolve({ data: list });
    if (urlStr.includes('/reservations/')) return Promise.resolve({ data: detail });
    return Promise.resolve({ data: [] });
  });
}

/** Todas las páginas i18n necesitan el provider (F4.6c). */
function renderDetail(id = 'res-g1') {
  return render(
    <I18nProvider>
    <MemoryRouter initialEntries={[`/reservations/${id}`]}>
      <Routes>
        <Route path="/reservations/:id" element={<ReservationDetail />} />
      </Routes>
    </MemoryRouter>
    </I18nProvider>
  );
}

describe('ReservationDetail (grupo, F4.5d)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('muestra el total del grupo y el aviso con el número de reservas', async () => {
    mockRoutes(groupRow1, [groupRow1, groupRow2]);

    renderDetail();

    expect(await screen.findByText('Laura Gómez')).toBeInTheDocument();
    expect(screen.getByTestId('group-total').textContent).toBe(formatPrice(43));
    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/reservations', { params: { limit: 200 } });
      expect(screen.getByTestId('group-cancel-note').textContent).toBe(
        'Cancelling this reservation cancels all 2 reservations in the group.'
      );
    });
  });

  it('el confirm de cancelación avisa de que se cancela el grupo entero', async () => {
    mockRoutes(groupRow1, [groupRow1, groupRow2]);
    mockedPut.mockResolvedValue({ data: { ...groupRow1, status: 'cancelled', activeKey: null } });

    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('group-cancel-note').textContent).toBe(
        'Cancelling this reservation cancels all 2 reservations in the group.'
      );
    });
    fireEvent.click(screen.getByRole('button', { name: /cancel reservation/i }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Cancel this reservation? Cancelling this reservation cancels all 2 reservations in the group.'
    );
    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith('/reservations/res-g1', { status: 'cancelled' });
    });
  });

  it('reserva sin grupo → sin total, sin aviso y confirm clásico', async () => {
    mockRoutes(soloRow, [soloRow]);

    renderDetail('res-solo');

    expect(await screen.findByText('Laura Gómez')).toBeInTheDocument();
    expect(screen.queryByTestId('group-total')).not.toBeInTheDocument();
    expect(screen.queryByTestId('group-cancel-note')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel reservation/i }));

    expect(window.confirm).toHaveBeenCalledWith('Cancel this reservation?');
  });

  it('detalle de grupo con la lista inaccesible → aviso genérico (sin número)', async () => {
    mockRoutes(groupRow1, []);
    mockedGet.mockImplementation((url: string | object) => {
      const urlStr = String(url);
      if (urlStr === '/reservations') return Promise.reject(new Error('forbidden'));
      if (urlStr.includes('/reservations/')) return Promise.resolve({ data: groupRow1 });
      return Promise.resolve({ data: [] });
    });

    renderDetail();

    expect(await screen.findByTestId('group-total')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('group-cancel-note').textContent).toBe(
        'Cancelling this reservation cancels every reservation in the group.'
      );
    });
  });

  it('locale es → nota de grupo y confirm en español (F4.6c)', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');
    mockRoutes(groupRow1, [groupRow1, groupRow2]);

    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('group-cancel-note').textContent).toBe(
        'Cancelar esta reserva cancela las 2 reservas del grupo.'
      );
    });
    fireEvent.click(screen.getByRole('button', { name: /cancelar reserva/i }));

    expect(window.confirm).toHaveBeenCalledWith(
      '¿Cancelar esta reserva? Cancelar esta reserva cancela las 2 reservas del grupo.'
    );
    expect(screen.getByTestId('group-total').textContent).toBe(formatPrice(43));
  });
});

// ── F4.7b: reprogramación desde el detalle ──

const slotGroup = {
  startUTC: '2026-10-12T19:00:00.000Z',
  endUTC: '2026-10-12T20:15:00.000Z',
  localStart: '19:00',
  localEnd: '20:15',
  employeeId: 'emp-1',
};

// Respuesta del segundo GET del detalle (tras recargar): fila 2 a las
// 19:30 con cancelToken nuevo (lo regenera el backend, F4.7a).
const rescheduledRow2 = {
  ...groupRow2,
  date: '2026-10-12',
  startTimeUTC: '2026-10-12T19:30:00.000Z',
  endTimeUTC: '2026-10-12T20:15:00.000Z',
  activeKey: 'emp-1-2026-10-12-19:30',
  cancelToken: 'token-nuevo-999',
};

describe('ReservationDetail (reprogramación, F4.7b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('reserva simple activa → botón Reprogramar abre el modal', async () => {
    mockRoutes(soloRow, [soloRow]);

    renderDetail('res-solo');

    expect(await screen.findByText('Laura Gómez')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('reschedule-open'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('reschedule-token-warning')).toBeInTheDocument();
    expect(within(dialog).queryByTestId('reschedule-group-warning')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('reserva cancelada → sin botón Reprogramar', async () => {
    mockRoutes({ ...soloRow, status: 'cancelled' }, []);

    renderDetail('res-solo');

    expect(await screen.findByText('Laura Gómez')).toBeInTheDocument();
    expect(screen.queryByTestId('reschedule-open')).not.toBeInTheDocument();
  });

  it('grupo: viendo la 2ª fila, el PUT se ancla en la 1ª y recarga con token nuevo', async () => {
    // Detalle: 2ª fila (Tinte). El PUT debe ir a res-g1 con la hora
    // del slot tal cual (ancla = primera fila del bloque).
    const detailResponses = [groupRow2, rescheduledRow2];
    mockedGet.mockImplementation((url: string | object) => {
      const u = String(url);
      if (u === '/reservations') return Promise.resolve({ data: [groupRow1, groupRow2] });
      if (u === '/employees') {
        return Promise.resolve({ data: [{ id: 'emp-1', name: 'Employee Demo', isActive: true }] });
      }
      if (u === '/tenants/me') return Promise.resolve({ data: { settings: {} } });
      if (u === '/availability') {
        return Promise.resolve({ data: { slots: [slotGroup], hasMore: false, nextFrom: null } });
      }
      if (u.includes('/reservations/')) {
        return Promise.resolve({ data: detailResponses.shift() ?? rescheduledRow2 });
      }
      return Promise.resolve({ data: [] });
    });
    mockedPut.mockResolvedValue({
      data: { ...groupRow1, startTimeUTC: '2026-10-12T19:00:00.000Z' },
    });

    renderDetail('res-g2');

    expect(await screen.findByText('Laura Gómez')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('reschedule-open'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('reschedule-group-warning').textContent).toBe(
      'This reservation is part of a block of 2 services. Rescheduling moves the whole block.'
    );
    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/availability', {
        params: { serviceIds: 'svc-1,svc-2' },
      });
    });

    const slotButton = await within(dialog).findByRole('button', { name: /19:00 - 20:15/ });
    fireEvent.click(slotButton);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reschedule' }));

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith('/reservations/res-g1', {
        date: '2026-10-12',
        startTimeUTC: '2026-10-12T19:00:00.000Z',
        employeeId: 'emp-1',
      });
    });

    // Éxito: cierra, avisa y recarga la fila vista (puede no ser la ancla).
    expect(await screen.findByTestId('reschedule-notice')).toHaveTextContent(
      'Reservation rescheduled.'
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(await screen.findByText(/token-nuevo-999/)).toBeInTheDocument();
  });
});
