/**
 * @file Register.tsx
 * @module pages
 *
 * Registro público de tenant + owner (F4.4b). Página pública sin
 * Layout (como CancelReservation). Valida en local (email válido,
 * password ≥ 8, campos obligatorios), llama a `UserContext.register`
 * (POST /auth/register + auto-login con el JWT devuelto) y redirige a
 * `/register/check-email?email=X` — NO a /tenant-config: la
 * verificación de email viene después (F4.4b decisión 1).
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useI18n, translateError } from '../i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { status?: number } }).response;
    if (response?.status === 409) return 'USER_EMAIL_EXISTS';
  }
  return undefined;
}

export default function Register() {
  const { register } = useUser();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function validate(): string[] {
    const errors: string[] = [];
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
      errors.push(t('auth.register.invalidEmail'));
    }
    if (password.length < 8) {
      errors.push(t('auth.register.passwordLength'));
    }
    if (!ownerName.trim()) errors.push(t('auth.register.ownerNameRequired'));
    if (!businessName.trim()) errors.push(t('auth.register.businessNameRequired'));
    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const errors = validate();
    if (errors.length > 0) {
      setError(errors.join(' · '));
      return;
    }

    setLoading(true);
    try {
      await register({
        email: email.trim(),
        password,
        ownerName: ownerName.trim(),
        businessName: businessName.trim(),
      });
      navigate(`/register/check-email?email=${encodeURIComponent(email.trim())}`);
    } catch (err) {
      if (errorCode(err) === 'USER_EMAIL_EXISTS') {
        setError(t('errors.USER_EMAIL_EXISTS'));
      } else {
        setError(translateError(err, t) || t('auth.register.failed'));
      }
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors';
  const labelClass = 'block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface border border-outline-variant/30 rounded-xl p-8">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded bg-surface-container-high border border-outline-variant/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary">movie</span>
          </div>
          <h1 className="font-headline-md text-headline-md text-primary font-bold tracking-tight">
            Events Starter
          </h1>
        </div>

        {error && (
          <div role="alert" className="bg-error-container text-on-error-container p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="register-email" className={labelClass}>
              {t('auth.register.email')}
            </label>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="register-password" className={labelClass}>
              {t('auth.register.password')}
            </label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="register-owner-name" className={labelClass}>
              {t('auth.register.ownerName')}
            </label>
            <input
              id="register-owner-name"
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="register-business-name" className={labelClass}>
              {t('auth.register.businessName')}
            </label>
            <input
              id="register-business-name"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-container text-on-primary-container font-title-sm text-title-sm py-3 px-4 rounded hover:bg-primary transition-colors disabled:opacity-50 mt-4"
          >
            {loading ? t('auth.register.submitting') : t('auth.register.submit')}
          </button>
        </form>

        <p className="text-center text-sm text-on-surface-variant mt-6">
          {t('auth.register.hasAccount')}{' '}
          <Link to="/login" className="text-primary hover:underline">
            {t('auth.register.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
