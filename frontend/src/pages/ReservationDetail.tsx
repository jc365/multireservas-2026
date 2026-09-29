/**
 * @file ReservationDetail.tsx
 * @module pages
 *
 * Detalle de reserva (F3.3): datos + relaciones, edición de notes y
 * cancelación (status → cancelled) para owner/employee. Muestra el
 * enlace público de cancelación por token.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import client from '../api/client';
import { useUser } from '../context/UserContext';
import { can } from '../utils/roleConfig';
import { STATUS_STYLES, clientName, formatSlot } from './Reservations';
import type { ReservationView } from './Reservations';

function apiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

export default function ReservationDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const [reservation, setReservation] = useState<ReservationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const canEdit = user ? can(user.role, 'editReservations') : false;
  const canView = user ? can(user.role, 'viewReservations') : false;

  const load = useCallback(() => {
    if (!id || !canView) return;
    client
      .get(`/reservations/${id}`)
      .then((res) => {
        setReservation(res.data);
        setNotes(res.data.notes ?? '');
      })
      .catch((err) => setError(apiError(err, 'Error loading reservation')))
      .finally(() => setLoading(false));
  }, [id, canView]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canView) {
    return (
      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6 max-w-lg">
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
        Loading reservation...
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="bg-error-container text-on-error-container p-4 rounded-xl">
        Error: {error || 'Reservation not found'}
      </div>
    );
  }

  const isActive = reservation.status === 'pending' || reservation.status === 'confirmed';

  const saveNotes = async () => {
    setActionError('');
    setSaving(true);
    try {
      const res = await client.put(`/reservations/${reservation.id}`, { notes });
      setReservation(res.data);
      setNotes(res.data.notes ?? '');
    } catch (err) {
      setActionError(apiError(err, 'Error updating notes'));
    } finally {
      setSaving(false);
    }
  };

  const cancelReservation = async () => {
    if (!window.confirm('Cancel this reservation?')) return;
    setActionError('');
    setSaving(true);
    try {
      const res = await client.put(`/reservations/${reservation.id}`, { status: 'cancelled' });
      setReservation(res.data);
    } catch (err) {
      setActionError(apiError(err, 'Error cancelling reservation'));
    } finally {
      setSaving(false);
    }
  };

  const cancelUrl = reservation.cancelToken
    ? `${window.location.origin}/reservations/cancel/${reservation.cancelToken}`
    : null;

  return (
    <div className="max-w-lg">
      <div className="flex justify-between items-center mb-6 gap-4">
        <h1 className="font-display-lg-mobile text-display-lg-mobile text-on-background">
          Reservation
        </h1>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border ${STATUS_STYLES[reservation.status] ?? STATUS_STYLES.cancelled}`}
        >
          {reservation.status}
        </span>
      </div>

      {actionError && (
        <div className="bg-error-container text-on-error-container p-3 rounded mb-4 text-sm">
          {actionError}
        </div>
      )}

      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6 space-y-4 mb-4">
        <div className="flex justify-between gap-4">
          <span className="text-on-surface-variant font-body-sm text-body-sm">Client</span>
          <span className="text-on-surface font-body-sm text-body-sm text-right">
            {clientName(reservation)}
            {reservation.client?.phone && (
              <span className="block text-on-surface-variant">{reservation.client.phone}</span>
            )}
            {reservation.client?.email && (
              <span className="block text-on-surface-variant">{reservation.client.email}</span>
            )}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-on-surface-variant font-body-sm text-body-sm">Service</span>
          <span className="text-on-surface font-body-sm text-body-sm text-right">
            {reservation.service?.name ?? '—'}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-on-surface-variant font-body-sm text-body-sm">Employee</span>
          <span className="text-on-surface font-body-sm text-body-sm text-right">
            {reservation.employee?.name ?? '—'}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-on-surface-variant font-body-sm text-body-sm">When</span>
          <span className="text-on-surface font-body-sm text-body-sm text-right">
            {formatSlot(reservation)} ({reservation.timezone}) · {reservation.duration} min
          </span>
        </div>
        {cancelUrl && (
          <div className="flex justify-between gap-4">
            <span className="text-on-surface-variant font-body-sm text-body-sm">Cancel link</span>
            <a
              href={cancelUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary font-body-sm text-body-sm break-all text-right"
            >
              {cancelUrl}
            </a>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-on-surface-variant font-body-sm text-body-sm">ID</span>
          <code className="text-xs text-outline bg-surface-container-high px-2 py-1 rounded">
            {reservation.id}
          </code>
        </div>
      </div>

      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6 space-y-4">
        <div>
          <label htmlFor="reservation-notes" className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
            Notes
          </label>
          <textarea
            id="reservation-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            disabled={!canEdit}
            className="w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors disabled:opacity-60"
          />
        </div>
        {canEdit && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={saveNotes}
              disabled={saving}
              className="flex-1 bg-primary-container text-on-primary-container font-title-sm text-title-sm py-2.5 px-4 rounded hover:bg-primary transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Notes'}
            </button>
            {isActive && (
              <button
                type="button"
                onClick={cancelReservation}
                disabled={saving}
                className="flex-1 bg-error-container text-on-error-container font-title-sm text-title-sm py-2.5 px-4 rounded hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                Cancel Reservation
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
