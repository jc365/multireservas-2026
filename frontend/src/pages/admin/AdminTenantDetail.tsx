/**
 * @file AdminTenantDetail.tsx
 * @module pages/admin
 *
 * F4.0 superficie A: detalle de un tenant (GET /admin/tenants/:id),
 * edición total (PUT con todos los campos, incl. maxServiceDuration),
 * soft delete (PATCH .../active), lectura de recursos (services,
 * employees, reservations) y lanzamiento del modo owner
 * (superficie B → header X-Tenant-Id).
 *
 * schedules/holidays se envían en round-trip tal cual llegan: su
 * edición visual vive en TenantConfig (zona tenant, modo owner).
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAdminTenant } from '../../context/AdminTenantContext';

interface TenantDetail {
  id: string;
  name: string;
  slug: string | null;
  currency: string;
  timezone: string;
  isActive: boolean;
  settings: Record<string, unknown>;
  schedules: unknown[];
  holidays: unknown[];
  createdAt: string;
  updatedAt: string;
}

interface ServiceRow {
  id: string;
  name: string;
  duration: number;
  price: number;
  isActive: boolean;
}

interface EmployeeRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface ReservationRow {
  id: string;
  startsAt: string;
  status: string;
}

const CURRENCIES = ['EUR', 'USD', 'GBP'];
const SLOT_OPTIONS = [15, 30, 45, 60];
const RETENTION_OPTIONS = [
  { value: 'nextDay', label: 'Next day' },
  { value: 'nextMonth', label: 'Next month' },
  { value: 'never', label: 'Never (keep forever)' },
];

function apiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

export default function AdminTenantDetail() {
  const { tenantId = '' } = useParams();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const { ownerMode, enterOwnerMode } = useAdminTenant();

  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [timezone, setTimezone] = useState('UTC');
  const [slotDuration, setSlotDuration] = useState(15);
  const [maxServiceDuration, setMaxServiceDuration] = useState(180);
  const [retention, setRetention] = useState('nextMonth');
  const [language, setLanguage] = useState('en');
  const [requireClientPhone, setRequireClientPhone] = useState(true);
  const [requireClientEmail, setRequireClientEmail] = useState(false);

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);

  const loadTenant = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get(`/admin/tenants/${tenantId}`);
      setTenant(data);
      setName(data.name);
      setCurrency(data.currency);
      setTimezone(data.timezone);
      setSlotDuration(data.settings?.slotDuration ?? 15);
      setMaxServiceDuration(data.settings?.maxServiceDuration ?? 180);
      setRetention(data.settings?.clientDataRetention ?? 'nextMonth');
      setLanguage(data.settings?.defaultLanguage ?? 'en');
      setRequireClientPhone(data.settings?.requireClientPhone !== false);
      setRequireClientEmail(data.settings?.requireClientEmail === true);
    } catch (err) {
      setError(apiError(err, 'Could not load tenant'));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const loadResources = useCallback(async () => {
    try {
      const [sv, emp, res] = await Promise.all([
        client.get(`/admin/tenants/${tenantId}/services`),
        client.get(`/admin/tenants/${tenantId}/employees`),
        client.get(`/admin/tenants/${tenantId}/reservations`),
      ]);
      setServices(sv.data);
      setEmployees(emp.data);
      setReservations(res.data);
    } catch {
      // Lectura best-effort: los recursos se muestran como vacíos
      setServices([]);
      setEmployees([]);
      setReservations([]);
    }
  }, [tenantId]);

  useEffect(() => {
    loadTenant();
    loadResources();
  }, [loadTenant, loadResources]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant) return;

    if (!name.trim()) {
      setError('Tenant name is required');
      return;
    }
    if (
      !Number.isInteger(maxServiceDuration) ||
      maxServiceDuration < slotDuration ||
      maxServiceDuration % slotDuration !== 0
    ) {
      setError('Max service duration must be a multiple of the slot duration');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const { data } = await client.put(`/admin/tenants/${tenantId}`, {
        name: name.trim(),
        currency,
        timezone: timezone.trim(),
        settings: {
          ...tenant.settings,
          slotDuration,
          maxServiceDuration,
          clientDataRetention: retention,
          defaultLanguage: language.trim(),
          requireClientPhone,
          requireClientEmail,
        },
        schedules: tenant.schedules,
        holidays: tenant.holidays,
      });
      setTenant(data);
      showSuccess('Tenant configuration saved');
    } catch (err) {
      showError(apiError(err, 'Error saving tenant configuration'));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!tenant) return;
    try {
      const { data } = await client.patch(`/admin/tenants/${tenantId}/active`, {
        isActive: !tenant.isActive,
      });
      setTenant((prev) => (prev ? { ...prev, isActive: data.isActive } : prev));
      showSuccess(data.isActive ? 'Tenant reactivated' : 'Tenant deactivated');
    } catch (err) {
      showError(apiError(err, 'Error changing tenant status'));
    }
  }

  function handleOperateAsOwner() {
    enterOwnerMode(tenantId);
    navigate('/tenant-config');
  }

  if (loading) return <p className="text-sm text-on-surface-variant">Loading tenant…</p>;
  if (error && !tenant) return <p className="text-sm text-error">{error}</p>;
  if (!tenant) return null;

  return (
    <div className="max-w-container-max mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/admin/tenants" className="text-sm text-on-surface-variant hover:text-on-surface flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Tenants
          </Link>
          <h1 className="text-title-lg font-semibold text-on-surface mt-1">{tenant.name}</h1>
          <p className="text-sm text-on-surface-variant">
            {tenant.slug ?? 'no slug'} · {tenant.currency} · {tenant.timezone}
            <span
              className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${
                tenant.isActive ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
              }`}
            >
              {tenant.isActive ? 'active' : 'inactive'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleActive}
            className="px-3 py-2 text-sm border border-outline-variant rounded-lg text-on-surface-variant hover:bg-surface-container-low"
          >
            {tenant.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
          {tenant.isActive && !ownerMode && (
            <button
              onClick={handleOperateAsOwner}
              className="px-3 py-2 text-sm bg-primary text-on-primary rounded-lg hover:opacity-90"
            >
              Operate as owner
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Config ── */}
        <form onSubmit={handleSave} className="bg-surface border border-outline-variant/30 rounded-xl p-5">
          <h2 className="text-title-sm font-semibold text-on-surface mb-4">Configuration</h2>
          {error && <p className="text-sm text-error mb-3">{error}</p>}

          <label className="block text-sm text-on-surface-variant mb-1">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full mt-1 px-3 py-2 bg-surface-container border border-outline-variant rounded-lg text-sm text-on-surface"
            />
          </label>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="block text-sm text-on-surface-variant">
              Currency
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="block w-full mt-1 px-3 py-2 bg-surface-container border border-outline-variant rounded-lg text-sm text-on-surface"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-on-surface-variant">
              Timezone
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="block w-full mt-1 px-3 py-2 bg-surface-container border border-outline-variant rounded-lg text-sm text-on-surface"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="block text-sm text-on-surface-variant">
              Slot duration (min)
              <select
                value={slotDuration}
                onChange={(e) => setSlotDuration(Number(e.target.value))}
                className="block w-full mt-1 px-3 py-2 bg-surface-container border border-outline-variant rounded-lg text-sm text-on-surface"
              >
                {SLOT_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-on-surface-variant">
              Max service duration (min)
              <input
                type="number"
                min={slotDuration}
                step={slotDuration}
                value={maxServiceDuration}
                onChange={(e) => setMaxServiceDuration(Number(e.target.value))}
                className="block w-full mt-1 px-3 py-2 bg-surface-container border border-outline-variant rounded-lg text-sm text-on-surface"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="block text-sm text-on-surface-variant">
              Client data retention
              <select
                value={retention}
                onChange={(e) => setRetention(e.target.value)}
                className="block w-full mt-1 px-3 py-2 bg-surface-container border border-outline-variant rounded-lg text-sm text-on-surface"
              >
                {RETENTION_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-on-surface-variant">
              Default language
              <input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="block w-full mt-1 px-3 py-2 bg-surface-container border border-outline-variant rounded-lg text-sm text-on-surface"
              />
            </label>
          </div>

          <div className="flex flex-col gap-2 mb-4">
            <label className="flex items-center gap-2 text-sm text-on-surface">
              <input
                type="checkbox"
                checked={requireClientPhone}
                onChange={(e) => setRequireClientPhone(e.target.checked)}
              />
              Require client phone
            </label>
            <label className="flex items-center gap-2 text-sm text-on-surface">
              <input
                type="checkbox"
                checked={requireClientEmail}
                onChange={(e) => setRequireClientEmail(e.target.checked)}
              />
              Require client email
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm bg-primary text-on-primary rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save configuration'}
          </button>
        </form>

        {/* ── Resources (solo lectura) ── */}
        <div className="flex flex-col gap-4">
          <section className="bg-surface border border-outline-variant/30 rounded-xl p-5">
            <h2 className="text-title-sm font-semibold text-on-surface mb-3">
              Services <span className="text-on-surface-variant font-normal">({services.length})</span>
            </h2>
            {services.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No services.</p>
            ) : (
              <ul className="text-sm text-on-surface divide-y divide-outline-variant/20">
                {services.map((s) => (
                  <li key={s.id} className="py-2 flex justify-between">
                    <span>{s.name}</span>
                    <span className="text-on-surface-variant">{s.duration}m · {s.price}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bg-surface border border-outline-variant/30 rounded-xl p-5">
            <h2 className="text-title-sm font-semibold text-on-surface mb-3">
              Employees <span className="text-on-surface-variant font-normal">({employees.length})</span>
            </h2>
            {employees.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No employees.</p>
            ) : (
              <ul className="text-sm text-on-surface divide-y divide-outline-variant/20">
                {employees.map((e) => (
                  <li key={e.id} className="py-2 flex justify-between">
                    <span>{e.name}</span>
                    <span className="text-on-surface-variant">{e.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bg-surface border border-outline-variant/30 rounded-xl p-5">
            <h2 className="text-title-sm font-semibold text-on-surface mb-3">
              Reservations <span className="text-on-surface-variant font-normal">({reservations.length})</span>
            </h2>
            {reservations.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No reservations.</p>
            ) : (
              <ul className="text-sm text-on-surface divide-y divide-outline-variant/20">
                {reservations.map((r) => (
                  <li key={r.id} className="py-2 flex justify-between">
                    <span>{new Date(r.startsAt).toLocaleString()}</span>
                    <span className="text-on-surface-variant">{r.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
