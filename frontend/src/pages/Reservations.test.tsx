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
import CreateReservation from './CreateReservation';
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
const mockedPost = vi.mocked(client.post);
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
});

describe('CreateReservation (crear)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
    mockGetByRoute();
  });

  it('crea una reserva con cliente interno', async () => {
    mockedPost.mockResolvedValue({ data: demoReservation });

    render(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText('Employee'), { target: { value: 'emp-1' } });
    fireEvent.change(screen.getByLabelText('Service'), { target: { value: 'svc-1' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-05' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Laura' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Gómez' } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+34600111222' } });
    fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: 'laura@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /create reservation/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/reservations', {
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        date: '2026-10-05',
        startTimeUTC: new Date('2026-10-05T10:00:00').toISOString(),
        notes: null,
        client: {
          firstName: 'Laura',
          lastName: 'Gómez',
          phone: '+34600111222',
          email: 'laura@example.com',
        },
      });
    });
  });

  it('muestra el error del backend (ej. overlap 409) sin navegar', async () => {
    mockedPost.mockRejectedValue({ response: { status: 409, data: { error: 'Reservation overlaps an existing reservation' } } });

    render(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText('Employee'), { target: { value: 'emp-1' } });
    fireEvent.change(screen.getByLabelText('Service'), { target: { value: 'svc-1' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-05' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Laura' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Gómez' } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+34600111222' } });
    fireEvent.click(screen.getByRole('button', { name: /create reservation/i }));

    expect(
      await screen.findByText('Reservation overlaps an existing reservation')
    ).toBeInTheDocument();
  });

  it('admin no ve el formulario', () => {
    mockUser = { id: 'usr-admin', name: 'Admin', email: 'admin@demo.com', role: 'admin' };

    render(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    expect(
      screen.getByText("You don't have permission to create reservations.")
    ).toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('employee sí ve el formulario (DoD #13 T/T)', async () => {
    mockUser = { id: 'usr-emp', name: 'Employee', email: 'employee@demo.com', role: 'employee' };

    render(
      <MemoryRouter>
        <CreateReservation />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText('Employee')).toBeInTheDocument();
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
