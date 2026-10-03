/**
 * @file SlotPicker.tsx
 * @module components
 *
 * Selector de slots de disponibilidad (F4.1b). Recibe los slots ya
 * calculados por GET /availability (localStart/localEnd ya están en
 * la tz del tenant — el componente NO convierte), los agrupa por día
 * calendario (clave vía dayKeyOf), resalta el seleccionado
 * (aria-pressed), muestra mensaje vacío si no hay disponibilidad y
 * el botón "Load more" mientras hasMore sea true.
 *
 * F4.4c: si un slot trae `employeeId` (modo "sin preferencia") y se
 * pasa `employeeNameOf`, el botón muestra el nombre del empleado
 * asignado bajo el horario.
 *
 * F4.6c: textos vía `useI18n()` (namespace `reservations.picker.*`,
 * porque el picker se usa en CreateReservation); `emptyMessage` sigue
 * pudiendo inyectarse para sobrescribir el default.
 */

import { useI18n } from '../i18n';

export interface SlotOption {
  startUTC: string;
  endUTC: string;
  localStart: string;
  localEnd: string;
  /** F4.4c: empleado asignado cuando el usuario no eligió ninguno. */
  employeeId?: string;
}

interface SlotPickerProps {
  slots: SlotOption[];
  selectedUTC: string | null;
  onSelect: (slot: SlotOption) => void;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  dayKeyOf: (slot: SlotOption) => string;
  emptyMessage?: string;
  /** F4.4c: resuelve el nombre del empleado de un slot (si lo hay). */
  employeeNameOf?: (employeeId: string) => string | undefined;
}

export default function SlotPicker({
  slots,
  selectedUTC,
  onSelect,
  hasMore,
  loading,
  onLoadMore,
  dayKeyOf,
  emptyMessage,
  employeeNameOf,
}: SlotPickerProps) {
  const { t } = useI18n();
  const groups: { day: string; slots: SlotOption[] }[] = [];
  for (const slot of slots) {
    const day = dayKeyOf(slot);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.slots.push(slot);
    } else {
      groups.push({ day, slots: [slot] });
    }
  }

  return (
    <div className="space-y-4" data-testid="slot-picker">
      {slots.length === 0 && !loading && (
        <p
          className="text-on-surface-variant font-body-sm text-body-sm"
          data-testid="slot-picker-empty"
        >
          {emptyMessage ?? t('reservations.picker.empty')}
        </p>
      )}

      {groups.map((group) => (
        <div key={group.day}>
          <h3
            className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2"
            data-testid={`slot-day-${group.day}`}
          >
            {group.day}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {group.slots.map((slot) => {
              const active = selectedUTC === slot.startUTC;
              const employeeName =
                slot.employeeId && employeeNameOf ? employeeNameOf(slot.employeeId) : undefined;
              return (
                <button
                  key={slot.startUTC}
                  type="button"
                  onClick={() => onSelect(slot)}
                  aria-pressed={active}
                  className={`py-2 px-1 rounded border font-body-sm text-body-sm transition-colors ${
                    active
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container text-on-surface border-outline-variant/30 hover:border-primary/50'
                  }`}
                >
                  <span className="block">
                    {slot.localStart} - {slot.localEnd}
                  </span>
                  {employeeName && (
                    <span
                      className="block text-xs opacity-80 truncate"
                      data-testid={`slot-employee-${slot.startUTC}`}
                    >
                      {employeeName}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {loading && (
        <p className="text-on-surface-variant font-body-sm text-body-sm" data-testid="slot-picker-loading">
          {t('reservations.picker.loading')}
        </p>
      )}

      {hasMore && !loading && (
        <button
          type="button"
          onClick={onLoadMore}
          className="w-full bg-surface-container-high text-on-surface font-title-sm text-title-sm py-2 px-4 rounded hover:bg-surface-container-low transition-colors"
          data-testid="slot-picker-load-more"
        >
          {t('reservations.picker.loadMore')}
        </button>
      )}
    </div>
  );
}
