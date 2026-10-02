/**
 * @file ReservationDetail.test.tsx
 * @module pages
 *
 * Tests de grupo en el detalle de reserva (F4.5d): total del grupo
 * (`groupTotalPrice`) y aviso de cancelación — nota visible y mensaje
 * del `window.confirm` con el número de filas. El resto de tests del
 * detalle (relaciones, notes, cancelación simple) viven en
 * `Reservations.test.tsx` (F3.3).
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ReservationDetail from './ReservationDetail';
import { formatPrice } from '../utils/booking';

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

function renderDetail(id = 'res-g1') {
  return render(
    <MemoryRouter initialEntries={[`/reservations/${id}`]}>
      <Routes>
        <Route path="/reservations/:id" element={<ReservationDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ReservationDetail (grupo, F4.5d)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
