/**
 * @file CreateReservation.tsx
 * @module pages
 *
 * Formulario de alta de reservas (F3.3). owner y employee
 * (editReservations). Cliente interno: firstName/lastName + phone/email
 * con required según los flags de GET /tenants/me (F3.4 #12; defaults
 * phone=true, email=false si el tenant no responde). fecha + hora
 * locales → startTimeUTC; el día calendario se manda tal cual
 * (timezone completa en F4).
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useUser } from '../context/UserContext';
import { can } from '../utils/roleConfig';

interface Service {
  id: string;
  name: string;
  duration: number;
  price: number | null;
  isActive: boolean;
}

interface Employee {
  id: string;
  name: string;
  isActive: boolean;
}

function apiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

export default function CreateReservation() {
  const navigate = useNavigate();
  const { user } = useUser();
  const canEdit = user ? can(user.role, 'editReservations') : false;

  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [requirePhone, setRequirePhone] = useState(true);
  const [requireEmail, setRequireEmail] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canEdit) return;
    Promise.all([client.get('/services'), client.get('/employees')])
      .then(([servicesRes, employeesRes]) => {
        setServices(servicesRes.data.filter((service: Service) => service.isActive));
        setEmployees(employeesRes.data.filter((employee: Employee) => employee.isActive));
      })
      .catch(() => {
        setServices([]);
        setEmployees([]);
      });
    client
      .get('/tenants/me')
      .then((res) => {
        const settings = res.data?.settings;
        if (settings && typeof settings === 'object') {
          setRequirePhone(settings.requireClientPhone !== false);
          setRequireEmail(settings.requireClientEmail === true);
        }
      })
      .catch(() => {
        setRequirePhone(true);
        setRequireEmail(false);
      });
  }, [canEdit]);

  if (!canEdit) {
    return (
      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6 max-w-lg">
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          You don't have permission to create reservations.
        </p>
      </div>
    );
  }

  const selectedService = services.find((service) => service.id === serviceId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!date || !time) {
      setError('date and time are required');
      return;
    }

    setLoading(true);
    try {
      // fecha + hora en la tz del navegador → instante UTC
      const localStart = new Date(`${date}T${time}:00`);
      if (Number.isNaN(localStart.getTime())) {
        setError('Invalid date or time');
        setLoading(false);
        return;
      }

      await client.post('/reservations', {
        employeeId,
        serviceId,
        date,
        startTimeUTC: localStart.toISOString(),
        notes: notes.trim() ? notes.trim() : null,
        client: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim() ? email.trim() : null,
        },
      });
      navigate('/reservations');
    } catch (err) {
      setError(apiError(err, 'Error creating reservation'));
      setLoading(false);
    }
  };

  const inputClass =
    'w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors';
  const labelClass =
    'block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2';

  return (
    <div className="max-w-lg">
      <h1 className="font-display-lg-mobile text-display-lg-mobile text-on-background mb-6">
        Create Reservation
      </h1>
      {error && (
        <div className="bg-error-container text-on-error-container p-3 rounded mb-4 text-sm">
          {error}
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="bg-surface border border-outline-variant/30 rounded-xl p-6 space-y-4"
      >
        <div>
          <label htmlFor="reservation-employee" className={labelClass}>
            Employee
          </label>
          <select
            id="reservation-employee"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            required
            className={inputClass}
          >
            <option value="">Select an employee...</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="reservation-service" className={labelClass}>
            Service
          </label>
          <select
            id="reservation-service"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            required
            className={inputClass}
          >
            <option value="">Select a service...</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} ({service.duration} min)
              </option>
            ))}
          </select>
          {selectedService && (
            <p className="text-on-surface-variant font-body-sm text-body-sm mt-1">
              Duration: {selectedService.duration} min
              {selectedService.price !== null && ` · ${selectedService.price}`}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="reservation-date" className={labelClass}>
              Date
            </label>
            <input
              id="reservation-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="reservation-time" className={labelClass}>
              Time
            </label>
            <input
              id="reservation-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              className={inputClass}
            />
          </div>
        </div>

        <fieldset className="border-t border-outline-variant/30 pt-4">
          <legend className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            Client
          </legend>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="client-first-name" className={labelClass}>
                  First name
                </label>
                <input
                  id="client-first-name"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="client-last-name" className={labelClass}>
                  Last name
                </label>
                <input
                  id="client-last-name"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label htmlFor="client-phone" className={labelClass}>
                Phone ({requirePhone ? 'required' : 'optional'})
              </label>
              <input
                id="client-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required={requirePhone}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="client-email" className={labelClass}>
                Email ({requireEmail ? 'required' : 'optional'})
              </label>
              <input
                id="client-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required={requireEmail}
                className={inputClass}
              />
            </div>
          </div>
        </fieldset>

        <div>
          <label htmlFor="reservation-notes" className={labelClass}>
            Notes (optional)
          </label>
          <textarea
            id="reservation-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary-container text-on-primary-container font-title-sm text-title-sm py-3 px-4 rounded hover:bg-primary transition-colors disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Reservation'}
        </button>
      </form>
    </div>
  );
}
