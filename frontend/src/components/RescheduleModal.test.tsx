/**
 * @file RescheduleModal.test.tsx
 * @module components
 *
 * Tests del modal de reprogramación (F4.7b): avisos de grupo y de
 * token, selector de empleado ("Sin preferencia" / oculto si
 * `allowCustomerAssignment=false`), disponibilidad con `serviceIds`
 * (bloque del grupo), envío del PUT sobre la fila ancla (primera del
 * grupo), validaciones y errores.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RescheduleModal, { type RescheduleModalProps } from './RescheduleModal';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';
import type { ReservationView } from '../pages/Reservations';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import client from '../api/client';

const mockedGet = vi.mocked(client.get);
const mockedPut = vi.mocked(client.put);

const soloReservation = {
  id: 'res-1',
  tenantId: 'tenant-demo',
  clientId: 'cli-1',
  employeeId: 'emp-1',
  serviceId: 'svc-1',
  date: '2026-10-12',
  startTimeUTC: '2026-10-12T10:00:00.000Z',
  endTimeUTC: '2026-10-12T10:30:00.000Z',
  timezone: 'UTC',
  duration: 30,
  status: 'confirmed',
  notes: null,
  activeKey: 'emp-1-2026-10-12-10:00',
  cancelToken: 'token-orig-1',
  groupBookingId: null,
  client: { id: 'cli-1', firstName: 'Laura', lastName: 'Gómez', email: null, phone: '+34600111222' },
  employee: { id: 'emp-1', name: 'Employee Demo', isActive: true },
  service: { id: 'svc-1', name: 'Classic Haircut', duration: 30, price: 25 },
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
} as unknown as ReservationView;

const slot1 = {
  startUTC: '2026-10-15T19:00:00.000Z',
  endUTC: '2026-10-15T19:30:00.000Z',
  localStart: '19:00',
  localEnd: '19:30',
  employeeId: 'emp-9',
};

const employees = [
  { id: 'emp-1', name: 'Employee Demo', isActive: true },
  { id: 'emp-2', name: 'Inactive Emp', isActive: false },
];

interface MockApiOptions {
  employees?: typeof employees;
  settings?: Record<string, unknown>;
  slots?: typeof slot1[];
}

function mockApi({ employees: empList = employees, settings = {}, slots = [slot1] }: MockApiOptions = {}) {
  mockedGet.mockImplementation((url: string | object) => {
    const u = String(url);
    if (u === '/employees') return Promise.resolve({ data: empList });
    if (u === '/tenants/me') return Promise.resolve({ data: { settings, timezone: 'UTC' } });
    if (u === '/availability') {
      return Promise.resolve({ data: { slots, hasMore: false, nextFrom: null } });
    }
    return Promise.resolve({ data: [] });
  });
}

function renderModal(overrides: Partial<RescheduleModalProps> = {}) {
  const onClose = vi.fn();
  const onRescheduled = vi.fn();
  const props: RescheduleModalProps = {
    isOpen: true,
    reservation: soloReservation,
    anchorId: soloReservation.id,
    serviceIds: ['svc-1'],
    isGroup: false,
    groupCount: null,
    onClose,
    onRescheduled,
    ...overrides,
  };
  render(
    <I18nProvider>
      <RescheduleModal {...props} />
    </I18nProvider>
  );
  return { props, onClose, onRescheduled };
}

/** Hace clic en el primer slot del picker. */
async function pickFirstSlot() {
  const slotButton = await screen.findByRole('button', { name: '19:00 - 19:30' });
  fireEvent.click(slotButton);
}

describe('RescheduleModal (F4.7b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    mockApi();
  });

  it('avisa de que se reenviará el email con el enlace de cancelación nuevo', async () => {
    renderModal();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('reschedule-token-warning').textContent).toBe(
      'A new confirmation email will be sent with the updated cancellation link.'
    );
    expect(screen.queryByTestId('reschedule-group-warning')).not.toBeInTheDocument();
  });

  it('grupo: avisa de que se mueve el bloque entero con el nº de servicios', async () => {
    renderModal({ isGroup: true, groupCount: 2, serviceIds: ['svc-1', 'svc-2'] });

    expect(await screen.findByTestId('reschedule-group-warning').then((el) => el.textContent)).toBe(
      'This reservation is part of a block of 2 services. Rescheduling moves the whole block.'
    );
  });

  it('grupo sin nº conocido → aviso genérico del bloque', async () => {
    renderModal({ isGroup: true, groupCount: null });

    expect((await screen.findByTestId('reschedule-group-warning')).textContent).toBe(
      'This reservation is part of a multi-service block. Rescheduling moves the whole block.'
    );
  });

  it('selector de empleado arranca en "Sin preferencia" y solo lista activos', async () => {
    renderModal();

    const select = (await screen.findByLabelText('Employee')) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.getByRole('option', { name: 'No preference' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Employee Demo' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Inactive Emp' })).not.toBeInTheDocument();
  });

  it('allowCustomerAssignment=false → no se muestra el selector', async () => {
    mockApi({ settings: { allowCustomerAssignment: false } });
    renderModal();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByLabelText('Employee')).not.toBeInTheDocument();
  });

  it('pide disponibilidad con serviceIds (CSV) y sin employeeId', async () => {
    renderModal();

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/availability', {
        params: { serviceIds: 'svc-1' },
      });
    });
  });

  it('grupo: la disponibilidad usa la suma de servicios del bloque', async () => {
    renderModal({ isGroup: true, groupCount: 2, serviceIds: ['svc-1', 'svc-2'] });

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/availability', {
        params: { serviceIds: 'svc-1,svc-2' },
      });
    });
  });

  it('elige un slot y confirma → PUT con fecha/hora del slot y employeeId del slot', async () => {
    const { props } = renderModal();

    await pickFirstSlot();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reschedule' }));

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith('/reservations/res-1', {
        date: '2026-10-15',
        startTimeUTC: '2026-10-15T19:00:00.000Z',
        employeeId: 'emp-9',
      });
    });
    expect(props.onRescheduled).toHaveBeenCalled();
  });

  it('grupo: el PUT va anclado a la fila que indica el caller (1ª del grupo)', async () => {
    const { props } = renderModal({
      anchorId: 'res-g1',
      isGroup: true,
      groupCount: 2,
      serviceIds: ['svc-1', 'svc-2'],
    });

    await pickFirstSlot();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reschedule' }));

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith('/reservations/res-g1', {
        date: '2026-10-15',
        startTimeUTC: '2026-10-15T19:00:00.000Z',
        employeeId: 'emp-9',
      });
    });
    expect(props.onRescheduled).toHaveBeenCalled();
  });

  it('empleado elegido → disponibilidad filtrada y PUT con ese empleado', async () => {
    const { props } = renderModal();

    const select = await screen.findByLabelText('Employee');
    fireEvent.change(select, { target: { value: 'emp-1' } });

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/availability', {
        params: { serviceIds: 'svc-1', employeeId: 'emp-1' },
      });
    });

    await pickFirstSlot();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reschedule' }));

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith('/reservations/res-1', {
        date: '2026-10-15',
        startTimeUTC: '2026-10-15T19:00:00.000Z',
        employeeId: 'emp-1',
      });
    });
    expect(props.onRescheduled).toHaveBeenCalled();
  });

  it('modo fecha → pide disponibilidad con `from`', async () => {
    renderModal();

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose date' }));
    const dateInput = within(dialog).getByLabelText('Date');
    fireEvent.change(dateInput, { target: { value: '2026-10-20' } });

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/availability', {
        params: { serviceIds: 'svc-1', from: '2026-10-20' },
      });
    });
  });

  it('confirmar sin slot seleccionado → error y sin PUT', async () => {
    const { props } = renderModal();

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reschedule' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Select a new slot');
    expect(mockedPut).not.toHaveBeenCalled();
    expect(props.onRescheduled).not.toHaveBeenCalled();
  });

  it('el backend devuelve 409 → mensaje traducido y sin éxito', async () => {
    const { props } = renderModal();
    mockedPut.mockRejectedValue({
      response: {
        data: { error: { code: 'RESERVATION_OVERLAP', message: 'overlap' } },
      },
    });

    await pickFirstSlot();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reschedule' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That time slot overlaps an existing reservation.'
    );
    expect(props.onRescheduled).not.toHaveBeenCalled();
  });

  it('Escape y el botón Cancel cierran el modal', async () => {
    const { props, onClose } = renderModal();

    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(props.onRescheduled).not.toHaveBeenCalled();
  });

  it('locale es → avisos y botones en español (F4.6c)', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');
    renderModal({ isGroup: true, groupCount: 2 });

    expect((await screen.findByTestId('reschedule-group-warning')).textContent).toBe(
      'Esta reserva forma parte de un bloque de 2 servicios. Al reprogramar, se moverá el bloque entero.'
    );
    expect(screen.getByTestId('reschedule-token-warning').textContent).toBe(
      'Se enviará un nuevo email con el enlace de cancelación actualizado.'
    );
    expect(screen.getByRole('button', { name: 'Reprogramar' })).toBeInTheDocument();
  });
});
