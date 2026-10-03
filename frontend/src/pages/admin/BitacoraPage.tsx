import { useEffect, useState, useCallback } from 'react';
import client from '../../api/client';
import { useUserCache } from '../../context/UserCacheContext';
import { translateError, useI18n } from '../../i18n';

interface BitacoraEntry {
  id: string;
  userId: string;
  action: string;
  tenantId: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface BitacoraResponse {
  data: BitacoraEntry[];
  total: number;
  page: number;
  limit: number;
}

const ACTION_OPTIONS = [
  { value: 'create_user', labelKey: 'bitacora.actions.create_user' },
  { value: 'create_service', labelKey: 'bitacora.actions.create_service' },
  { value: 'update_service', labelKey: 'bitacora.actions.update_service' },
  { value: 'delete_service', labelKey: 'bitacora.actions.delete_service' },
  { value: 'create_employee', labelKey: 'bitacora.actions.create_employee' },
  { value: 'update_employee', labelKey: 'bitacora.actions.update_employee' },
  { value: 'delete_employee', labelKey: 'bitacora.actions.delete_employee' },
  { value: 'create_reservation', labelKey: 'bitacora.actions.create_reservation' },
  { value: 'update_reservation', labelKey: 'bitacora.actions.update_reservation' },
  { value: 'cancel_reservation', labelKey: 'bitacora.actions.cancel_reservation' },
  { value: 'create_config', labelKey: 'bitacora.actions.create_config' },
  { value: 'update_config', labelKey: 'bitacora.actions.update_config' },
  { value: 'delete_config', labelKey: 'bitacora.actions.delete_config' },
  { value: 'create_tenant', labelKey: 'bitacora.actions.create_tenant' },
  { value: 'update_tenant', labelKey: 'bitacora.actions.update_tenant' },
  { value: 'delete_tenant', labelKey: 'bitacora.actions.delete_tenant' },
  { value: 'update_tenant_config', labelKey: 'bitacora.actions.update_tenant_config' },
];

export default function BitacoraPage() {
  const { getUser, ensureUser } = useUserCache();
  const { t, formatDate } = useI18n();
  const [entries, setEntries] = useState<BitacoraEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filterActions, setFilterActions] = useState<string[]>([]);
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterSince, setFilterSince] = useState('');
  const [filterUntil, setFilterUntil] = useState('');

  const toggleAction = (value: string) => {
    setFilterActions((prev) =>
      prev.includes(value) ? prev.filter((a) => a !== value) : [...prev, value]
    );
    setPage(1);
  };

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number> = { page, limit };
      if (filterActions.length > 0) params.action = filterActions.join(',');
      if (filterEntityType) params.entityType = filterEntityType;
      if (filterSince) params.since = filterSince;
      if (filterUntil) params.until = filterUntil;

      const res = await client.get<BitacoraResponse>('/admin/bitacora', { params });
      setEntries(res.data.data);
      setTotal(res.data.total);

      for (const entry of res.data.data) {
        ensureUser(entry.userId);
      }
    } catch (err) {
      setError(translateError(err, t) || t('bitacora.loadError'));
    } finally {
      setLoading(false);
    }
    // `t` fuera de deps a propósito: cambiar de idioma no debe re-cargar.
  }, [page, limit, filterActions, filterEntityType, filterSince, filterUntil, ensureUser]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const totalPages = Math.ceil(total / limit);

  const resolveUser = (userId: string) => {
    const cached = getUser(userId);
    return cached?.name ?? userId;
  };

  const formatDateCell = (iso: string) =>
    formatDate(iso, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div>
      <h1 className="font-display-lg-mobile text-display-lg-mobile text-on-background mb-6">
        {t('bitacora.title')}
      </h1>

      {/* Filters */}
      <div className="bg-surface border border-outline-variant/30 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">
              {t('bitacora.filters.actions')}
            </label>
            <div className="flex flex-wrap gap-2">
              {ACTION_OPTIONS.map((opt) => {
                const active = filterActions.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleAction(opt.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      active
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container-high text-on-surface-variant border-outline-variant/30 hover:border-primary/50'
                    }`}
                  >
                    {t(opt.labelKey)}
                  </button>
                );
              })}
              {filterActions.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setFilterActions([]); setPage(1); }}
                  className="px-3 py-1.5 text-xs font-medium rounded-full border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  {t('bitacora.filters.clear')}
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">
              {t('bitacora.filters.entityType')}
            </label>
            <input
              type="text"
              value={filterEntityType}
              onChange={(e) => { setFilterEntityType(e.target.value); setPage(1); }}
              placeholder={t('bitacora.filters.entityPlaceholder')}
              className="w-full bg-surface-container-high text-on-surface border border-outline-variant/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">
              {t('bitacora.filters.from')}
            </label>
            <input
              type="date"
              value={filterSince}
              onChange={(e) => { setFilterSince(e.target.value); setPage(1); }}
              className="w-full bg-surface-container-high text-on-surface border border-outline-variant/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">
              {t('bitacora.filters.to')}
            </label>
            <input
              type="date"
              value={filterUntil}
              onChange={(e) => { setFilterUntil(e.target.value); setPage(1); }}
              className="w-full bg-surface-container-high text-on-surface border border-outline-variant/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
          {t('bitacora.loading')}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl">
          {t('common.error')}: {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && entries.length === 0 && (
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          {t('bitacora.empty')}
        </p>
      )}

      {/* Table */}
      {!loading && !error && entries.length > 0 && (
        <>
          <div className="bg-surface border border-outline-variant/30 rounded-xl overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-outline-variant/30">
                  <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">{t('bitacora.columns.date')}</th>
                  <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">{t('bitacora.columns.user')}</th>
                  <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">{t('bitacora.columns.action')}</th>
                  <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">{t('bitacora.columns.entity')}</th>
                  <th className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant uppercase">{t('bitacora.columns.metadata')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-outline-variant/20 hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 text-sm text-on-surface whitespace-nowrap">{formatDateCell(entry.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-on-surface">{resolveUser(entry.userId)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-full">
                        {entry.action}
                      </span>
                      {entry.metadata && 'admin-as-owner' in entry.metadata && (
                        <span
                          title={t('bitacora.asOwnerTitle', { name: String(entry.metadata['admin-as-owner']) })}
                          className="ml-1.5 text-[10px] font-semibold bg-amber-500/15 text-amber-600 px-1.5 py-0.5 rounded-full uppercase"
                        >
                          {t('bitacora.asOwner')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">
                      {entry.entityType ?? '—'}
                      {entry.entityId && (
                        <span className="ml-1 text-xs text-outline">({entry.entityId})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant max-w-[200px] truncate">
                      {entry.metadata ? JSON.stringify(entry.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-on-surface-variant">
              {t('bitacora.pagination.showing', {
                from: (page - 1) * limit + 1,
                to: Math.min(page * limit, total),
                total,
              })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm font-medium rounded border border-outline-variant/30 text-on-surface hover:bg-surface-container-low disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('bitacora.pagination.previous')}
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-4 py-2 text-sm font-medium rounded border border-outline-variant/30 text-on-surface hover:bg-surface-container-low disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('bitacora.pagination.next')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
