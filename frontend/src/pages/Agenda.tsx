/**
 * @file Agenda.tsx
 * @module pages
 *
 * Agenda visual semanal con FullCalendar (F4.3). Vista
 * `timeGridWeek` por defecto con las reservas del rango visible
 * (refetch al cambiar de semana/vista), color por empleado, fondo
 * con el horario efectivo (RRULE derivada en F3.4) y click en un
 * evento → detalle. Filtro por empleado (default: todos) y opcional
 * para incluir canceladas. Sin drag&drop en v1 (F0 #5).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import rrulePlugin from '@fullcalendar/rrule';
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core';
import client from '../api/client';
import { useUser } from '../context/UserContext';
import { can } from '../utils/roleConfig';
import { translateError, useI18n } from '../i18n';
import { clientName } from './Reservations';
import type { ReservationView } from './Reservations';

export interface AgendaEmployee {
  id: string;
  name: string;
  isActive: boolean;
  customSchedule: unknown;
}

export interface ScheduleBlockView {
  label: string;
  days: string[];
  start: string;
  end: string;
  breaks?: { start: string; end: string }[];
  rrule?: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Paleta fija: color por empleado según orden del selector. */
const EMPLOYEE_COLORS = [
  '#2563eb', '#16a34a', '#d97706', '#7c3aed',
  '#db2777', '#0891b2', '#65a30d', '#dc2626',
];
const FALLBACK_COLOR = '#475569';
const CANCELLED_COLOR = '#94a3b8';
const BACKGROUND_COLOR = '#0ea5e9';

const ACTIVE_STATUSES = ['pending', 'confirmed'];
const VISIBLE_WITH_CANCELLED = ['pending', 'confirmed', 'cancelled'];

/** DayKey de bloques → código RRULE (dayMaster del backend, F3.4). */
const DAY_RRULE_CODES: Record<string, string> = {
  mon: 'MO', tue: 'TU', wed: 'WE', thu: 'TH',
  fri: 'FR', sat: 'SA', sun: 'SU',
};

/**
 * Ancla fija de la serie (lunes 2026-01-05): solo aporta la hora
 * del `DTSTART`; los días los gobierna `BYDAY` de la RRULE.
 */
const RRULE_ANCHOR_DATE = '20260105';

function formatDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isScheduleBlock(value: unknown): value is ScheduleBlockView {
  if (!value || typeof value !== 'object') return false;
  const block = value as ScheduleBlockView;
  return (
    typeof block.label === 'string' &&
    Array.isArray(block.days) &&
    block.days.length > 0 &&
    typeof block.start === 'string' &&
    TIME_RE.test(block.start) &&
    typeof block.end === 'string' &&
    TIME_RE.test(block.end) &&
    block.start < block.end
  );
}

/**
 * Bloques de horario crudos (customSchedule del empleado o
 * schedules del tenant) → bloques válidos. Acepta la misma forma
 * que el backend (array | { blocks } | { schedules } | {}).
 */
export function parseScheduleBlocks(raw: unknown): ScheduleBlockView[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw.filter(isScheduleBlock);
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const candidate = obj.blocks ?? obj.schedules;
    if (Array.isArray(candidate)) return candidate.filter(isScheduleBlock);
    return [];
  }
  return [];
}

/** RRULE del backend (F3.4) o derivada de `days` si no viene. */
function rruleForBlock(block: ScheduleBlockView): string {
  if (block.rrule) return block.rrule;
  const codes = block.days
    .map((day) => DAY_RRULE_CODES[day])
    .filter((code): code is string => Boolean(code));
  return `RRULE:FREQ=WEEKLY;BYDAY=${codes.join(',')}`;
}

/**
 * Bloque de horario → evento de fondo de FullCalendar. La RRULE
 * semanal se ancla con `DTSTART` = hora de inicio del bloque y la
 * duración va en `duration` (`H:MM`).
 */
export function scheduleBlockToEvent(block: ScheduleBlockView, index: number): EventInput {
  const [startHours, startMinutes] = block.start.split(':').map(Number);
  const [endHours, endMinutes] = block.end.split(':').map(Number);
  const minutes = endHours * 60 + endMinutes - startHours * 60 - startMinutes;
  const hhmm = `${String(startHours).padStart(2, '0')}${String(startMinutes).padStart(2, '0')}`;
  return {
    id: `schedule-${index}`,
    title: block.label,
    rrule: `DTSTART:${RRULE_ANCHOR_DATE}T${hhmm}00\n${rruleForBlock(block)}`,
    duration: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`,
    display: 'background',
    backgroundColor: BACKGROUND_COLOR,
    editable: false,
    startEditable: false,
    durationEditable: false,
  };
}

/** Reserva → evento del calendario (color del empleado). */
function reservationToEvent(reservation: ReservationView, color: string): EventInput {
  const service = reservation.service ? ` · ${reservation.service.name}` : '';
  return {
    id: reservation.id,
    title: `${clientName(reservation)}${service}`,
    start: reservation.startTimeUTC,
    end: reservation.endTimeUTC,
    backgroundColor: color,
    borderColor: color,
    editable: false,
    startEditable: false,
    durationEditable: false,
  };
}

export default function Agenda() {
  const { user } = useUser();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [reservations, setReservations] = useState<ReservationView[]>([]);
  const [employees, setEmployees] = useState<AgendaEmployee[]>([]);
  const [tenantSchedules, setTenantSchedules] = useState<ScheduleBlockView[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canView = user ? can(user.role, 'viewReservations') : false;

  // Catálogo: empleados (selector + colores) y horario del tenant
  // (fondo por defecto). El fondo es best-effort: si /tenants/me
  // falla, la agenda sigue siendo utilizable.
  useEffect(() => {
    let cancelled = false;
    if (!canView) {
      setLoading(false);
      return;
    }
    client
      .get('/employees')
      .then((res) => {
        if (!cancelled) setEmployees(res.data.filter((employee: AgendaEmployee) => employee.isActive));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(translateError(err, t) || t('agenda.employeesError'));
      });
    client
      .get('/tenants/me')
      .then((res) => {
        if (!cancelled) setTenantSchedules(parseScheduleBlocks(res.data.schedules));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [canView]);

  // Reservas del rango visible (F0 #10): refetch al cambiar de
  // semana/vista o de filtro de empleado.
  useEffect(() => {
    let cancelled = false;
    if (!canView || !range) return;
    setLoading(true);
    const params: Record<string, string | number> = {
      from: range.from,
      to: range.to,
      limit: 200,
    };
    if (employeeId) params.employeeId = employeeId;
    client
      .get('/reservations', { params })
      .then((res) => {
        if (!cancelled) setReservations(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(translateError(err, t) || t('agenda.reservationsError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canView, range, employeeId]);

  const visibleStatuses = includeCancelled ? VISIBLE_WITH_CANCELLED : ACTIVE_STATUSES;
  const visibleReservations = reservations.filter((reservation) =>
    visibleStatuses.includes(reservation.status)
  );

  const colorByEmployee = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach((employee, index) => {
      map[employee.id] = EMPLOYEE_COLORS[index % EMPLOYEE_COLORS.length];
    });
    return map;
  }, [employees]);

  // Horario efectivo (F4.1a): customSchedule del empleado elegido si
  // existe; de lo contrario el horario del tenant.
  const backgroundBlocks = useMemo(() => {
    const selected = employees.find((employee) => employee.id === employeeId);
    const custom = selected ? parseScheduleBlocks(selected.customSchedule) : [];
    return custom.length > 0 ? custom : tenantSchedules;
  }, [employees, employeeId, tenantSchedules]);

  const events: EventInput[] = useMemo(
    () => [
      ...backgroundBlocks.map((block, index) => scheduleBlockToEvent(block, index)),
      ...visibleReservations.map((reservation) =>
        reservationToEvent(
          reservation,
          reservation.status === 'cancelled'
            ? CANCELLED_COLOR
            : colorByEmployee[reservation.employeeId] ?? FALLBACK_COLOR
        )
      ),
    ],
    [backgroundBlocks, visibleReservations, colorByEmployee]
  );

  const handleDatesSet = (arg: DatesSetArg) => {
    const from = formatDay(arg.start);
    const to = formatDay(new Date(arg.end.getTime() - 1)); // end es exclusivo
    setRange((prev) => (prev && prev.from === from && prev.to === to ? prev : { from, to }));
  };

  const handleEventClick = (info: EventClickArg) => {
    info.jsEvent.preventDefault();
    // Los eventos de fondo (horario) no navegan.
    if (info.event.id.startsWith('schedule-')) return;
    navigate(`/reservations/${info.event.id}`);
  };

  if (!canView) {
    return (
      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6">
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          {t('agenda.noAccess')}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
        <h1 className="font-display-lg-mobile text-display-lg-mobile text-on-background">{t('agenda.title')}</h1>
        <div className="flex items-center gap-4 flex-wrap">
          <label
            htmlFor="agenda-employee"
            className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant"
          >
            {t('agenda.employee')}
            <select
              id="agenda-employee"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="bg-surface-container border border-outline-variant/30 text-on-surface px-2 py-1.5 rounded text-sm"
            >
              <option value="">{t('agenda.allEmployees')}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <label
            htmlFor="agenda-cancelled"
            className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant cursor-pointer"
          >
            <input
              id="agenda-cancelled"
              type="checkbox"
              checked={includeCancelled}
              onChange={(event) => setIncludeCancelled(event.target.checked)}
              className="accent-primary"
            />
            {t('agenda.includeCancelled')}
          </label>
          {loading && (
            <span
              className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant"
              data-testid="agenda-loading"
            >
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              {t('agenda.loading')}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl mb-4">
          {t('error')}: {error}
        </div>
      )}

      <div className="bg-surface border border-outline-variant/30 rounded-xl p-4">
        <FullCalendar
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin, rrulePlugin]}
          initialView="timeGridWeek"
          firstDay={1}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridWeek' }}
          allDaySlot={false}
          editable={false}
          selectable={false}
          nowIndicator
          height="auto"
          events={events}
          eventClick={handleEventClick}
          datesSet={handleDatesSet}
        />
      </div>

      <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">
        {t('agenda.footer')}
      </p>
    </div>
  );
}
