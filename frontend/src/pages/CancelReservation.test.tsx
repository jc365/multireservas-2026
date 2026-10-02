/**
 * @file CancelReservation.test.tsx
 * @module pages
 *
 * Tests de la página pública de cancelación por token (F3.3) y del
 * aviso de grupo (F4.5d): si la preview trae `groupBookingId` se
 * avisa de que cancelar anula el grupo entero.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CancelReservation from './CancelReservation';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import client from '../api/client';

const mockedGet = vi.mocked(client.get);
const mockedPost = vi.mocked(client.post);

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

function renderPage(token = 'token-para-demo-0001') {
  return render(
    <MemoryRouter initialEntries={[`/reservations/cancel/${token}`]}>
      <Routes>
        <Route path="/reservations/cancel/:token" element={<CancelReservation />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CancelReservation (página pública)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra el resumen de la reserva y cancela con POST', async () => {
    mockedGet.mockResolvedValue({ data: demoReservation });
    mockedPost.mockResolvedValue({ data: { ...demoReservation, status: 'cancelled', activeKey: null } });

    renderPage();

    expect(await screen.findByText('Laura Gómez')).toBeInTheDocument();
    expect(screen.getByText('Classic Haircut')).toBeInTheDocument();
    expect(screen.getByText('Employee Demo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel it/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/reservations/cancel/token-para-demo-0001');
    });
    expect(await screen.findByText(/reservation cancelled/i)).toBeInTheDocument();
  });

  it('token inexistente → pantalla de no encontrado (sin POST)', async () => {
    mockedGet.mockRejectedValue({ response: { status: 404, data: { error: 'Reservation not found' } } });

    renderPage('token-inexistente');

    expect(await screen.findByText(/reservation not found|not found/i)).toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('reserva ya cancelada → muestra el estado y no permite reintentar', async () => {
    mockedGet.mockResolvedValue({ data: { ...demoReservation, status: 'cancelled' } });

    renderPage();

    expect(await screen.findByText(/already cancelled or finished/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel it/i })).not.toBeInTheDocument();
  });

  it('POST 409 (ya cancelada entre medias) → pantalla de ya cancelada', async () => {
    mockedGet.mockResolvedValue({ data: demoReservation });
    mockedPost.mockRejectedValue({
      response: { status: 409, data: { error: 'Reservation is already cancelled or finished' } },
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /cancel it/i }));

    expect(
      await screen.findByText(/already cancelled or finished/i)
    ).toBeInTheDocument();
  });

  // ── F4.5d aviso de grupo ───────────────────────────────

  it('F4.5d: la preview de un grupo avisa de que se cancela el grupo entero', async () => {
    mockedGet.mockResolvedValue({ data: { ...demoReservation, groupBookingId: 'grp-1' } });
    mockedPost.mockResolvedValue({
      data: { ...demoReservation, groupBookingId: 'grp-1', status: 'cancelled', activeKey: null },
    });

    renderPage();

    expect(await screen.findByTestId('group-cancel-notice')).toHaveTextContent(
      'This reservation is part of a group: cancelling it cancels the whole group.'
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel it/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/reservations/cancel/token-para-demo-0001');
    });
    expect(await screen.findByText(/reservation cancelled/i)).toBeInTheDocument();
  });

  it('F4.5d: reserva sin grupo → sin aviso de grupo', async () => {
    mockedGet.mockResolvedValue({ data: demoReservation });

    renderPage();

    expect(await screen.findByText('Laura Gómez')).toBeInTheDocument();
    expect(screen.queryByTestId('group-cancel-notice')).not.toBeInTheDocument();
  });
});
