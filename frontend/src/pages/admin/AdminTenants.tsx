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

interface TenantSummary {
  id: string;
  name: string;
  slug: string | null;
  currency: string;
  timezone: string;
  isActive: boolean;
  createdAt: string;
}

function apiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

export default function AdminTenants() {
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
      setError(apiError(err, 'Could not load tenants'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  return (
    <div className="max-w-container-max mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-title-lg font-semibold text-on-surface">Tenants</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Platform overview — click a tenant to manage its configuration.
          </p>
        </div>
        <Link
          to="/dashboard"
          className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Dashboard
        </Link>
      </div>

      {loading && <p className="text-sm text-on-surface-variant">Loading tenants…</p>}
      {error && <p className="text-sm text-error">{error}</p>}

      {!loading && !error && tenants.length === 0 && (
        <p className="text-sm text-on-surface-variant">No tenants yet.</p>
      )}

      {!loading && !error && tenants.length > 0 && (
        <div className="bg-surface border border-outline-variant/30 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-outline-variant/30">
                <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">Name</th>
                <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">Slug</th>
                <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">Currency</th>
                <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">Timezone</th>
                <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">Status</th>
                <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">Created</th>
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
                      {tenant.isActive ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant whitespace-nowrap">
                    {new Date(tenant.createdAt).toLocaleDateString()}
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
