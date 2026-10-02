/**
 * @file VerificationBanner.tsx
 * @module components
 *
 * F4.4b: banner de verificación de email. Se pinta en Dashboard,
 * TenantConfig y las páginas de edición cuando
 * `settings.emailVerified === false` (nunca para admin — cada página
 * lo condiona con el rol). Opcionalmente lleva botón de reenvío
 * (`POST /auth/resend-verification`).
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useToast } from '../context/ToastContext';

interface VerificationBannerProps {
  message: string;
  /** Si se pasa, se muestra como link de acción (p.ej. /tenant-config). */
  linkTo?: string;
  linkLabel?: string;
  /** Botón "Reenviar email" (banner de TenantConfig). */
  showResend?: boolean;
}

function apiMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    if (typeof response?.data?.error === 'string') return response.data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

export default function VerificationBanner({
  message,
  linkTo,
  linkLabel,
  showResend = false,
}: VerificationBannerProps) {
  const { showSuccess, showError, showInfo } = useToast();
  const [sending, setSending] = useState(false);

  const handleResend = async () => {
    setSending(true);
    try {
      const res = await client.post('/auth/resend-verification');
      if (res.data?.sent === false) {
        showInfo('Tu email ya está verificado');
      } else {
        showSuccess('Email de verificación reenviado');
      }
    } catch (err) {
      showError(apiMessage(err, 'No se pudo reenviar el email'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 bg-[var(--color-amber,#f59e0b)]/10 border border-[var(--color-amber,#f59e0b)]/30 text-on-surface p-4 rounded-xl"
    >
      <span className="material-symbols-outlined text-[var(--color-amber,#f59e0b)]">mail</span>
      <p className="flex-1 min-w-[12rem] font-body-md text-body-md">{message}</p>
      {linkTo && (
        <Link
          to={linkTo}
          className="font-title-sm text-title-sm text-primary hover:text-primary-fixed-dim transition-colors"
        >
          {linkLabel ?? 'Confirmar email'}
        </Link>
      )}
      {showResend && (
        <button
          type="button"
          onClick={handleResend}
          disabled={sending}
          className="px-3 py-1.5 text-sm rounded border border-outline-variant/30 text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
        >
          {sending ? 'Enviando…' : 'Reenviar email'}
        </button>
      )}
    </div>
  );
}
