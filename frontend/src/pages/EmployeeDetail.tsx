/**
 * @file EmployeeDetail.tsx
 * @module pages
 *
 * Detalle + edición + soft delete de un empleado (F3.2).
 * userId no se expone en frontend (decisión F3.2).
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import client from '../api/client';
import { useUser } from '../context/UserContext';
import { can } from '../utils/roleConfig';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import type { TranslateFn } from '../utils/booking';
import { getCurrentLocale, translateError, useI18n } from '../i18n';

interface Employee {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  userId: string | null;
  offersAllServices: boolean;
  serviceIds: string[];
  customSchedule: Record<string, unknown> | null;
  customHolidays: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Service {
  id: string;
  name: string;
  duration: number;
  isActive: boolean;
}

function parseJsonObject(
  raw: string,
  field: string,
  t: TranslateFn
): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(t('employees.errors.jsonInvalid', { field }));
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(t('employees.errors.jsonNotObject', { field }));
  }
  return parsed as Record<string, unknown>;
}

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { showSuccess, showError } = useToast();
  const { t } = useI18n();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchEmployee = () => {
    if (!id) return;
    client.get(`/employees/${id}`)
      .then((res) => setEmployee(res.data))
      .catch((err) => setError(translateError(err, t) || t('employees.detail.loadError')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchEmployee(); }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      await client.delete(`/employees/${id}`);
      showSuccess(t('employees.toast.deleted'));
      navigate('/employees');
    } catch (err) {
      showError(translateError(err, t) || t('employees.toast.deleteError'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        {t('employees.detail.loading')}
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="bg-error-container text-on-error-container p-4 rounded-xl">
        {t('error')}: {error || t('employees.detail.notFound')}
      </div>
    );
  }

  const canEdit = user ? can(user.role, 'editEmployees') : false;

  return (
    <div>
      <div className="mb-8">
        <Link to="/employees" className="text-primary hover:text-primary-fixed-dim transition-colors font-body-sm text-body-sm flex items-center gap-1 mb-4">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          {t('employees.detail.back')}
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="font-display-lg text-display-lg text-on-background">
              {employee.name}
            </h1>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border ${
                employee.isActive
                  ? 'bg-[var(--color-green,#22c55e)]/10 text-[var(--color-green,#22c55e)] border-[var(--color-green,#22c55e)]/30'
                  : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
              }`}>
                {employee.isActive ? t('employees.status.active') : t('employees.status.inactive')}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border bg-surface-container text-on-surface-variant border-outline-variant/30">
                {employee.offersAllServices
                  ? t('employees.badge.all')
                  : t('employees.badge.count', { count: employee.serviceIds.length })}
              </span>
              {employee.email && (
                <span className="text-on-surface-variant font-body-sm text-body-sm">
                  {employee.email}
                </span>
              )}
              {employee.phone && (
                <span className="text-on-surface-variant font-body-sm text-body-sm">
                  {employee.phone}
                </span>
              )}
              <span className="text-on-surface-variant font-body-sm text-body-sm">
                {t('employees.detail.created', {
              date: new Date(employee.createdAt).toLocaleDateString(getCurrentLocale()),
            })}
              </span>
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowEditModal(true)}
                className="p-2 rounded hover:bg-surface-container transition-colors"
                aria-label={t('employees.detail.editAria')}
              >
                <span className="material-symbols-outlined text-on-surface-variant">edit</span>
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 rounded hover:bg-error-container/30 transition-colors"
                title={t('employees.detail.deleteTitle')}
              >
                <span className="material-symbols-outlined text-error">delete</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
        <div className="bg-surface border border-outline-variant/30 rounded-xl p-6">
          <h2 className="font-headline-md text-headline-md text-on-background mb-3">
            {t('employees.detail.scheduleTitle')}
          </h2>
          <pre className="text-on-surface-variant font-body-sm text-body-sm bg-surface-container rounded p-3 overflow-x-auto">
            {employee.customSchedule
              ? JSON.stringify(employee.customSchedule, null, 2)
              : t('employees.detail.noSchedule')}
          </pre>
        </div>
        <div className="bg-surface border border-outline-variant/30 rounded-xl p-6">
          <h2 className="font-headline-md text-headline-md text-on-background mb-3">
            {t('employees.detail.holidaysTitle')}
          </h2>
          <pre className="text-on-surface-variant font-body-sm text-body-sm bg-surface-container rounded p-3 overflow-x-auto">
            {employee.customHolidays
              ? JSON.stringify(employee.customHolidays, null, 2)
              : t('employees.detail.noHolidays')}
          </pre>
        </div>
      </div>

      {showEditModal && (
        <EditEmployeeModal
          employee={employee}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            fetchEmployee();
            showSuccess(t('employees.toast.updated'));
          }}
        />
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title={t('employees.confirm.deleteTitle')}
        message={t('employees.confirm.deleteMessage', { name: employee.name })}
        confirmLabel={t('buttons.delete')}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

function EditEmployeeModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(employee.name);
  const [email, setEmail] = useState(employee.email ?? '');
  const [phone, setPhone] = useState(employee.phone ?? '');
  const [offersAllServices, setOffersAllServices] = useState(employee.offersAllServices);
  const [serviceIds, setServiceIds] = useState<string[]>(employee.serviceIds);
  const [customSchedule, setCustomSchedule] = useState(
    employee.customSchedule ? JSON.stringify(employee.customSchedule, null, 2) : ''
  );
  const [customHolidays, setCustomHolidays] = useState(
    employee.customHolidays ? JSON.stringify(employee.customHolidays, null, 2) : ''
  );
  const [isActive, setIsActive] = useState(employee.isActive);
  const [services, setServices] = useState<Service[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client
      .get('/services')
      .then((res) => setServices(res.data))
      .catch(() => setServices([]));
  }, []);

  const toggleService = (id: string) => {
    setServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('employees.errors.nameRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const schedule = parseJsonObject(customSchedule, t('employees.fields.schedule'), t);
      const holidays = parseJsonObject(customHolidays, t('employees.fields.holidays'), t);
      await client.put(`/employees/${employee.id}`, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        offersAllServices,
        serviceIds: offersAllServices ? [] : serviceIds,
        customSchedule: schedule,
        customHolidays: holidays,
        isActive,
      });
      onSaved();
    } catch (err) {
      setError(translateError(err, t) || t('employees.toast.updateError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t('employees.detail.editAria')}>
      <div className="bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/30 w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-4">{t('employees.edit.title')}</h2>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="employee-name" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">{t('employees.form.name')}</label>
            <input
              id="employee-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface border border-outline-variant/50 rounded-lg p-3 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="employee-email" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">{t('employees.form.emailEdit')}</label>
            <input
              id="employee-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface border border-outline-variant/50 rounded-lg p-3 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="employee-phone" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">{t('employees.form.phoneEdit')}</label>
            <input
              id="employee-phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-surface border border-outline-variant/50 rounded-lg p-3 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
          <fieldset>
            <legend className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">{t('employees.form.services')}</legend>
            <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface mb-3">
              <input
                type="checkbox"
                checked={offersAllServices}
                onChange={(e) => setOffersAllServices(e.target.checked)}
              />
              {t('employees.form.offersAll')}
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {services.map((service) => (
                <label
                  key={service.id}
                  className={`flex items-center gap-2 font-body-sm text-body-sm ${
                    offersAllServices ? 'text-on-surface-variant' : 'text-on-surface'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={offersAllServices || serviceIds.includes(service.id)}
                    disabled={offersAllServices}
                    onChange={() => toggleService(service.id)}
                  />
                  {service.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="employee-custom-schedule" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">{t('employees.form.scheduleLegendEdit')}</label>
            <textarea
              id="employee-custom-schedule"
              value={customSchedule}
              onChange={(e) => setCustomSchedule(e.target.value)}
              rows={3}
              className="w-full bg-surface border border-outline-variant/50 rounded-lg p-3 font-mono text-xs text-on-surface focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div>
            <label htmlFor="employee-custom-holidays" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">{t('employees.form.holidaysLegendEdit')}</label>
            <textarea
              id="employee-custom-holidays"
              value={customHolidays}
              onChange={(e) => setCustomHolidays(e.target.value)}
              rows={2}
              className="w-full bg-surface border border-outline-variant/50 rounded-lg p-3 font-mono text-xs text-on-surface focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            {t('employees.detail.active')}
          </label>
          {error && (
            <p className="text-error font-body-sm text-body-sm">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="py-2 px-4 rounded font-title-sm text-title-sm text-on-surface-variant hover:bg-surface-container transition-colors">
            {t('buttons.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="py-2 px-5 rounded font-title-sm text-title-sm bg-primary-container text-on-primary-container hover:bg-primary-container/80 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>}
            {t('buttons.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
