/**
 * @file AdminTenants.tsx
 * @module pages/admin
 *
 * F4.0 superficie A: lista resumida de todos los tenants
 * (GET /admin/tenants) con link al detalle. Solo rol admin.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { translateError, useI18n } from '../../i18n';

interface TenantSummary {
  id: string;
  name: string;
  slug: string | null;
  currency: string;
  timezone: string;
  isActive: boolean;
  createdAt: string;
}

export default function AdminTenants() {
  const { t, formatDate } = useI18n();
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/admin/tenants');
      setTenants(data);
    } catch (err) {
      setError(translateError(err, t) || t('admin.tenants.loadError'));
    } finally {
      setLoading(false);
    }
    // `t` fuera de deps a propósito: cambiar de idioma no debe re-cargar.
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  return (
    <div className="max-w-container-max mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-title-lg font-semibold text-on-surface">{t('admin.tenants.title')}</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {t('admin.tenants.subtitle')}
          </p>
        </div>
        <Link
          to="/dashboard"
          className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          {t('common.nav.dashboard')}
        </Link>
      </div>

      {loading && <p className="text-sm text-on-surface-variant">{t('admin.tenants.loading')}</p>}
      {error && <p className="text-sm text-error">{error}</p>}

      {!loading && !error && tenants.length === 0 && (
        <p className="text-sm text-on-surface-variant">{t('admin.tenants.empty')}</p>
      )}

      {!loading && !error && tenants.length > 0 && (
        <div className="bg-surface border border-outline-variant/30 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-outline-variant/30">
                <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">{t('admin.tenants.columns.name')}</th>
                <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">{t('admin.tenants.columns.slug')}</th>
                <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">{t('admin.tenants.columns.currency')}</th>
                <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">{t('admin.tenants.columns.timezone')}</th>
                <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">{t('admin.tenants.columns.status')}</th>
                <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">{t('admin.tenants.columns.created')}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr
                  key={tenant.id}
                  className="border-b border-outline-variant/20 hover:bg-surface-container-low transition-colors"
                >
                  <td className="px-4 py-3 text-sm">
                    <Link
                      to={`/admin/tenants/${tenant.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {tenant.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{tenant.slug ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{tenant.currency}</td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{tenant.timezone}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        tenant.isActive
                          ? 'bg-success/10 text-success'
                          : 'bg-error/10 text-error'
                      }`}
                    >
                      {tenant.isActive ? t('admin.status.active') : t('admin.status.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant whitespace-nowrap">
                    {formatDate(tenant.createdAt, { dateStyle: 'medium' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
