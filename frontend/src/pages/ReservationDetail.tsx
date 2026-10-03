/**
 * @file ReservationDetail.tsx
 * @module pages
 *
 * Detalle de reserva (F3.3): datos + relaciones, edición de notes y
 * cancelación (status → cancelled) para owner/employee. Muestra el
 * enlace público de cancelación por token.
 *
 * F4.5d: si la fila pertenece a un grupo (`groupBookingId`) se
 * muestra el total del grupo (`groupTotalPrice`, lo adjunta el
 * backend) y un aviso — también dentro del `window.confirm` — de que
 * cancelar anula TODAS las filas del grupo. El número de filas se
 * obtiene contando el listado (`GET /reservations`): el detalle no
 * trae ese dato (deuda: `groupSize` en la respuesta del backend).
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import client from '../api/client';
import { useUser } from '../context/UserContext';
import { can } from '../utils/roleConfig';
import { formatPrice, groupCancelText } from '../utils/booking';
import { translateError, useI18n } from '../i18n';
import { STATUS_STYLES, clientName, formatSlot } from './Reservations';
import type { ReservationView } from './Reservations';

export default function ReservationDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const { t } = useI18n();
  const [reservation, setReservation] = useState<ReservationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  // F4.5d: nº de filas del grupo (null = sin grupo o desconocido).
  const [groupSize, setGroupSize] = useState<number | null>(null);

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
      .catch((err) => setError(translateError(err, t) || t('reservations.detail.loadError')))
      .finally(() => setLoading(false));
  }, [id, canView]);

  useEffect(() => {
    load();
  }, [load]);

  // F4.5d: contar las filas del grupo para el aviso de cancelación.
  // El endpoint de detalle no devuelve el tamaño, así que se consulta
  // el listado (200 por página) y se cuentan las filas con el mismo
  // groupBookingId.
  const groupId = reservation?.groupBookingId ?? null;
  useEffect(() => {
    if (!groupId) {
      setGroupSize(null);
      return;
    }
    let cancelled = false;
    client
      .get('/reservations', { params: { limit: 200 } })
      .then((res) => {
        if (cancelled) return;
        const rows: ReservationView[] = Array.isArray(res.data) ? res.data : [];
        const count = rows.filter((row) => row.groupBookingId === groupId).length;
        setGroupSize(count > 1 ? count : null);
      })
      .catch(() => {
        if (!cancelled) setGroupSize(null);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  if (!canView) {
    return (
      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6 max-w-lg">
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          {t('reservations.noAccess')}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        {t('reservations.detail.loading')}
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="bg-error-container text-on-error-container p-4 rounded-xl">
        {t('error')}: {error || t('reservations.detail.notFound')}
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
      setActionError(translateError(err, t) || t('reservations.detail.notesError'));
    } finally {
      setSaving(false);
    }
  };

  const cancelReservation = async () => {
    // F4.5d: en grupo, el confirm también avisa de que se cancela
    // el bloque entero (todas las filas con ese groupBookingId).
    const confirmMessage = reservation.groupBookingId
      ? `${t('reservations.detail.cancelConfirm')} ${groupCancelText(groupSize, t)}`
      : t('reservations.detail.cancelConfirm');
    if (!window.confirm(confirmMessage)) return;
    setActionError('');
    setSaving(true);
    try {
      const res = await client.put(`/reservations/${reservation.id}`, { status: 'cancelled' });
      setReservation(res.data);
    } catch (err) {
      setActionError(translateError(err, t) || t('reservations.detail.cancelError'));
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
          {t('reservations.detail.title')}
        </h1>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border ${STATUS_STYLES[reservation.status] ?? STATUS_STYLES.cancelled}`}
        >
          {t(`reservations.status.${reservation.status}`)}
        </span>
      </div>

      {actionError && (
        <div className="bg-error-container text-on-error-container p-3 rounded mb-4 text-sm">
          {actionError}
        </div>
      )}

      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6 space-y-4 mb-4">
        <div className="flex justify-between gap-4">
          <span className="text-on-surface-variant font-body-sm text-body-sm">{t('reservations.fields.client')}</span>
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
          <span className="text-on-surface-variant font-body-sm text-body-sm">{t('reservations.fields.service')}</span>
          <span className="text-on-surface font-body-sm text-body-sm text-right">
            {reservation.service?.name ?? '—'}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-on-surface-variant font-body-sm text-body-sm">{t('reservations.fields.employee')}</span>
          <span className="text-on-surface font-body-sm text-body-sm text-right">
            {reservation.employee?.name ?? '—'}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-on-surface-variant font-body-sm text-body-sm">{t('reservations.fields.when')}</span>
          <span className="text-on-surface font-body-sm text-body-sm text-right">
            {formatSlot(reservation)} ({reservation.timezone}) · {reservation.duration} min
          </span>
        </div>
        {reservation.groupBookingId && (
          <div className="flex justify-between gap-4">
            <span className="text-on-surface-variant font-body-sm text-body-sm">{t('reservations.detail.groupTotal')}</span>
            <span
              data-testid="group-total"
              className="text-on-surface font-body-sm text-body-sm text-right font-medium"
            >
              {reservation.groupTotalPrice !== undefined
                ? formatPrice(reservation.groupTotalPrice)
                : '—'}
            </span>
          </div>
        )}
        {cancelUrl && (
          <div className="flex justify-between gap-4">
            <span className="text-on-surface-variant font-body-sm text-body-sm">{t('reservations.detail.cancelLink')}</span>
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
          <span className="text-on-surface-variant font-body-sm text-body-sm">{t('reservations.fields.id')}</span>
          <code className="text-xs text-outline bg-surface-container-high px-2 py-1 rounded">
            {reservation.id}
          </code>
        </div>
      </div>

      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6 space-y-4">
        <div>
          <label htmlFor="reservation-notes" className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
            {t('reservations.fields.notes')}
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
        {canEdit && reservation.groupBookingId && isActive && (
          <p
            data-testid="group-cancel-note"
            className="text-on-surface-variant font-body-sm text-body-sm"
          >
            {groupCancelText(groupSize, t)}
          </p>
        )}
        {canEdit && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={saveNotes}
              disabled={saving}
              className="flex-1 bg-primary-container text-on-primary-container font-title-sm text-title-sm py-2.5 px-4 rounded hover:bg-primary transition-colors disabled:opacity-50"
            >
              {saving ? t('reservations.detail.saving') : t('reservations.detail.saveNotes')}
            </button>
            {isActive && (
              <button
                type="button"
                onClick={cancelReservation}
                disabled={saving}
                className="flex-1 bg-error-container text-on-error-container font-title-sm text-title-sm py-2.5 px-4 rounded hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                {t('reservations.detail.cancel')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
