import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { translateError, useI18n } from '../i18n';

interface LoginFormProps {
  onLoginSuccess: () => void;
}

export default function LoginForm({ onLoginSuccess }: LoginFormProps) {
  const { login } = useUser();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login({ email, password });
      onLoginSuccess();
    } catch (err) {
      // F4.6a: code → clave i18n; si no hay clave (o no está traducida),
      // cae al `message` del backend (decisión F0 #7).
      setError(translateError(err, t) || t('auth.login.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
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
          <div className="bg-error-container text-on-error-container p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
              {t('auth.login.email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
              {t('auth.login.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-container text-on-primary-container font-title-sm text-title-sm py-3 px-4 rounded hover:bg-primary transition-colors disabled:opacity-50 mt-4"
          >
            {loading ? t('auth.login.submitting') : t('auth.login.submit')}
          </button>
        </form>

        <p className="text-center text-sm text-on-surface-variant mt-6">
          {t('auth.login.noAccount')}{' '}
          <Link to="/register" className="text-primary hover:underline">
            {t('auth.login.signUp')}
          </Link>
        </p>
      </div>
    </div>
  );
}
