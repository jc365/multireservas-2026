/**
 * @file Reservations.tsx
 * @module pages
 *
 * Lista de reservas del tenant (F3.3). owner y employee la ven y
 * pueden crear (editReservations); admin/client sin acceso. Filtro
 * por status vía query param.
 *
 * F4.5d: las filas que comparten `groupBookingId` se marcan con un
 * badge "N servicios" y muestran el total del grupo. El agrupado se
 * calcula SIEMPRE sobre las filas visibles (un Map por `groupBookingId`,
 * nunca por posición: filtros y paginación pueden desordenarlas).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useUser } from '../context/UserContext';
import { can } from '../utils/roleConfig';
import { formatPrice } from '../utils/booking';

export interface ReservationView {
  id: string;
  tenantId: string;
  clientId: string;
  employeeId: string;
  serviceId: string;
  date: string;
  startTimeUTC: string;
  endTimeUTC: string;
  timezone: string;
  duration: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  notes: string | null;
  activeKey: string | null;
  cancelToken: string | null;
  /** F4.5d: filas del mismo bloque multi-servicio comparten este id. */
  groupBookingId?: string | null;
  /** F4.5d: suma de precios del grupo (solo llega en filas de grupo). */
  groupTotalPrice?: number;
  client: { id: string; firstName: string; lastName: string; email: string | null; phone: string } | null;
  employee: { id: string; name: string; isActive: boolean } | null;
  service: { id: string; name: string; duration: number; price: number | null } | null;
  createdAt: string;
  updatedAt: string;
}

export const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-[var(--color-amber,#f59e0b)]/10 text-[var(--color-amber,#f59e0b)] border-[var(--color-amber,#f59e0b)]/30',
  confirmed: 'bg-[var(--color-green,#22c55e)]/10 text-[var(--color-green,#22c55e)] border-[var(--color-green,#22c55e)]/30',
  cancelled: 'bg-surface-container text-on-surface-variant border-outline-variant/30',
  completed: 'bg-[var(--color-blue,#3b82f6)]/10 text-[var(--color-blue,#3b82f6)] border-[var(--color-blue,#3b82f6)]/30',
  no_show: 'bg-[var(--color-red,#ef4444)]/10 text-[var(--color-red,#ef4444)] border-[var(--color-red,#ef4444)]/30',
};

export function clientName(reservation: Pick<ReservationView, 'client'>): string {
  if (!reservation.client) return '—';
  return `${reservation.client.firstName} ${reservation.client.lastName}`.trim();
}

export function formatSlot(reservation: Pick<ReservationView, 'date' | 'startTimeUTC'>): string {
  const start = new Date(reservation.startTimeUTC);
  const time = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${reservation.date} ${time}`;
}

const STATUS_OPTIONS = ['', 'pending', 'confirmed', 'cancelled', 'completed', 'no_show'];

export default function Reservations() {
  const { user } = useUser();
  const [reservations, setReservations] = useState<ReservationView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const canView = user ? can(user.role, 'viewReservations') : false;
  const canEdit = user ? can(user.role, 'editReservations') : false;

  useEffect(() => {
    let cancelled = false;
    if (!canView) {
      setLoading(false);
      return () => { cancelled = true; };
    }
    const params = statusFilter ? `?status=${statusFilter}` : '';
    client
      .get(`/reservations${params}`)
      .then((res) => {
        if (!cancelled) setReservations(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error loading reservations');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [canView, statusFilter]);

  if (!canView) {
    return (
      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6">
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          You don't have access to reservations.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        Loading reservations...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-error-container text-on-error-container p-4 rounded-xl">
        Error: {error}
      </div>
    );
  }

  // F4.5d: estadísticas de grupo sobre las filas VISIBLES (el filtro
  // de status puede dejar solo una fila del bloque en pantalla).
  const groupStats = new Map<string, { count: number; total: number }>();
  for (const reservation of reservations) {
    const groupId = reservation.groupBookingId;
    if (!groupId) continue;
    const stat = groupStats.get(groupId) ?? { count: 0, total: 0 };
    stat.count += 1;
    stat.total += reservation.service?.price ?? 0;
    groupStats.set(groupId, stat);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
        <h1 className="font-display-lg-mobile text-display-lg-mobile text-on-background">
          Reservations
        </h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-surface-container border border-outline-variant/30 text-on-surface px-2 py-1.5 rounded text-sm"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === '' ? 'All' : opt}
                </option>
              ))}
            </select>
          </label>
          {canEdit && (
            <Link
              to="/reservations/create"
              className="bg-primary-container text-on-primary-container font-title-sm text-title-sm py-2 px-4 rounded hover:bg-primary transition-colors"
            >
              Create Reservation
            </Link>
          )}
        </div>
      </div>

      {reservations.length === 0 ? (
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          No reservations yet.{canEdit ? ' Create the first one.' : ''}
        </p>
      ) : (
        <div className="space-y-4">
          {reservations.map((reservation) => {
            const groupStat = reservation.groupBookingId
              ? groupStats.get(reservation.groupBookingId)
              : undefined;
            return (
              <Link
                key={reservation.id}
                to={`/reservations/${reservation.id}`}
                className="block bg-surface border border-outline-variant/30 rounded-xl p-6 hover:border-primary/50 transition-colors"
              >
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div>
                    <h3 className="font-headline-md text-headline-md text-on-background">
                      {clientName(reservation)}
                    </h3>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-on-surface-variant font-body-sm text-body-sm">
                        {reservation.service?.name ?? '—'}
                      </span>
                      <span className="text-on-surface-variant font-body-sm text-body-sm">
                        {reservation.employee?.name ?? '—'}
                      </span>
                      <span className="text-on-surface font-body-sm text-body-sm font-medium">
                        {formatSlot(reservation)}
                      </span>
                      <span className="text-on-surface-variant font-body-sm text-body-sm">
                        {reservation.duration} min
                      </span>
                      {groupStat && (
                        <>
                          <span
                            data-testid={`group-badge-${reservation.id}`}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border bg-primary-container/40 text-on-primary-container border-primary/40"
                          >
                            {groupStat.count} servicio{groupStat.count === 1 ? '' : 's'}
                          </span>
                          <span
                            data-testid={`group-total-${reservation.id}`}
                            className="text-on-surface font-body-sm text-body-sm font-medium"
                          >
                            Total {formatPrice(groupStat.total)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border ${STATUS_STYLES[reservation.status] ?? STATUS_STYLES.cancelled}`}
                    >
                      {reservation.status}
                    </span>
                    <code className="text-xs text-outline bg-surface-container-high px-2 py-1 rounded">
                      {reservation.id}
                    </code>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
