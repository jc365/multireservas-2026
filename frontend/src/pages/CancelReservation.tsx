/**
 * @file CancelReservation.tsx
 * @module pages
 *
 * Página PÚBLICA de cancelación por token (F3.3 #10): fuera de
 * Layout, sin login. GET muestra la reserva; POST la cancela. Errores
 * 404 (token inválido) y 409 (ya cancelada) explicados al usuario.
 *
 * F4.5d: si la preview trae `groupBookingId` se avisa de que
 * cancelar anula el grupo entero (todas las filas del bloque).
 * No se muestra el número de filas: el listado exige autenticación
 * y esta página es pública.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import client from '../api/client';
import { translateError, useI18n } from '../i18n';
import type { ReservationView } from './Reservations';
import { STATUS_STYLES, clientName, formatSlot } from './Reservations';

type Phase = 'loading' | 'ready' | 'cancelling' | 'cancelled' | 'not_found' | 'already' | 'error';

export default function CancelReservation() {
  const { token } = useParams<{ token: string }>();
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('loading');
  const [reservation, setReservation] = useState<ReservationView | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    if (!token) {
      setPhase('not_found');
      return;
    }
    client
      .get(`/reservations/cancel/${token}`)
      .then((res) => {
        setReservation(res.data);
        setPhase(res.data.status === 'pending' || res.data.status === 'confirmed' ? 'ready' : 'already');
      })
      .catch((err) => {
        const status = err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
        if (status === 404) setPhase('not_found');
        else {
          setErrorMessage(translateError(err, t) || t('reservations.cancel.loadError'));
          setPhase('error');
        }
      });
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = () => {
    if (!token) return;
    setPhase('cancelling');
    client
      .post(`/reservations/cancel/${token}`)
      .then((res) => {
        setReservation(res.data);
        setPhase('cancelled');
      })
      .catch((err) => {
        const status = err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { status?: number; data?: { error?: string } } }).response
          : undefined;
        if (status?.status === 409) setPhase('already');
        else if (status?.status === 404) setPhase('not_found');
        else {
          setErrorMessage(translateError(err, t) || t('reservations.cancel.cancelError'));
          setPhase('error');
        }
      });
  };

  const card = (content: React.ReactNode) => (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6 max-w-md w-full">
        {content}
      </div>
    </div>
  );

  if (phase === 'loading' || phase === 'cancelling') {
    return card(
      <div className="flex items-center gap-3 text-on-surface-variant justify-center">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        {phase === 'loading'
          ? t('reservations.cancel.loading')
          : t('reservations.cancel.cancelling')}
      </div>
    );
  }

  if (phase === 'not_found') {
    return card(
      <div className="text-center space-y-3">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant">link_off</span>
        <h1 className="font-headline-md text-headline-md text-on-background">{t('reservations.cancel.notFound')}</h1>
        <p className="text-on-surface-variant font-body-md text-body-md">
          {t('reservations.cancel.notFoundHint')}
        </p>
      </div>
    );
  }

  if (phase === 'error') {
    return card(
      <div className="text-center space-y-3">
        <h1 className="font-headline-md text-headline-md text-on-background">{t('reservations.cancel.errorTitle')}</h1>
        <p className="text-on-surface-variant font-body-md text-body-md">{errorMessage}</p>
      </div>
    );
  }

  if (phase === 'already') {
    return card(
      <div className="text-center space-y-3">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant">event_busy</span>
        <h1 className="font-headline-md text-headline-md text-on-background">
          {t('reservations.cancel.alreadyTitle')}
        </h1>
        <p className="text-on-surface-variant font-body-md text-body-md">
          {t('reservations.cancel.alreadyBody')}
        </p>
      </div>
    );
  }

  if (phase === 'cancelled') {
    return card(
      <div className="text-center space-y-3">
        <span className="material-symbols-outlined text-5xl text-[var(--color-green,#22c55e)]">check_circle</span>
        <h1 className="font-headline-md text-headline-md text-on-background">{t('reservations.cancel.doneTitle')}</h1>
        <p className="text-on-surface-variant font-body-md text-body-md">
          {reservation ? `${clientName(reservation)} · ${formatSlot(reservation)}` : ''}
        </p>
      </div>
    );
  }

  return card(
    reservation && (
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant">event</span>
          <h1 className="font-headline-md text-headline-md text-on-background">
            {t('reservations.cancel.title')}
          </h1>
          {reservation.groupBookingId && (
            <p
              role="status"
              data-testid="group-cancel-notice"
              className="bg-surface-container text-on-surface font-body-sm text-body-sm rounded-lg p-3"
            >
              {t('reservations.cancel.groupNotice')}
            </p>
          )}
        </div>
        <div className="space-y-2 bg-surface-container rounded-lg p-4">
          <div className="flex justify-between gap-4">
            <span className="text-on-surface-variant font-body-sm text-body-sm">{t('reservations.fields.client')}</span>
            <span className="text-on-surface font-body-sm text-body-sm text-right">
              {clientName(reservation)}
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
              {formatSlot(reservation)} · {reservation.duration} min
            </span>
          </div>
          <div className="flex justify-center pt-1">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border ${STATUS_STYLES[reservation.status] ?? STATUS_STYLES.cancelled}`}
            >
              {t(`reservations.status.${reservation.status}`)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="w-full bg-error-container text-on-error-container font-title-sm text-title-sm py-3 px-4 rounded hover:opacity-80 transition-opacity"
        >
          {t('reservations.cancel.confirm')}
        </button>
      </div>
    )
  );
}
