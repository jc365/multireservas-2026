/**
 * @file CreateReservation.tsx
 * @module pages
 *
 * Formulario de alta de reservas (F3.3; selector de slots F4.1b).
 * owner y employee (editReservations). Cliente interno:
 * firstName/lastName + phone/email con required según los flags de
 * GET /tenants/me (F3.4 #12). La hora ya no se escribe a mano: se
 * elige un slot de GET /availability (toggle "Lo antes posible" /
 * "Elegir fecha", paginación "Cargar más"). El día calendario que se
 * envía es el del tenant (tenantDateKey sobre la tz de /tenants/me).
 *
 * F4.4c "sin preferencia": el empleado es OPCIONAL. El select abre con
 * "Sin preferencia" (default) y, si el tenant tiene
 * `allowCustomerAssignment = false`, ni siquiera se muestra (siempre
 * "sin preferencia" → el backend asigna). Al elegir una fecha se pide
 * `from` SIN `to`: si ese día no hay huecos el backend devuelve slots
 * de días posteriores y se avisa "No hay huecos el X. Mostrando
 * huecos a partir del Y".
 *
 * F4.5d "multi-servicio seguido": el select de servicio pasa a ser
 * una checkbox-list (patrón de CreateEmployee). Los servicios
 * seleccionados definen un bloque: duración total (suma), precio
 * total y resumen visible. GET /availability recibe `serviceIds`
 * (CSV) SIEMPRE — incluso con un solo servicio — y nunca `duration`
 * (son excluyentes en el backend); POST /reservations envía
 * `serviceIds` como array (1 elemento → reserva simple sin grupo).
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import SlotPicker, { type SlotOption } from '../components/SlotPicker';
import { useUser } from '../context/UserContext';
import { can } from '../utils/roleConfig';
import { translateError, useI18n } from '../i18n';
import {
  formatPrice,
  reservationEmployeeId,
  reservationSummary,
  serviceIdsParam,
  showEmployeePicker,
  sumServiceDurations,
  sumServicePrices,
  tenantDateKey,
} from '../utils/booking';

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

type SlotMode = 'asap' | 'date';

export default function CreateReservation() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { t } = useI18n();
  const canEdit = user ? can(user.role, 'editReservations') : false;

  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  // F4.5d: multi-selección (checkbox-list). Orden = orden de la lista.
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [mode, setMode] = useState<SlotMode>('asap');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextFrom, setNextFrom] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [timezone, setTimezone] = useState('');
  const [notes, setNotes] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [requirePhone, setRequirePhone] = useState(true);
  const [requireEmail, setRequireEmail] = useState(false);
  const [allowCustomerAssignment, setAllowCustomerAssignment] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

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
          // F4.4c: sin permiso para elegir empleado → nunca hay select.
          const allows = showEmployeePicker(
            typeof settings.allowCustomerAssignment === 'boolean'
              ? settings.allowCustomerAssignment
              : undefined
          );
          setAllowCustomerAssignment(allows);
          if (!allows) setEmployeeId('');
        }
        if (typeof res.data?.timezone === 'string') {
          setTimezone(res.data.timezone);
        }
      })
      .catch(() => {
        setRequirePhone(true);
        setRequireEmail(false);
        setAllowCustomerAssignment(true);
      });
  }, [canEdit]);

  // F4.5d: derivados del bloque (suma de durations y de prices).
  const selectedServices = services.filter((service) => serviceIds.includes(service.id));
  const duration = sumServiceDurations(selectedServices);
  const totalPrice = sumServicePrices(selectedServices);
  const showEmployeeSelect = showEmployeePicker(allowCustomerAssignment);
  // F4.4c: "" ("sin preferencia") también busca huecos → el backend
  // devuelve slots con el employeeId de quien los cubra. F4.5d: hace
  // falta al menos 1 servicio seleccionado (la suma es el ancho).
  const availabilityReady = Boolean(
    serviceIds.length > 0 && (mode === 'asap' || date)
  );
  // F4.4c: aviso cuando el día elegido no tiene ni un hueco y el
  // backend (from sin to) devuelve slots de días posteriores.
  const requestedDay = mode === 'date' && date ? date : null;
  const firstSlotDay =
    requestedDay && !slotsLoading && slots.length > 0
      ? tenantDateKey(slots[0].startUTC, timezone)
      : null;
  const dayGapNotice =
    firstSlotDay && firstSlotDay !== requestedDay ? firstSlotDay : null;

  useEffect(() => {
    if (!canEdit) return;
    const seq = ++seqRef.current;
    if (!availabilityReady) {
      setSlots([]);
      setHasMore(false);
      setNextFrom(null);
      setSelectedSlot(null);
      setSlotsLoading(false);
      setSlotsError('');
      return;
    }
    setSlotsLoading(true);
    setSlotsError('');
    setSelectedSlot(null);
    // F4.5d: `serviceIds` SIEMPRE (decisión 15); `duration` no se
    // envía: en el backend son excluyentes.
    const params: Record<string, string> = { serviceIds: serviceIdsParam(serviceIds) };
    if (employeeId) params.employeeId = employeeId;
    if (mode === 'date') {
      // F4.4c: `from` SIN `to` → si el día elegido está lleno, el
      // backend devuelve slots de días posteriores (ver aviso).
      params.from = date;
    }
    client
      .get('/availability', { params })
      .then((res) => {
        if (seq !== seqRef.current) return;
        setSlots(res.data?.slots ?? []);
        setHasMore(res.data?.hasMore === true);
        setNextFrom(res.data?.nextFrom ?? null);
      })
      .catch((err) => {
        if (seq !== seqRef.current) return;
        setSlots([]);
        setHasMore(false);
        setNextFrom(null);
        setSlotsError(translateError(err, t) || t('reservations.form.loadError'));
      })
      .finally(() => {
        if (seq === seqRef.current) setSlotsLoading(false);
      });
  }, [canEdit, availabilityReady, employeeId, serviceIds, mode, date]);

  if (!canEdit) {
    return (
      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6 max-w-lg">
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          {t('reservations.form.noPermission')}
        </p>
      </div>
    );
  }

  // F4.5d: añadir/quitar un servicio del bloque (checkbox-list).
  const toggleService = (id: string) => {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const handleLoadMore = async () => {
    if (!nextFrom || slotsLoading) return;
    const seq = ++seqRef.current;
    setSlotsLoading(true);
    try {
      const params: Record<string, string> = {
        serviceIds: serviceIdsParam(serviceIds),
        from: nextFrom,
      };
      if (employeeId) params.employeeId = employeeId;
      const res = await client.get('/availability', { params });
      if (seq !== seqRef.current) return;
      setSlots((prev) => [...prev, ...(res.data?.slots ?? [])]);
      setHasMore(res.data?.hasMore === true);
      setNextFrom(res.data?.nextFrom ?? null);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setSlotsError(translateError(err, t) || t('reservations.form.loadError'));
    } finally {
      if (seq === seqRef.current) setSlotsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (serviceIds.length === 0) {
      setError(t('reservations.form.selectService'));
      return;
    }

    if (!selectedSlot) {
      setError(t('reservations.form.selectSlot'));
      return;
    }

    setLoading(true);
    try {
      await client.post('/reservations', {
        // F4.4c: undefined = "sin preferencia" → el backend asigna.
        employeeId: reservationEmployeeId(employeeId),
        // F4.5d: array en el orden de selección; con 1 elemento el
        // backend crea una reserva simple SIN grupo.
        serviceIds: [...serviceIds],
        date: tenantDateKey(selectedSlot.startUTC, timezone),
        startTimeUTC: selectedSlot.startUTC,
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
      setError(translateError(err, t) || t('reservations.form.createError'));
      setLoading(false);
    }
  };

  const inputClass =
    'w-full bg-surface-container border-b-2 border-outline-variant/30 text-on-surface px-3 py-2 rounded focus:outline-none focus:border-primary transition-colors';
  const labelClass =
    'block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2';
  const toggleClass = (active: boolean) =>
    `flex-1 py-2 px-3 rounded border font-title-sm text-title-sm transition-colors ${
      active
        ? 'bg-primary-container text-on-primary-container border-primary'
        : 'bg-surface-container text-on-surface-variant border-outline-variant/30 hover:border-primary/50'
    }`;

  return (
    <div className="max-w-lg">
      <h1 className="font-display-lg-mobile text-display-lg-mobile text-on-background mb-6">
        {t('reservations.form.title')}
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
        {showEmployeeSelect && (
          <div>
            <label htmlFor="reservation-employee" className={labelClass}>
              {t('reservations.form.employee')}
            </label>
            <select
              id="reservation-employee"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={inputClass}
            >
              <option value="">{t('reservations.form.noPreference')}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <fieldset>
          <legend className={labelClass}>{t('reservations.form.service')}</legend>
          <div className="space-y-2 max-h-48 overflow-y-auto" data-testid="service-checklist">
            {services.map((service) => (
              <label
                key={service.id}
                className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface"
              >
                <input
                  type="checkbox"
                  checked={serviceIds.includes(service.id)}
                  onChange={() => toggleService(service.id)}
                  className="accent-primary"
                />
                {service.name}
                <span className="text-on-surface-variant text-xs">
                  ({service.duration} min
                  {service.price !== null && ` · ${formatPrice(service.price)}`})
                </span>
              </label>
            ))}
            {services.length === 0 && (
              <p className="text-on-surface-variant font-body-sm text-body-sm">
                {t('reservations.form.noServices')}
              </p>
            )}
          </div>
          {selectedServices.length > 0 && (
            <p
              data-testid="reservation-summary"
              className="text-on-surface-variant font-body-sm text-body-sm mt-2"
            >
              {reservationSummary(selectedServices.length, duration, totalPrice, t)}
            </p>
          )}
        </fieldset>

        <div>
          <span className={labelClass} id="reservation-when-label">
            {t('reservations.form.when')}
          </span>
          <div className="flex gap-2" role="group" aria-labelledby="reservation-when-label">
            <button
              type="button"
              onClick={() => setMode('asap')}
              aria-pressed={mode === 'asap'}
              className={toggleClass(mode === 'asap')}
            >
              {t('reservations.form.asap')}
            </button>
            <button
              type="button"
              onClick={() => setMode('date')}
              aria-pressed={mode === 'date'}
              className={toggleClass(mode === 'date')}
            >
              {t('reservations.form.pickDate')}
            </button>
          </div>
          {mode === 'date' && (
            <div className="mt-3">
              <label htmlFor="reservation-date" className={labelClass}>
                {t('reservations.form.date')}
              </label>
              <input
                id="reservation-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </div>

        {availabilityReady && (
          <div>
            <span className={labelClass}>{t('reservations.form.slots')}</span>
            {slotsError && (
              <p
                role="alert"
                className="bg-error-container text-on-error-container p-3 rounded mb-2 text-sm"
              >
                {slotsError}
              </p>
            )}
            {dayGapNotice && requestedDay && (
              <p
                role="status"
                className="bg-surface-container text-on-surface p-3 rounded mb-2 text-sm"
                data-testid="slot-day-gap-notice"
              >
                {t('reservations.form.dayGap', {
                  requestedDay,
                  firstDay: dayGapNotice,
                })}
              </p>
            )}
            <SlotPicker
              slots={slots}
              selectedUTC={selectedSlot ? selectedSlot.startUTC : null}
              onSelect={setSelectedSlot}
              hasMore={hasMore}
              loading={slotsLoading}
              onLoadMore={handleLoadMore}
              dayKeyOf={(slot) => tenantDateKey(slot.startUTC, timezone)}
              employeeNameOf={
                employeeId
                  ? undefined
                  : (id: string) =>
                      employees.find((employee) => employee.id === id)?.name
              }
            />
          </div>
        )}

        <fieldset className="border-t border-outline-variant/30 pt-4">
          <legend className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            {t('reservations.fields.client')}
          </legend>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="client-first-name" className={labelClass}>
                  {t('reservations.form.firstName')}
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
                  {t('reservations.form.lastName')}
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
                {requirePhone
                  ? t('reservations.form.phoneRequired')
                  : t('reservations.form.phoneOptional')}
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
                {requireEmail
                  ? t('reservations.form.emailRequired')
                  : t('reservations.form.emailOptional')}
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
            {t('reservations.form.notes')}
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
          {loading ? t('reservations.form.submitting') : t('reservations.form.submit')}
        </button>
      </form>
    </div>
  );
}
