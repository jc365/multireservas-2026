/**
 * @file SlotPicker.test.tsx
 * @module components
 *
 * Tests unitarios del selector de slots (F4.1b): agrupación por día,
 * selección (aria-pressed + callback), estado vacío, loading y
 * paginación "Cargar más".
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SlotPicker, { type SlotOption } from './SlotPicker';

const day1_0900: SlotOption = {
  startUTC: '2026-10-15T07:00:00.000Z',
  endUTC: '2026-10-15T07:30:00.000Z',
  localStart: '09:00',
  localEnd: '09:30',
};

const day1_0930: SlotOption = {
  startUTC: '2026-10-15T07:30:00.000Z',
  endUTC: '2026-10-15T08:00:00.000Z',
  localStart: '09:30',
  localEnd: '10:00',
};

const day2_1000: SlotOption = {
  startUTC: '2026-10-16T08:00:00.000Z',
  endUTC: '2026-10-16T08:30:00.000Z',
  localStart: '10:00',
  localEnd: '10:30',
};

const dayKeyOf = (slot: SlotOption) => slot.startUTC.slice(0, 10);

function renderPicker(overrides: Partial<Parameters<typeof SlotPicker>[0]> = {}) {
  const onSelect = vi.fn();
  const onLoadMore = vi.fn();
  const props = {
    slots: [day1_0900, day1_0930, day2_1000],
    selectedUTC: null,
    onSelect,
    hasMore: false,
    loading: false,
    onLoadMore,
    dayKeyOf,
    ...overrides,
  };
  render(<SlotPicker {...props} />);
  return { onSelect, onLoadMore };
}

describe('SlotPicker', () => {
  it('agrupa los slots por día y muestra localStart - localEnd', () => {
    renderPicker();

    expect(screen.getByTestId('slot-day-2026-10-15')).toBeInTheDocument();
    expect(screen.getByTestId('slot-day-2026-10-16')).toBeInTheDocument();
    expect(screen.getByText('09:00 - 09:30')).toBeInTheDocument();
    expect(screen.getByText('10:00 - 10:30')).toBeInTheDocument();
  });

  it('clic en un slot llama a onSelect con ese slot y lo destaca', () => {
    const { onSelect } = renderPicker({ selectedUTC: day1_0900.startUTC });

    const pressed = screen.getByRole('button', { name: '09:00 - 09:30' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '09:30 - 10:00' }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: '09:30 - 10:00' }));
    expect(onSelect).toHaveBeenCalledWith(day1_0930);
  });

  it('hasMore → botón Cargar más; el clic llama a onLoadMore', () => {
    const { onLoadMore } = renderPicker({ hasMore: true });

    const loadMore = screen.getByRole('button', { name: 'Cargar más' });
    fireEvent.click(loadMore);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('sin hasMore → no hay botón Cargar más', () => {
    renderPicker({ hasMore: false });

    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('loading → muestra Cargando... y oculta Cargar más', () => {
    renderPicker({ loading: true, hasMore: true });

    expect(screen.getByTestId('slot-picker-loading')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('slots vacíos y sin loading → mensaje vacío por defecto', () => {
    renderPicker({ slots: [] });

    expect(screen.getByTestId('slot-picker-empty')).toHaveTextContent(
      'No hay disponibilidad para esta combinación. Prueba otra fecha o empleado.'
    );
  });

  it('slots vacíos con loading → no muestra el mensaje vacío', () => {
    renderPicker({ slots: [], loading: true });

    expect(screen.queryByTestId('slot-picker-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('slot-picker-loading')).toBeInTheDocument();
  });

  // ── F4.4c "sin preferencia": employeeId por slot ────────

  it('slot con employeeId + employeeNameOf → muestra el nombre del empleado', () => {
    renderPicker({
      slots: [
        { ...day1_0900, employeeId: 'emp-1' },
        { ...day1_0930, employeeId: 'emp-2' },
        day2_1000,
      ],
      employeeNameOf: (id: string) => (id === 'emp-1' ? 'Ana Lopez' : 'Beto Ruiz'),
    });

    expect(screen.getByTestId('slot-employee-2026-10-15T07:00:00.000Z')).toHaveTextContent(
      'Ana Lopez'
    );
    expect(screen.getByTestId('slot-employee-2026-10-15T07:30:00.000Z')).toHaveTextContent(
      'Beto Ruiz'
    );
    expect(
      screen.getByRole('button', { name: /09:00 - 09:30\s*Ana Lopez/ })
    ).toBeInTheDocument();
    // Slot sin employeeId → no pinta nombre.
    expect(screen.queryByTestId('slot-employee-2026-10-16T08:00:00.000Z')).not.toBeInTheDocument();
  });

  it('slot con employeeId pero sin employeeNameOf → solo el horario', () => {
    renderPicker({ slots: [{ ...day1_0900, employeeId: 'emp-1' }] });

    expect(screen.getByRole('button', { name: '09:00 - 09:30' })).toBeInTheDocument();
    expect(
      screen.queryByTestId('slot-employee-2026-10-15T07:00:00.000Z')
    ).not.toBeInTheDocument();
  });

  it('employeeNameOf sin nombre resuelto → no pinta nada ni rompe el clic', () => {
    const { onSelect } = renderPicker({
      slots: [{ ...day1_0900, employeeId: 'emp-ghost' }],
      employeeNameOf: () => undefined,
    });

    const button = screen.getByRole('button', { name: '09:00 - 09:30' });
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith({ ...day1_0900, employeeId: 'emp-ghost' });
  });
});
