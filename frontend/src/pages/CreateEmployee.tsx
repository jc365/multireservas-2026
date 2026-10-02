/**
 * @file CreateEmployee.tsx
 * @module pages
 *
 * Formulario de alta de empleados (F3.2). Solo owner (editEmployees).
 * M2M de servicios con checkboxes; JSON simple para customSchedule /
 * customHolidays (validación completa en F3.5). userId no se expone
 * en frontend (decisión F3.2 — solo backend/seed).
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useUser } from '../context/UserContext';
import { can } from '../utils/roleConfig';
import useEmailVerified from '../hooks/useEmailVerified';
import VerificationBanner from '../components/VerificationBanner';

interface Service {
  id: string;
  name: string;
  duration: number;
  isActive: boolean;
}

function parseJsonObject(raw: string, field: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${field} must be valid JSON`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${field} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

export default function CreateEmployee() {
  const navigate = useNavigate();
  const { user } = useUser();
  const canEdit = user ? can(user.role, 'editEmployees') : false;
  const { emailVerified } = useEmailVerified();
  // F4.4b: gating local (defensa en profundidad) — el backend devuelve
  // 403 EMAIL_NOT_VERIFIED en POST /employees si el tenant no verifica.
  const locked = emailVerified === false;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [offersAllServices, setOffersAllServices] = useState(true);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [customSchedule, setCustomSchedule] = useState('');
  const [customHolidays, setCustomHolidays] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canEdit) return;
    client
      .get('/services')
      .then((res) => setServices(res.data.filter((service: Service) => service.isActive)))
      .catch(() => setServices([]));
  }, [canEdit]);

  if (!canEdit) {
    return (
      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6 max-w-lg">
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          You don't have permission to create employees.
        </p>
      </div>
    );
  }

  const toggleService = (id: string) => {
    setServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    setError('');
    setLoading(true);

    try {
      const schedule = parseJsonObject(customSchedule, 'Custom schedule');
      const holidays = parseJsonObject(customHolidays, 'Custom holidays');
      await client.post('/employees', {
        name,
        email,
        phone,
        offersAllServices,
        serviceIds: offersAllServices ? [] : serviceIds,
        customSchedule: schedule,
        customHolidays: holidays,
      });
      navigate('/employees');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating employee');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="font-display-lg-mobile text-display-lg-mobile text-on-background mb-6">
        Create Employee
      </h1>
      {error && (
        <div className="bg-error-container text-on-error-container p-3 rounded mb-4 text-sm">
          {error}
        </div>
      )}
      {locked && (
        <div className="mb-4">
          <VerificationBanner
            message="Confirma tu email para editar"
            linkTo="/tenant-config"
            linkLabel="Confirmar email"
          />
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="bg-surface border border-outline-variant/30 rounded-xl p-6"
      >
        <fieldset disabled={locked} className="space-y-4 border-0 p-0 min-w-0">
          <div>
            <label htmlFor="employee-name" className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
              Name
            </label>
            <input
              id="employee-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label htmlFor="employee-email" className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
              Email (optional)
            </label>
            <input
              id="employee-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label htmlFor="employee-phone" className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
              Phone (optional)
            </label>
            <input
              id="employee-phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <fieldset className="border-t border-outline-variant/30 pt-4">
            <legend className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              Services
            </legend>
            <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface mb-3">
              <input
                type="checkbox"
                checked={offersAllServices}
                onChange={(e) => setOffersAllServices(e.target.checked)}
              />
              Offers all services
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
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
                  <span className="text-on-surface-variant text-xs">({service.duration} min)</span>
                </label>
              ))}
              {services.length === 0 && (
                <p className="text-on-surface-variant font-body-sm text-body-sm">
                  No services available.
                </p>
              )}
            </div>
          </fieldset>

          <fieldset className="border-t border-outline-variant/30 pt-4">
            <legend className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              Custom schedule (JSON, optional)
            </legend>
            <textarea
              id="employee-custom-schedule"
              value={customSchedule}
              onChange={(e) => setCustomSchedule(e.target.value)}
              rows={3}
              placeholder='{"monday": "09:00-17:00"}'
              className="w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded font-mono text-xs focus:outline-none focus:border-primary transition-colors"
            />
          </fieldset>

          <fieldset className="border-t border-outline-variant/30 pt-4">
            <legend className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              Custom holidays (JSON, optional)
            </legend>
            <textarea
              id="employee-custom-holidays"
              value={customHolidays}
              onChange={(e) => setCustomHolidays(e.target.value)}
              rows={2}
              placeholder='{"2026-12-25": true}'
              className="w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded font-mono text-xs focus:outline-none focus:border-primary transition-colors"
            />
          </fieldset>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-container text-on-primary-container font-title-sm text-title-sm py-3 px-4 rounded hover:bg-primary transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Employee'}
          </button>
        </fieldset>
      </form>
    </div>
  );
}
