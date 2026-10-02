/**
 * @file CheckEmail.tsx
 * @module pages
 *
 * Página pública tras el registro (F4.4b): confirma que el email de
 * verificación se ha enviado. Dos acciones:
 * - "Reenviar email" → POST /auth/resend-verification.
 * - "Ya he verificado" → GET /tenants/me (sin caché); si
 *   `settings.emailVerified` es true → /tenant-config, si no → aviso
 *   "Aún no se ha verificado".
 *
 * Llega de Register con `?email=X`; sin query se muestra un mensaje
 * genérico.
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { useToast } from '../context/ToastContext';

function apiMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    if (typeof response?.data?.error === 'string') return response.data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

export default function CheckEmail() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const navigate = useNavigate();
  const { showSuccess, showInfo } = useToast();

  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function handleResend() {
    setError('');
    setResending(true);
    try {
      const res = await client.post('/auth/resend-verification');
      if (res.data?.sent === false) {
        showInfo('Tu email ya está verificado');
      } else {
        showSuccess('Email de verificación reenviado');
      }
    } catch (err) {
      setError(apiMessage(err, 'No se pudo reenviar el email'));
    } finally {
      setResending(false);
    }
  }

  async function handleCheck() {
    setError('');
    setNotice('');
    setChecking(true);
    try {
      const res = await client.get('/tenants/me', { params: { _t: Date.now() } });
      if (res.data?.settings?.emailVerified !== false) {
        navigate('/tenant-config');
      } else {
        setNotice('Aún no se ha verificado. Revisa tu email.');
      }
    } catch (err) {
      setError(apiMessage(err, 'No se pudo comprobar la verificación'));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface border border-outline-variant/30 rounded-xl p-8 text-center space-y-4">
        <span className="material-symbols-outlined text-5xl text-primary">mark_email_read</span>
        <h1 className="font-headline-md text-headline-md text-on-background">Confirma tu email</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {email ? (
            <>
              Te hemos enviado un email a{' '}
              <span className="text-on-surface font-medium">{email}</span>. Pulsa el enlace para
              confirmarlo.
            </>
          ) : (
            'Te hemos enviado un email con el enlace de confirmación. Pulsa el enlace para confirmarlo.'
          )}
        </p>

        {error && (
          <div role="alert" className="bg-error-container text-on-error-container p-3 rounded text-sm text-left">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="bg-[var(--color-amber,#f59e0b)]/10 border border-[var(--color-amber,#f59e0b)]/30 p-3 rounded text-sm">
            {notice}
          </div>
        )}

        <div className="flex flex-col gap-3 pt-2">
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking}
            className="w-full bg-primary-container text-on-primary-container font-title-sm text-title-sm py-3 px-4 rounded hover:bg-primary transition-colors disabled:opacity-50"
          >
            {checking ? 'Comprobando…' : 'Ya he verificado'}
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="w-full border border-outline-variant/30 text-on-surface font-title-sm text-title-sm py-3 px-4 rounded hover:bg-surface-container transition-colors disabled:opacity-50"
          >
            {resending ? 'Enviando…' : 'Reenviar email'}
          </button>
        </div>
      </div>
    </div>
  );
}
