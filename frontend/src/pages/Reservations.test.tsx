/**
 * @file Reservations.test.tsx
 * @module pages
 *
 * Tests de las páginas de reservations (F3.3): lista con filtro,
 * alta (cliente interno) y detalle con cancelación.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Reservations from './Reservations';
import ReservationDetail from './ReservationDetail';

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

const demoService = {
  id: 'svc-1',
  tenantId: 'tenant-demo',
  name: 'Classic Haircut',
  duration: 30,
  price: 25,
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
  date: '2026-10-05',
  startTimeUTC: '2026-10-05T10:00:00.000Z',
  endTimeUTC: '2026-10-05T10:30:00.000Z',
  timezone: 'UTC',
  duration: 30,
  status: 'confirmed',
  notes: null,
  activeKey: 'emp-1-2026-10-05-10:00',
  cancelToken: 'token-para-demo-0001',
  client: { id: 'cli-1', firstName: 'Laura', lastName: 'Gómez', email: 'laura@example.com', phone: '+34600111222' },
  employee: { id: 'emp-1', name: 'Employee Demo', isActive: true },
  service: { id: 'svc-1', name: 'Classic Haircut', duration: 30, price: 25 },
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

// F4.5d: dos filas del mismo grupo (25 € + 18 € = 43 €).
const groupRow1 = {
  ...demoReservation,
  id: 'res-g1',
  groupBookingId: 'grp-1',
  serviceId: 'svc-1',
  service: { id: 'svc-1', name: 'Classic Haircut', duration: 30, price: 25 },
};

const groupRow2 = {
  ...demoReservation,
  id: 'res-g2',
  groupBookingId: 'grp-1',
  serviceId: 'svc-2',
  startTimeUTC: '2026-10-05T10:30:00.000Z',
  endTimeUTC: '2026-10-05T11:15:00.000Z',
  duration: 45,
  activeKey: 'emp-1-2026-10-05-10:30',
  service: { id: 'svc-2', name: 'Full Color', duration: 45, price: 18 },
};

// Fila ajena al grupo, intercalada entre las dos filas del bloque.
const otherRow = {
  ...demoReservation,
  id: 'res-other',
  groupBookingId: null,
  serviceId: 'svc-3',
  service: { id: 'svc-3', name: 'Manicure', duration: 45, price: 18 },
};

function mockGetByRoute() {
  mockedGet.mockImplementation((url: string | object) => {
    const urlStr = String(url);
    if (urlStr.includes('/services')) return Promise.resolve({ data: [demoService] });
    if (urlStr.includes('/employees') && !urlStr.includes('/reservations')) return Promise.resolve({ data: [demoEmployee] });
    if (/\/reservations\/cancel\//.test(urlStr)) return Promise.resolve({ data: demoReservation });
    if (/\/reservations\/.+/.test(urlStr)) return Promise.resolve({ data: demoReservation });
    if (urlStr.includes('/reservations')) return Promise.resolve({ data: [demoReservation] });
    return Promise.resolve({ data: [] });
  });
}

describe('Reservations (lista)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
  });

  it('lista las reservas con cliente, servicio y estado', async () => {
    mockGetByRoute();

    render(
      <MemoryRouter>
        <Reservations />
      </MemoryRouter>
    );

    expect(await screen.findByText('Laura Gómez')).toBeInTheDocument();
    expect(screen.getByText('Classic Haircut')).toBeInTheDocument();
    expect(screen.getByText('Employee Demo')).toBeInTheDocument();
    expect(screen.getAllByText('confirmed').length).toBeGreaterThan(0);
    expect(mockedGet).toHaveBeenCalledWith('/reservations');
  });

  it('el filtro de status cambia la query', async () => {
    mockGetByRoute();

    render(
      <MemoryRouter>
        <Reservations />
      </MemoryRouter>
    );

    await screen.findByText('Laura Gómez');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'cancelled' } });

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/reservations?status=cancelled');
    });
  });

  it('estado vacío sin reservas', async () => {
    mockedGet.mockResolvedValue({ data: [] });

    render(
      <MemoryRouter>
        <Reservations />
      </MemoryRouter>
    );

    expect(await screen.findByText('No reservations yet. Create the first one.')).toBeInTheDocument();
  });

  it('admin (plataforma) no tiene acceso', () => {
    mockUser = { id: 'usr-admin', name: 'Admin', email: 'admin@demo.com', role: 'admin' };

    render(
      <MemoryRouter>
        <Reservations />
      </MemoryRouter>
    );

    expect(screen.getByText("You don't have access to reservations.")).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('employee ve la lista y el botón de crear (editReservations T/T)', async () => {
    mockUser = { id: 'usr-emp', name: 'Employee', email: 'employee@demo.com', role: 'employee' };
    mockGetByRoute();

    render(
      <MemoryRouter>
        <Reservations />
      </MemoryRouter>
    );

    expect(await screen.findByText('Laura Gómez')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create reservation/i })).toBeInTheDocument();
  });

  // ── F4.5d agrupación en el listado ─────────────────────

  it('F4.5d: badge "2 servicios" y total del grupo en las filas del bloque', async () => {
    mockedGet.mockResolvedValue({ data: [groupRow1, groupRow2] });

    render(
      <MemoryRouter>
        <Reservations />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('group-badge-res-g1')).toHaveTextContent('2 servicios');
    expect(screen.getByTestId('group-badge-res-g2')).toHaveTextContent('2 servicios');
    // 25 € + 18 € = 43 € sobre las filas visibles.
    expect(screen.getByTestId('group-total-res-g1').textContent).toContain('43,00');
    expect(screen.getByTestId('group-total-res-g2').textContent).toContain('43,00');
  });

  it('F4.5d: el agrupado no depende de la posición de las filas', async () => {
    mockedGet.mockResolvedValue({ data: [groupRow1, otherRow, groupRow2] });

    render(
      <MemoryRouter>
        <Reservations />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('group-badge-res-g1')).toHaveTextContent('2 servicios');
    expect(screen.getByTestId('group-badge-res-g2')).toHaveTextContent('2 servicios');
    expect(screen.getByTestId('group-total-res-g1').textContent).toContain('43,00');
    expect(screen.queryByTestId('group-badge-res-other')).not.toBeInTheDocument();
    expect(screen.queryByTestId('group-total-res-other')).not.toBeInTheDocument();
  });

  it('F4.5d: filas sin grupo → sin badge y sin total', async () => {
    mockGetByRoute();

    render(
      <MemoryRouter>
        <Reservations />
      </MemoryRouter>
    );

    expect(await screen.findByText('Laura Gómez')).toBeInTheDocument();
    expect(screen.queryByTestId('group-badge-res-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('group-total-res-1')).not.toBeInTheDocument();
  });
});

describe('ReservationDetail (detalle)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
    mockGetByRoute();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('muestra el detalle con relaciones y enlace de cancelación', async () => {
    render(
      <MemoryRouter initialEntries={['/reservations/res-1']}>
        <Routes>
          <Route path="/reservations/:id" element={<ReservationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Laura Gómez')).toBeInTheDocument();
    expect(screen.getByText('Classic Haircut')).toBeInTheDocument();
    expect(screen.getByText('Employee Demo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\/reservations\/cancel\// })).toBeInTheDocument();
    expect(screen.getByText('confirmed')).toBeInTheDocument();
  });

  it('guarda las notes con PUT', async () => {
    mockedPut.mockResolvedValue({ data: { ...demoReservation, notes: 'llega tarde' } });

    render(
      <MemoryRouter initialEntries={['/reservations/res-1']}>
        <Routes>
          <Route path="/reservations/:id" element={<ReservationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText('Notes'), { target: { value: 'llega tarde' } });
    fireEvent.click(screen.getByRole('button', { name: /save notes/i }));

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith('/reservations/res-1', { notes: 'llega tarde' });
    });
  });

  it('cancela la reserva con PUT status=cancelled', async () => {
    mockedPut.mockResolvedValue({ data: { ...demoReservation, status: 'cancelled', activeKey: null } });

    render(
      <MemoryRouter initialEntries={['/reservations/res-1']}>
        <Routes>
          <Route path="/reservations/:id" element={<ReservationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /cancel reservation/i }));

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith('/reservations/res-1', { status: 'cancelled' });
    });
    expect(await screen.findByText('cancelled')).toBeInTheDocument();
  });
});
