/**
 * @file TenantConfig.tsx
 * @module pages
 *
 * Configuración del tenant (F3.4): perfil (name/currency/timezone),
 * booking settings (slotDuration, maxServiceDuration, retención,
 * idioma, flags de cliente), editor visual de schedules con breaks y
 * editor de holidays. Solo owner edita (`editTenantConfig`); el
 * backend además exige rol owner en PUT (#13).
 *
 * Validación doble (F3.4 #11): las mismas reglas que el dominio del
 * backend se comprueban aquí antes del PUT para dar feedback rápido;
 * la autoridad sigue siendo el backend (400 con su mensaje).
 *
 * F4.4b: verificación de email. Si la URL trae `?token=X` (link del
 * email) → `POST /tenants/verify-email` y la respuesta (mismo shape
 * que GET, sin GET extra) puebla el formulario; si no trae token y
 * `settings.emailVerified === false` → banner + botón reenviar.
 */

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { can } from '../utils/roleConfig';
import VerificationBanner from '../components/VerificationBanner';
import { useI18n } from '../i18n';

const SLOT_OPTIONS = [15, 30, 45, 60];
const CURRENCIES = ['EUR', 'USD', 'GBP'];
const RETENTION_OPTIONS = [
  { value: 'nextDay', key: 'retentionNextDay' },
  { value: 'nextMonth', key: 'retentionNextMonth' },
  { value: 'never', key: 'retentionNever' },
];
const DAY_OPTIONS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIMEZONE_SUGGESTIONS = [
  'UTC',
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Argentina/Buenos_Aires',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isValidTimeZone(value: string): boolean {
  if (!value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

function apiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

interface BreakWindow {
  start: string;
  end: string;
}

interface BlockForm {
  label: string;
  days: string[];
  start: string;
  end: string;
  breaks: BreakWindow[];
}

interface HolidayForm {
  label: string;
  date: string;
  recurring: boolean;
}

export default function TenantConfig() {
  const { user } = useUser();
  const { showSuccess } = useToast();
  const { t } = useI18n();
  const canEdit = user ? can(user.role, 'editTenantConfig') : false;
  const [searchParams, setSearchParams] = useSearchParams();
  const token = searchParams.get('token');
  const loadedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [emailVerified, setEmailVerified] = useState(true);

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [timezone, setTimezone] = useState('UTC');
  const [slotDuration, setSlotDuration] = useState(15);
  const [maxServiceDuration, setMaxServiceDuration] = useState(180);
  const [retention, setRetention] = useState('nextMonth');
  const [language, setLanguage] = useState('en');
  const [requireClientPhone, setRequireClientPhone] = useState(true);
  const [requireClientEmail, setRequireClientEmail] = useState(false);
  const [allowCustomerAssignment, setAllowCustomerAssignment] = useState(true);
  const [schedules, setSchedules] = useState<BlockForm[]>([]);
  const [holidays, setHolidays] = useState<HolidayForm[]>([]);

  useEffect(() => {
    if (!canEdit) {
      setLoading(false);
      return;
    }
    if (loadedRef.current) return;
    loadedRef.current = true;

    function applyTenant(data: {
      name?: string;
      currency?: string;
      timezone?: string;
      settings?: Record<string, unknown>;
      schedules?: Array<{
        label: string;
        days: string[];
        start: string;
        end: string;
        breaks?: BreakWindow[];
      }>;
      holidays?: Array<{ label: string; date: string; recurring: boolean }>;
    }) {
      setName(data.name ?? '');
      setCurrency(data.currency ?? 'EUR');
      setTimezone(data.timezone ?? 'UTC');
      const settings = data.settings ?? {};
      setSlotDuration((settings.slotDuration as number) ?? 15);
      setMaxServiceDuration((settings.maxServiceDuration as number) ?? 180);
      setRetention((settings.clientDataRetention as string) ?? 'nextMonth');
      setLanguage((settings.defaultLanguage as string) ?? 'en');
      setRequireClientPhone(settings.requireClientPhone !== false);
      setRequireClientEmail(settings.requireClientEmail === true);
      // F4.4c: sin picker de empleado → el sistema asigna siempre.
      setAllowCustomerAssignment(settings.allowCustomerAssignment !== false);
      // F4.4b: el token nunca llega aquí; el flag derivado decide el banner.
      setEmailVerified(settings.emailVerified !== false);
      setSchedules(
        (data.schedules ?? []).map(
          (block): BlockForm => ({
            label: block.label,
            days: block.days,
            start: block.start,
            end: block.end,
            breaks: block.breaks ?? [],
          })
        )
      );
      setHolidays(
        (data.holidays ?? []).map((holiday): HolidayForm => ({
          label: holiday.label,
          date: holiday.date,
          recurring: holiday.recurring,
        }))
      );
    }

    function loadTenant(): Promise<unknown> {
      // Sin caché (param _t): el banner y el gating necesitan el estado fresco.
      return client
        .get('/tenants/me', { params: { _t: Date.now() } })
        .then((res) => applyTenant(res.data));
    }

    if (token) {
      // F4.4b: el token viene SOLO en la URL del email → verify primero.
      // La respuesta del POST es el tenant completo (sin GET extra).
      client
        .post('/tenants/verify-email', { token })
        .then((res) => {
          applyTenant(res.data);
          showSuccess(t('tenant.config.toast.verified'));
          setSearchParams({}, { replace: true });
        })
        .catch((err) => {
          setError(apiError(err, t('tenant.config.toast.verifyError')));
          return loadTenant();
        })
        .finally(() => setLoading(false));
    } else {
      loadTenant()
        .catch((err) => setError(apiError(err, t('tenant.config.toast.loadError'))))
        .finally(() => setLoading(false));
    }
  }, [canEdit, token]);

  if (!canEdit) {
    return (
      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6 max-w-lg">
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          {t('tenant.config.ownerOnly')}
        </p>
      </div>
    );
  }

  function validate(): string[] {
    const errors: string[] = [];
    if (!name.trim()) errors.push(t('tenant.config.errors.nameRequired'));
    if (!CURRENCIES.includes(currency)) {
      errors.push(t('tenant.config.errors.currency'));
    }
    if (!isValidTimeZone(timezone)) {
      errors.push(t('tenant.config.errors.timezone'));
    }
    if (!(SLOT_OPTIONS as number[]).includes(slotDuration)) {
      errors.push(t('tenant.config.errors.slot'));
    }
    if (
      !Number.isInteger(maxServiceDuration) ||
      maxServiceDuration < slotDuration ||
      maxServiceDuration % slotDuration !== 0
    ) {
      errors.push(t('tenant.config.errors.maxDuration'));
    }
    if (!language.trim()) errors.push(t('tenant.config.errors.language'));

    schedules.forEach((block, index) => {
      const at = block.label.trim()
        ? t('tenant.config.errors.scheduleNamed', { label: block.label.trim() })
        : t('tenant.config.errors.scheduleNumber', { n: index + 1 });
      if (!block.label.trim()) errors.push(t('tenant.config.errors.labelRequired', { at }));
      if (block.days.length === 0) errors.push(t('tenant.config.errors.dayRequired', { at }));
      if (!isValidTime(block.start) || !isValidTime(block.end)) {
        errors.push(t('tenant.config.errors.timeFormat', { at }));
      } else if (block.start >= block.end) {
        errors.push(t('tenant.config.errors.startBeforeEnd', { at }));
      }
      block.breaks.forEach((br, breakIndex) => {
        const n = breakIndex + 1;
        if (!isValidTime(br.start) || !isValidTime(br.end)) {
          errors.push(t('tenant.config.errors.breakFormat', { at, n }));
        } else if (br.start >= br.end) {
          errors.push(t('tenant.config.errors.breakOrder', { at, n }));
        } else if (
          isValidTime(block.start) &&
          isValidTime(block.end) &&
          (br.start < block.start || br.end > block.end)
        ) {
          errors.push(t('tenant.config.errors.breakWithin', { at, n }));
        }
      });
    });

    holidays.forEach((holiday, index) => {
      const at = holiday.label.trim()
        ? t('tenant.config.errors.holidayNamed', { label: holiday.label.trim() })
        : t('tenant.config.errors.holidayNumber', { n: index + 1 });
      if (!holiday.label.trim()) errors.push(t('tenant.config.errors.labelRequired', { at }));
      if (!isValidDate(holiday.date)) {
        errors.push(t('tenant.config.errors.dateValid', { at }));
      }
    });

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

    setSaving(true);
    try {
      await client.put('/tenants/me', {
        name: name.trim(),
        currency,
        timezone: timezone.trim(),
        settings: {
          slotDuration,
          maxServiceDuration,
          clientDataRetention: retention,
          defaultLanguage: language.trim(),
          requireClientPhone,
          requireClientEmail,
          allowCustomerAssignment,
        },
        schedules,
        holidays,
      });
      showSuccess(t('tenant.config.toast.saved'));
    } catch (err) {
      setError(apiError(err, t('tenant.config.toast.saveError')));
    } finally {
      setSaving(false);
    }
  }

  function updateBlock(index: number, patch: Partial<BlockForm>) {
    setSchedules((blocks) => blocks.map((block, i) => (i === index ? { ...block, ...patch } : block)));
  }

  function toggleDay(index: number, day: string) {
    setSchedules((blocks) =>
      blocks.map((block, i) => {
        if (i !== index) return block;
        const days = block.days.includes(day)
          ? block.days.filter((d) => d !== day)
          : [...block.days, day];
        return { ...block, days };
      })
    );
  }

  function addBlock() {
    setSchedules((blocks) => [
      ...blocks,
      { label: '', days: ['mon'], start: '09:00', end: '17:00', breaks: [] },
    ]);
  }

  function removeBlock(index: number) {
    setSchedules((blocks) => blocks.filter((_, i) => i !== index));
  }

  function addBreak(index: number) {
    setSchedules((blocks) =>
      blocks.map((block, i) =>
        i === index ? { ...block, breaks: [...block.breaks, { start: '13:00', end: '14:00' }] } : block
      )
    );
  }

  function updateBreak(blockIndex: number, breakIndex: number, patch: Partial<BreakWindow>) {
    setSchedules((blocks) =>
      blocks.map((block, i) => {
        if (i !== blockIndex) return block;
        return {
          ...block,
          breaks: block.breaks.map((br, j) => (j === breakIndex ? { ...br, ...patch } : br)),
        };
      })
    );
  }

  function removeBreak(blockIndex: number, breakIndex: number) {
    setSchedules((blocks) =>
      blocks.map((block, i) => {
        if (i !== blockIndex) return block;
        return { ...block, breaks: block.breaks.filter((_, j) => j !== breakIndex) };
      })
    );
  }

  function updateHoliday(index: number, patch: Partial<HolidayForm>) {
    setHolidays((items) => items.map((holiday, i) => (i === index ? { ...holiday, ...patch } : holiday)));
  }

  function addHoliday() {
    setHolidays((items) => [...items, { label: '', date: '', recurring: false }]);
  }

  function removeHoliday(index: number) {
    setHolidays((items) => items.filter((_, i) => i !== index));
  }

  const inputClass =
    'w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors';
  const labelClass =
    'block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2';
  const smallButtonClass =
    'px-3 py-1.5 text-sm rounded border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container transition-colors';

  if (loading) {
    return (
      <p className="text-on-surface-variant font-body-lg text-body-lg">
        {t('tenant.config.loading')}
      </p>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display-lg-mobile text-display-lg-mobile text-on-background mb-6">
        {t('tenant.config.title')}
      </h1>
      {error && (
        <div
          role="alert"
          className="bg-error-container text-on-error-container p-3 rounded mb-4 text-sm"
        >
          {error}
        </div>
      )}
      {emailVerified === false && (
        <div className="mb-4">
          <VerificationBanner message={t('tenant.config.bannerMessage')} showResend />
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset className="bg-surface border border-outline-variant/30 rounded-xl p-6 space-y-4">
          <legend className="font-label-caps text-label-caps text-on-surface-variant uppercase px-2">
            {t('tenant.config.profile')}
          </legend>
          <div>
            <label htmlFor="tenant-name" className={labelClass}>
              {t('tenant.config.name')}
            </label>
            <input
              id="tenant-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="tenant-currency" className={labelClass}>
                {t('tenant.config.currency')}
              </label>
              <select
                id="tenant-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={inputClass}
              >
                {CURRENCIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tenant-timezone" className={labelClass}>
                {t('tenant.config.timezone')}
              </label>
              <input
                id="tenant-timezone"
                type="text"
                list="timezone-suggestions"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                required
                className={inputClass}
              />
              <datalist id="timezone-suggestions">
                {TIMEZONE_SUGGESTIONS.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </div>
          </div>
        </fieldset>

        <fieldset className="bg-surface border border-outline-variant/30 rounded-xl p-6 space-y-4">
          <legend className="font-label-caps text-label-caps text-on-surface-variant uppercase px-2">
            {t('tenant.config.booking')}
          </legend>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="tenant-slot" className={labelClass}>
                {t('tenant.config.slotDuration')}
              </label>
              <select
                id="tenant-slot"
                value={slotDuration}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setSlotDuration(next);
                  if (maxServiceDuration % next !== 0) {
                    setMaxServiceDuration(next * 12);
                  }
                }}
                className={inputClass}
              >
                {SLOT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} min
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tenant-max-duration" className={labelClass}>
                {t('tenant.config.maxServiceDuration')}
              </label>
              <input
                id="tenant-max-duration"
                type="number"
                min={slotDuration}
                step={slotDuration}
                value={maxServiceDuration}
                onChange={(e) => setMaxServiceDuration(Number(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="tenant-retention" className={labelClass}>
              {t('tenant.config.retention')}
            </label>
            <select
              id="tenant-retention"
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
              className={inputClass}
            >
              {RETENTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(`tenant.config.${option.key}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tenant-language" className={labelClass}>
              {t('tenant.config.language')}
            </label>
            <input
              id="tenant-language"
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                id="tenant-require-phone"
                type="checkbox"
                checked={requireClientPhone}
                onChange={(e) => setRequireClientPhone(e.target.checked)}
              />
              <span className="font-body-md text-body-md text-on-surface">
                {t('tenant.config.requirePhone')}
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                id="tenant-require-email"
                type="checkbox"
                checked={requireClientEmail}
                onChange={(e) => setRequireClientEmail(e.target.checked)}
              />
              <span className="font-body-md text-body-md text-on-surface">
                {t('tenant.config.requireEmail')}
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                id="tenant-allow-customer-assignment"
                type="checkbox"
                checked={allowCustomerAssignment}
                onChange={(e) => setAllowCustomerAssignment(e.target.checked)}
              />
              <span className="font-body-md text-body-md text-on-surface">
                {t('tenant.config.allowCustomer')}
              </span>
            </label>
            <p className="text-on-surface-variant font-body-sm text-body-sm">
              {t('tenant.config.allowCustomerHint')}
            </p>
          </div>
        </fieldset>

        <fieldset className="bg-surface border border-outline-variant/30 rounded-xl p-6 space-y-4">
          <legend className="font-label-caps text-label-caps text-on-surface-variant uppercase px-2">
            {t('tenant.config.schedules')}
          </legend>
          {schedules.length === 0 && (
            <p className="text-on-surface-variant font-body-md text-body-md">
              {t('tenant.config.noSchedules')}
            </p>
          )}
          {schedules.map((block, index) => (
            <div
              key={index}
              className="border border-outline-variant/30 rounded-lg p-4 space-y-3"
              data-testid={`schedule-block-${index}`}
            >
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label htmlFor={`schedule-label-${index}`} className={labelClass}>
                    {t('tenant.config.label')}
                  </label>
                  <input
                    id={`schedule-label-${index}`}
                    type="text"
                    value={block.label}
                    onChange={(e) => updateBlock(index, { label: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeBlock(index)}
                  className={smallButtonClass}
                >
                  {t('tenant.config.remove')}
                </button>
              </div>

              <div>
                <span className={labelClass}>{t('tenant.config.days')}</span>
                <div className="flex flex-wrap gap-3">
                  {DAY_OPTIONS.map((day) => (
                    <label key={day} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={block.days.includes(day)}
                        onChange={() => toggleDay(index, day)}
                      />
                      <span className="font-body-sm text-body-sm text-on-surface">
                        {t(`tenant.config.day.${day}`)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`schedule-start-${index}`} className={labelClass}>
                    {t('tenant.config.start')}
                  </label>
                  <input
                    id={`schedule-start-${index}`}
                    type="time"
                    value={block.start}
                    onChange={(e) => updateBlock(index, { start: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={`schedule-end-${index}`} className={labelClass}>
                    {t('tenant.config.end')}
                  </label>
                  <input
                    id={`schedule-end-${index}`}
                    type="time"
                    value={block.end}
                    onChange={(e) => updateBlock(index, { end: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <span className={labelClass}>{t('tenant.config.breaks')}</span>
                {block.breaks.map((br, breakIndex) => (
                  <div key={breakIndex} className="flex items-center gap-3">
                    <input
                      aria-label={`Break ${breakIndex + 1} start of ${block.label || `block ${index + 1}`}`}
                      type="time"
                      value={br.start}
                      onChange={(e) => updateBreak(index, breakIndex, { start: e.target.value })}
                      className={`${inputClass} w-32`}
                    />
                    <span className="text-on-surface-variant">–</span>
                    <input
                      aria-label={`Break ${breakIndex + 1} end of ${block.label || `block ${index + 1}`}`}
                      type="time"
                      value={br.end}
                      onChange={(e) => updateBreak(index, breakIndex, { end: e.target.value })}
                      className={`${inputClass} w-32`}
                    />
                    <button
                      type="button"
                      onClick={() => removeBreak(index, breakIndex)}
                      className={smallButtonClass}
                    >
                      {t('tenant.config.removeBreak')}
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => addBreak(index)} className={smallButtonClass}>
                  {t('tenant.config.addBreak')}
                </button>
              </div>
            </div>
          ))}
          <button type="button" onClick={addBlock} className={smallButtonClass}>
            {t('tenant.config.addSchedule')}
          </button>
        </fieldset>

        <fieldset className="bg-surface border border-outline-variant/30 rounded-xl p-6 space-y-4">
          <legend className="font-label-caps text-label-caps text-on-surface-variant uppercase px-2">
            {t('tenant.config.holidays')}
          </legend>
          {holidays.length === 0 && (
            <p className="text-on-surface-variant font-body-md text-body-md">
              {t('tenant.config.noHolidays')}
            </p>
          )}
          {holidays.map((holiday, index) => (
            <div
              key={index}
              className="border border-outline-variant/30 rounded-lg p-4 grid grid-cols-2 gap-4 items-end"
              data-testid={`holiday-${index}`}
            >
              <div>
                <label htmlFor={`holiday-label-${index}`} className={labelClass}>
                  {t('tenant.config.label')}
                </label>
                <input
                  id={`holiday-label-${index}`}
                  type="text"
                  value={holiday.label}
                  onChange={(e) => updateHoliday(index, { label: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={`holiday-date-${index}`} className={labelClass}>
                  {t('tenant.config.date')}
                </label>
                <input
                  id={`holiday-date-${index}`}
                  type="date"
                  value={holiday.date}
                  onChange={(e) => updateHoliday(index, { date: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    id={`holiday-recurring-${index}`}
                    type="checkbox"
                    checked={holiday.recurring}
                    onChange={(e) => updateHoliday(index, { recurring: e.target.checked })}
                  />
                  <span className="font-body-sm text-body-sm text-on-surface">
                    {t('tenant.config.recurring')}
                  </span>
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => removeHoliday(index)}
                  className={smallButtonClass}
                >
                  {t('tenant.config.remove')}
                </button>
              </div>
            </div>
          ))}
          <button type="button" onClick={addHoliday} className={smallButtonClass}>
            {t('tenant.config.addHoliday')}
          </button>
        </fieldset>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-primary-container text-on-primary-container font-title-sm text-title-sm py-3 px-4 rounded hover:bg-primary transition-colors disabled:opacity-50"
        >
          {saving ? t('tenant.config.saving') : t('tenant.config.save')}
        </button>
      </form>
    </div>
  );
}
