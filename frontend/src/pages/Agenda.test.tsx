/**
 * @file Agenda.test.tsx
 * @module pages
 *
 * Tests de la agenda visual (F4.3): render del calendario semanal
 * con eventos mock, selector de empleado, click → detalle, refetch
 * por rango visible y filtro de canceladas.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import Agenda from './Agenda';

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

// FullCalendar real necesita mediciones de DOM; aquí se stubea para
// controlar datesSet (rango visible) y eventClick (navegación).
vi.mock('@fullcalendar/react', async () => {
  const { useEffect } = await import('react');
  interface CalendarProps {
    initialView?: string;
    events?: Array<Record<string, unknown>>;
    eventClick?: (info: { event: { id: string }; jsEvent: { preventDefault: () => void } }) => void;
    datesSet?: (arg: { start: Date; end: Date }) => void;
  }
  return {
    default: (props: CalendarProps) => {
      useEffect(() => {
        // Semana del 2026-03-02 (lun) al 2026-03-09 (dom excl.)
        props.datesSet?.({ start: new Date(2026, 2, 2), end: new Date(2026, 2, 9) });
      }, []);
      const events = props.events ?? [];
      const backgrounds = events.filter((event) => event.display === 'background');
      const reservations = events.filter((event) => event.display !== 'background');
      return (
        <div data-testid="fullcalendar" data-view={props.initialView}>
          <span data-testid="background-count">{backgrounds.length}</span>
          <button
            data-testid="next-week"
            onClick={() => props.datesSet?.({ start: new Date(2026, 2, 9), end: new Date(2026, 2, 16) })}
          >
            next week
          </button>
          {reservations.map((event) => (
            <button
              key={String(event.id)}
              data-testid={`event-${String(event.id)}`}
              onClick={() =>
                props.eventClick?.({
                  event: { id: String(event.id) },
                  jsEvent: { preventDefault: () => undefined },
                })
              }
            >
              {String(event.title)}
            </button>
          ))}
        </div>
      );
    },
  };
});

import client from '../api/client';

const mockedGet = vi.mocked(client.get);

const scheduleBlock = {
  label: 'Horario semanal',
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  start: '09:00',
  end: '18:00',
  breaks: [{ start: '13:00', end: '14:00' }],
  rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
};

const employeeOne = { id: 'emp-1', name: 'Ana Ruiz', isActive: true, customSchedule: null };
const employeeTwo = { id: 'emp-2', name: 'Luis Vega', isActive: true, customSchedule: null };

function makeReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    tenantId: 'tenant-demo',
    clientId: 'cli-1',
    employeeId: 'emp-1',
    serviceId: 'svc-1',
    date: '2026-03-03',
    startTimeUTC: '2026-03-03T10:00:00.000Z',
    endTimeUTC: '2026-03-03T10:30:00.000Z',
    timezone: 'UTC',
    duration: 30,
    status: 'confirmed',
    notes: null,
    activeKey: 'emp-1-2026-03-03-10:00',
    cancelToken: 'token-demo',
    client: { id: 'cli-1', firstName: 'Laura', lastName: 'Gómez', email: null, phone: '+34600111100' },
    employee: { id: 'emp-1', name: 'Ana Ruiz', isActive: true },
    service: { id: 'svc-1', name: 'Classic Haircut', duration: 30, price: 25 },
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
    ...overrides,
  };
}

function mockGetByRoute(reservations: unknown[]) {
  mockedGet.mockImplementation((url: string | object) => {
    const urlStr = String(url);
    if (urlStr === '/employees') return Promise.resolve({ data: [employeeOne, employeeTwo] });
    if (urlStr === '/tenants/me') return Promise.resolve({ data: { schedules: [scheduleBlock] } });
    if (urlStr === '/reservations') return Promise.resolve({ data: reservations });
    return Promise.resolve({ data: [] });
  });
}

function DetailProbe() {
  const { id } = useParams();
  return <div data-testid="detail">detail:{id}</div>;
}

function renderAgenda() {
  return render(
    <MemoryRouter initialEntries={['/agenda']}>
      <Routes>
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/reservations/:id" element={<DetailProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Agenda (F4.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'usr-owner', name: 'Owner', email: 'owner@demo.com', role: 'owner' };
  });

  it('renderiza el calendario semanal con reservas del rango y fondo de horario', async () => {
    mockGetByRoute([
      makeReservation({}),
      makeReservation({
        id: 'res-2',
        status: 'cancelled',
        startTimeUTC: '2026-03-04T12:00:00.000Z',
        endTimeUTC: '2026-03-04T12:30:00.000Z',
      }),
    ]);

    renderAgenda();

    const calendar = await screen.findByTestId('fullcalendar');
    expect(calendar).toHaveAttribute('data-view', 'timeGridWeek');
    expect(await screen.findByTestId('event-res-1')).toHaveTextContent('Laura Gómez · Classic Haircut');
    // Por defecto solo activas (F0 #8): la cancelada no se pinta
    expect(screen.queryByTestId('event-res-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('background-count')).toHaveTextContent('1');
    expect(mockedGet).toHaveBeenCalledWith('/reservations', {
      params: { from: '2026-03-02', to: '2026-03-08', limit: 200 },
    });
  });

  it('selector de empleado → refetch con employeeId', async () => {
    mockGetByRoute([makeReservation({})]);

    renderAgenda();
    await screen.findByTestId('fullcalendar');

    fireEvent.change(await screen.findByLabelText(/employee/i), { target: { value: 'emp-2' } });

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/reservations', {
        params: { from: '2026-03-02', to: '2026-03-08', limit: 200, employeeId: 'emp-2' },
      });
    });
  });

  it('click en un evento → navega al detalle de la reserva', async () => {
    mockGetByRoute([makeReservation({})]);

    renderAgenda();

    fireEvent.click(await screen.findByTestId('event-res-1'));
    expect(await screen.findByTestId('detail')).toHaveTextContent('detail:res-1');
  });

  it('cambiar de semana → refetch del nuevo rango visible', async () => {
    mockGetByRoute([makeReservation({})]);

    renderAgenda();
    await screen.findByTestId('fullcalendar');

    fireEvent.click(screen.getByTestId('next-week'));

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/reservations', {
        params: { from: '2026-03-09', to: '2026-03-15', limit: 200 },
      });
    });
  });

  it('checkbox "Include cancelled" → muestra canceladas sin refetch', async () => {
    mockGetByRoute([
      makeReservation({}),
      makeReservation({
        id: 'res-2',
        status: 'cancelled',
        startTimeUTC: '2026-03-04T12:00:00.000Z',
        endTimeUTC: '2026-03-04T12:30:00.000Z',
      }),
    ]);

    renderAgenda();
    await screen.findByTestId('event-res-1');
    expect(screen.queryByTestId('event-res-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/include cancelled/i));

    expect(await screen.findByTestId('event-res-2')).toBeInTheDocument();
    const reservationCalls = mockedGet.mock.calls.filter(([url]) => String(url) === '/reservations');
    expect(reservationCalls).toHaveLength(1);
  });
});
