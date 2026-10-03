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
 *
 * F4.7b: botón "Reprogramar" (solo filas activas, `canEdit`) que abre
 * `RescheduleModal`. Del mismo listado de grupo se derivan además:
 * la **fila ancla** (primera activa por `startTimeUTC` → su id es el
 * destino del PUT, ver RescheduleModal), los `serviceIds` del bloque
 * (ancho de `GET /availability`) y el `groupCount` del aviso. Si el
 * listado falla se recurre a la propia fila (mismo techo de deuda que
 * `groupSize`). Tras reprogramar se recarga el detalle: la fila que
 * ve el usuario puede no ser la fila ancla que devuelve el PUT.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import client from '../api/client';
import RescheduleModal from '../components/RescheduleModal';
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
  // F4.5d: filas del grupo (null = sin grupo o listado inaccesible).
  const [groupRows, setGroupRows] = useState<ReservationView[] | null>(null);
  // F4.7b: modal de reprogramación + aviso de éxito.
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [notice, setNotice] = useState('');

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

  // F4.5d/F4.7b: traer las filas del grupo (mismo listado que antes
  // solo contaba). Sirve para el aviso de cancelación, el aviso de
  // reprogramación, la fila ancla y los serviceIds del bloque.
  const groupId = reservation?.groupBookingId ?? null;
  useEffect(() => {
    if (!groupId) {
      setGroupRows(null);
      return;
    }
    let cancelled = false;
    client
      .get('/reservations', { params: { limit: 200 } })
      .then((res) => {
        if (cancelled) return;
        const rows: ReservationView[] = Array.isArray(res.data) ? res.data : [];
        setGroupRows(rows.filter((row) => row.groupBookingId === groupId));
      })
      .catch(() => {
        if (!cancelled) setGroupRows(null);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  // F4.7b: filas activas del grupo ordenadas por inicio (mismo orden
  // que usa el backend para encadenar offsets). useMemo para que los
  // arrays de serviceIds sean estables en los deps del modal.
  const activeGroupRows = useMemo(() => {
    if (!reservation || !reservation.groupBookingId) return null;
    const rows = (groupRows ?? [])
      .filter(
        (row) =>
          row.groupBookingId === reservation.groupBookingId &&
          (row.status === 'pending' || row.status === 'confirmed')
      )
      .sort((a, b) => a.startTimeUTC.localeCompare(b.startTimeUTC));
    return rows.length > 0 ? rows : null;
  }, [reservation, groupRows]);

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
  // F4.5d: nº de filas para el aviso (null si no hay grupo, es de 1
  // fila o el listado falló). Derivado de groupRows (F4.7b).
  const groupSize = groupRows && groupRows.length > 1 ? groupRows.length : null;

  // F4.7b: parámetros del modal de reprogramación.
  const isGroup = Boolean(reservation.groupBookingId);
  // Ancla = primera fila activa del grupo (PUT sobre esa id con la
  // hora del slot tal cual) o la propia fila si no hay grupo / el
  // listado no estuvo disponible.
  const anchorId = activeGroupRows ? activeGroupRows[0].id : reservation.id;
  const serviceIds = activeGroupRows
    ? activeGroupRows.map((row) => row.serviceId)
    : [reservation.serviceId];
  const groupCount =
    isGroup && activeGroupRows && activeGroupRows.length > 1 ? activeGroupRows.length : null;

  const saveNotes = async () => {
    setActionError('');
    setNotice('');
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
    setNotice('');
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

  // F4.7b: la respuesta del PUT es la fila ANCLA, que puede no ser la
  // que se está viendo → recargar el detalle (trae también el
  // cancelToken nuevo) y avisar del éxito.
  const handleRescheduled = () => {
    setRescheduleOpen(false);
    setNotice(t('reservations.reschedule.success'));
    load();
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
      {notice && (
        <div
          role="status"
          data-testid="reschedule-notice"
          className="bg-surface-container text-on-surface p-3 rounded mb-4 text-sm"
        >
          {notice}
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
          <div className="space-y-3">
            <button
              type="button"
              onClick={saveNotes}
              disabled={saving}
              className="w-full bg-primary-container text-on-primary-container font-title-sm text-title-sm py-2.5 px-4 rounded hover:bg-primary transition-colors disabled:opacity-50"
            >
              {saving ? t('reservations.detail.saving') : t('reservations.detail.saveNotes')}
            </button>
            {isActive && (
              <div className="flex gap-3">
                <button
                  type="button"
                  data-testid="reschedule-open"
                  onClick={() => {
                    setNotice('');
                    setRescheduleOpen(true);
                  }}
                  disabled={saving}
                  className="flex-1 bg-surface-container-high text-on-surface font-title-sm text-title-sm py-2.5 px-4 rounded hover:bg-surface-container transition-colors disabled:opacity-50"
                >
                  {t('reservations.reschedule.button')}
                </button>
                <button
                  type="button"
                  onClick={cancelReservation}
                  disabled={saving}
                  className="flex-1 bg-error-container text-on-error-container font-title-sm text-title-sm py-2.5 px-4 rounded hover:opacity-80 transition-opacity disabled:opacity-50"
                >
                  {t('reservations.detail.cancel')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <RescheduleModal
        isOpen={rescheduleOpen}
        reservation={reservation}
        anchorId={anchorId}
        serviceIds={serviceIds}
        isGroup={isGroup}
        groupCount={groupCount}
        onClose={() => setRescheduleOpen(false)}
        onRescheduled={handleRescheduled}
      />
    </div>
  );
}
