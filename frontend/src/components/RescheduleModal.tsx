/**
 * @file RescheduleModal.tsx
 * @module components
 *
 * Modal de reprogramación de reservas (F4.7b). Abre desde
 * `ReservationDetail` y envía `PUT /reservations/:id` con
 * `date` + `startTimeUTC` (+ `employeeId` opcional) — el backend
 * F4.7a decide el camino (simple o grupo).
 *
 * Decisiones clave:
 *
 * - **Ancla de grupo (F4.7b):** si la reserva pertenece a un grupo,
 *   el PUT se envía SIEMPRE sobre la **primera fila activa** del
 *   bloque (`anchorId`, calculado por el caller con el listado) con
 *   la hora del slot seleccionada tal cual. Así el backend encadena
 *   el resto de filas desde el inicio del bloque y la ventana libre
 *   que garantiza `GET /availability?serviceIds=…` (bloque completo
 *   hacia delante) coincide EXACTAMENTE con la ventana que luego
 *   valida el backend. Anclar sobre una fila intermedia desplazaría
 *   la ventana requerida hacia atrás y produciría 409 espurios.
 *   Reserva simple → ancla = la propia fila.
 * - **Reutiliza `SlotPicker`** con `GET /availability` y
 *   `serviceIds` (CSV) SIEMPRE, igual que `CreateReservation`
 *   (F4.5d): en grupo son los servicios de todas las filas activas
 *   (suma de duraciones = ancho del bloque).
 * - **"Sin preferencia" de empleado (F4.4c):** el select arranca
 *   vacío; los slots se piden sin `employeeId` (cualquier empleado
 *   capaz) y, al confirmar, se envía el `employeeId` que trae el
 *   slot elegido (el backend F4.7a no auto-asigna: sin `employeeId`
 *   conservaría el actual y la ventana mostrada podría no ser suya).
 *   Si `allowCustomerAssignment === false` no se muestra el select.
 * - **cancelToken:** lo regenera el backend (F4.7a); el modal solo
 *   avisa que se reenviará el email con el enlace nuevo. La recarga
 *   del detalle la hace el caller (`onRescheduled`), porque la fila
 *   que ve el usuario puede no ser la fila ancla que el PUT devuelve.
 *
 * Textos vía `useI18n()` — claves nuevas en `reservations.reschedule.*`
 * (en + es); el resto reutiliza `reservations.form.*` / `picker.*`.
 */

import { useEffect, useRef, useState } from 'react';
import client from '../api/client';
import SlotPicker, { type SlotOption } from './SlotPicker';
import { translateError, useI18n } from '../i18n';
import {
  reservationEmployeeId,
  serviceIdsParam,
  showEmployeePicker,
  tenantDateKey,
} from '../utils/booking';
import type { ReservationView } from '../pages/Reservations';

interface Employee {
  id: string;
  name: string;
  isActive: boolean;
}

type SlotMode = 'asap' | 'date';

export interface RescheduleModalProps {
  isOpen: boolean;
  /** Fila vista (para timezone y filtros); NO determina el id del PUT. */
  reservation: ReservationView;
  /** Id de la fila sobre la que se hace el PUT (1ª del grupo o la propia). */
  anchorId: string;
  /** serviceIds del bloque (grupo) o `[serviceId]` de la reserva simple. */
  serviceIds: string[];
  /** true si la reserva pertenece a un grupo. */
  isGroup: boolean;
  /** Nº de filas activas del grupo (para el aviso) o null si se desconoce. */
  groupCount: number | null;
  onClose: () => void;
  /** El caller recarga el detalle y cierra (la respuesta PUT es la fila ancla). */
  onRescheduled: () => void;
}

export default function RescheduleModal({
  isOpen,
  reservation,
  anchorId,
  serviceIds,
  isGroup,
  groupCount,
  onClose,
  onRescheduled,
}: RescheduleModalProps) {
  const { t } = useI18n();
  const timezone = reservation.timezone;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [allowCustomerAssignment, setAllowCustomerAssignment] = useState(true);
  const [mode, setMode] = useState<SlotMode>('asap');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextFrom, setNextFrom] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const seqRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Al abrir: estado limpio + datos del tenant/empleados + foco.
  useEffect(() => {
    if (!isOpen) return;
    seqRef.current++;
    setEmployees([]);
    setEmployeeId('');
    setAllowCustomerAssignment(true);
    setMode('asap');
    setDate('');
    setSlots([]);
    setHasMore(false);
    setNextFrom(null);
    setSelectedSlot(null);
    setSlotsLoading(false);
    setSlotsError('');
    setError('');
    setSubmitting(false);
    setTimeout(() => dialogRef.current?.focus(), 100);
    Promise.all([client.get('/employees'), client.get('/tenants/me')])
      .then(([employeesRes, tenantRes]) => {
        setEmployees(employeesRes.data.filter((employee: Employee) => employee.isActive));
        const settings = tenantRes.data?.settings;
        const allows = showEmployeePicker(
          settings && typeof settings === 'object' && typeof settings.allowCustomerAssignment === 'boolean'
            ? settings.allowCustomerAssignment
            : undefined
        );
        setAllowCustomerAssignment(allows);
        if (!allows) setEmployeeId('');
      })
      .catch(() => {
        setEmployees([]);
        setAllowCustomerAssignment(true);
      });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Disponibilidad: siempre con `serviceIds` (F4.5d), nunca `duration`.
  const availabilityReady = isOpen && serviceIds.length > 0 && (mode === 'asap' || Boolean(date));
  // Aviso cuando el día elegido no tiene huecos y el backend (`from`
  // sin `to`) devuelve slots de días posteriores (mismo patrón F4.4c).
  const requestedDay = mode === 'date' && date ? date : null;
  const firstSlotDay =
    requestedDay && !slotsLoading && slots.length > 0
      ? tenantDateKey(slots[0].startUTC, timezone)
      : null;
  const dayGapNotice = firstSlotDay && firstSlotDay !== requestedDay ? firstSlotDay : null;

  useEffect(() => {
    if (!availabilityReady) {
      setSlots([]);
      setHasMore(false);
      setNextFrom(null);
      setSelectedSlot(null);
      setSlotsLoading(false);
      setSlotsError('');
      return;
    }
    const seq = ++seqRef.current;
    setSlotsLoading(true);
    setSlotsError('');
    setSelectedSlot(null);
    const params: Record<string, string> = { serviceIds: serviceIdsParam(serviceIds) };
    if (employeeId) params.employeeId = employeeId;
    if (mode === 'date') params.from = date;
    client
      .get('/availability', { params })
      .then((res) => {
        if (seq !== seqRef.current) return;
        setSlots(res.data?.slots ?? []);
        setHasMore(res.data?.hasMore === true);
        setNextFrom(res.data?.nextFrom ?? null);
      })
      .catch((err) => {
        if (seq !== seqRef.current) return;
        setSlots([]);
        setHasMore(false);
        setNextFrom(null);
        setSlotsError(translateError(err, t) || t('reservations.reschedule.loadError'));
      })
      .finally(() => {
        if (seq === seqRef.current) setSlotsLoading(false);
      });
  }, [availabilityReady, employeeId, serviceIds, mode, date, isOpen]);

  if (!isOpen) return null;

  const handleLoadMore = async () => {
    if (!nextFrom || slotsLoading) return;
    const seq = ++seqRef.current;
    setSlotsLoading(true);
    try {
      const params: Record<string, string> = {
        serviceIds: serviceIdsParam(serviceIds),
        from: nextFrom,
      };
      if (employeeId) params.employeeId = employeeId;
      const res = await client.get('/availability', { params });
      if (seq !== seqRef.current) return;
      setSlots((prev) => [...prev, ...(res.data?.slots ?? [])]);
      setHasMore(res.data?.hasMore === true);
      setNextFrom(res.data?.nextFrom ?? null);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setSlotsError(translateError(err, t) || t('reservations.reschedule.loadError'));
    } finally {
      if (seq === seqRef.current) setSlotsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!selectedSlot) {
      setError(t('reservations.reschedule.selectSlot'));
      return;
    }
    setSubmitting(true);
    try {
      const body: { date: string; startTimeUTC: string; employeeId?: string } = {
        date: tenantDateKey(selectedSlot.startUTC, timezone),
        startTimeUTC: selectedSlot.startUTC,
      };
      // Elegido > employeeId del slot ("sin preferencia") > omitir
      // (el backend conserva el actual).
      const targetEmployee = reservationEmployeeId(employeeId) ?? selectedSlot.employeeId;
      if (targetEmployee) body.employeeId = targetEmployee;
      await client.put(`/reservations/${anchorId}`, body);
      onRescheduled();
    } catch (err) {
      setError(translateError(err, t) || t('reservations.reschedule.submitError'));
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors';
  const labelClass =
    'block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2';
  const toggleClass = (active: boolean) =>
    `flex-1 py-2 px-3 rounded border font-title-sm text-title-sm transition-colors ${
      active
        ? 'bg-primary-container text-on-primary-container border-primary'
        : 'bg-surface-container text-on-surface-variant border-outline-variant/30 hover:border-primary/50'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('reservations.reschedule.modalTitle')}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/30 w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto focus:outline-none"
      >
        <h2 className="font-headline-sm text-headline-sm text-on-surface mb-4">
          {t('reservations.reschedule.modalTitle')}
        </h2>

        {isGroup && (
          <p
            data-testid="reschedule-group-warning"
            className="bg-surface-container text-on-surface p-3 rounded mb-2 text-sm"
          >
            {groupCount !== null
              ? t('reservations.reschedule.groupWarning', { count: groupCount })
              : t('reservations.reschedule.groupWarningAny')}
          </p>
        )}
        <p
          data-testid="reschedule-token-warning"
          className="bg-surface-container text-on-surface p-3 rounded mb-4 text-sm"
        >
          {t('reservations.reschedule.tokenWarning')}
        </p>

        {error && (
          <div role="alert" className="bg-error-container text-on-error-container p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {showEmployeePicker(allowCustomerAssignment) && (
            <div>
              <label htmlFor="reschedule-employee" className={labelClass}>
                {t('reservations.form.employee')}
              </label>
              <select
                id="reschedule-employee"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className={inputClass}
              >
                <option value="">{t('reservations.form.noPreference')}</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <span className={labelClass} id="reschedule-when-label">
              {t('reservations.form.when')}
            </span>
            <div className="flex gap-2" role="group" aria-labelledby="reschedule-when-label">
              <button
                type="button"
                onClick={() => setMode('asap')}
                aria-pressed={mode === 'asap'}
                className={toggleClass(mode === 'asap')}
              >
                {t('reservations.form.asap')}
              </button>
              <button
                type="button"
                onClick={() => setMode('date')}
                aria-pressed={mode === 'date'}
                className={toggleClass(mode === 'date')}
              >
                {t('reservations.form.pickDate')}
              </button>
            </div>
            {mode === 'date' && (
              <div className="mt-3">
                <label htmlFor="reschedule-date" className={labelClass}>
                  {t('reservations.form.date')}
                </label>
                <input
                  id="reschedule-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
          </div>

          {availabilityReady && (
            <div>
              <span className={labelClass}>{t('reservations.form.slots')}</span>
              {slotsError && (
                <p
                  role="alert"
                  className="bg-error-container text-on-error-container p-3 rounded mb-2 text-sm"
                >
                  {slotsError}
                </p>
              )}
              {dayGapNotice && requestedDay && (
                <p
                  role="status"
                  className="bg-surface-container text-on-surface p-3 rounded mb-2 text-sm"
                  data-testid="slot-day-gap-notice"
                >
                  {t('reservations.form.dayGap', {
                    requestedDay,
                    firstDay: dayGapNotice,
                  })}
                </p>
              )}
              <SlotPicker
                slots={slots}
                selectedUTC={selectedSlot ? selectedSlot.startUTC : null}
                onSelect={setSelectedSlot}
                hasMore={hasMore}
                loading={slotsLoading}
                onLoadMore={handleLoadMore}
                dayKeyOf={(slot) => tenantDateKey(slot.startUTC, timezone)}
                employeeNameOf={
                  employeeId
                    ? undefined
                    : (id: string) => employees.find((employee) => employee.id === id)?.name
                }
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="py-2 px-4 rounded font-title-sm text-title-sm text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
            >
              {t('buttons.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || slotsLoading}
              className="py-2 px-4 rounded font-title-sm text-title-sm bg-primary-container text-on-primary-container hover:bg-primary transition-colors disabled:opacity-50"
            >
              {submitting
                ? t('reservations.reschedule.submitting')
                : t('reservations.reschedule.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
