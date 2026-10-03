/**
 * @file Dashboard.tsx
 * @module pages
 *
 * Vista general del tenant: servicios + empleados + reservas (F3.2/F3.3).
 * F4.4b: banner de verificación de email si el tenant no ha confirmado
 * su email (admin exento).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useUser } from '../context/UserContext';
import { can } from '../utils/roleConfig';
import { formatPrice } from '../utils/booking';
import { STATUS_STYLES, clientName, formatSlot } from './Reservations';
import type { ReservationView } from './Reservations';
import useEmailVerified from '../hooks/useEmailVerified';
import VerificationBanner from '../components/VerificationBanner';
import { useI18n } from '../i18n';

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  price: number | null;
  isActive: boolean;
  createdAt: string;
}

interface Employee {
  id: string;
  name: string;
  email: string | null;
  offersAllServices: boolean;
  serviceIds: string[];
  isActive: boolean;
}

export default function Dashboard() {
  const { user } = useUser();
  const { emailVerified } = useEmailVerified();
  const { t } = useI18n();
  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reservations, setReservations] = useState<ReservationView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canViewServices = user ? can(user.role, 'viewServices') : false;
  const canEditServices = user ? can(user.role, 'editServices') : false;
  const canViewEmployees = user ? can(user.role, 'viewEmployees') : false;
  const canEditEmployees = user ? can(user.role, 'editEmployees') : false;
  const canViewReservations = user ? can(user.role, 'viewReservations') : false;
  const canEditReservations = user ? can(user.role, 'editReservations') : false;
  const hasAnyAccess = canViewServices || canViewEmployees || canViewReservations;

  useEffect(() => {
    let cancelled = false;
    if (!hasAnyAccess) {
      setLoading(false);
      return () => { cancelled = true; };
    }

    const requests: Promise<void>[] = [];
    if (canViewServices) {
      requests.push(
        client
          .get('/services')
          .then((res) => {
            if (!cancelled) setServices(res.data);
          })
          .catch((err) => {
            if (!cancelled) setError(err.message);
          })
      );
    }
    if (canViewEmployees) {
      requests.push(
        client
          .get('/employees')
          .then((res) => {
            if (!cancelled) setEmployees(res.data);
          })
          .catch((err) => {
            if (!cancelled) setError(err.message);
          })
      );
    }
    if (canViewReservations) {
      requests.push(
        client
          .get('/reservations')
          .then((res) => {
            if (!cancelled) setReservations(res.data);
          })
          .catch((err) => {
            if (!cancelled) setError(err.message);
          })
      );
    }

    Promise.all(requests).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [hasAnyAccess, canViewServices, canViewEmployees, canViewReservations]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        {t('tenant.dashboard.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-error-container text-on-error-container p-4 rounded-xl">
        {t('error')}: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display-lg text-display-lg text-on-background">
          {user ? t('tenant.dashboard.welcome', { name: user.name }) : t('tenant.dashboard.title')}
        </h1>
        <p className="text-on-surface-variant mt-2 font-body-lg text-body-lg">
          {t('tenant.dashboard.subtitle')}
        </p>
      </div>

      {emailVerified === false && (
        <VerificationBanner
          message={t('tenant.dashboard.verifyBanner')}
          linkTo="/tenant-config"
          linkLabel={t('tenant.dashboard.setupNow')}
        />
      )}

      {!hasAnyAccess ? (
        <div className="text-center py-16 bg-surface border border-outline-variant/30 rounded-xl">
          <span className="material-symbols-outlined text-6xl text-outline mb-4 block">lock</span>
          <p className="text-on-surface-variant font-body-lg text-body-lg">
            {t('tenant.dashboard.noAccess')}
          </p>
        </div>
      ) : (
        <>
          {canViewServices && (
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-headline-md text-headline-md text-on-background">
                  {t('tenant.dashboard.services')}
                </h2>
                {canEditServices && (
                  <Link
                    to="/services/create"
                    className="inline-flex items-center gap-1 text-primary hover:text-primary-fixed-dim font-title-sm text-title-sm transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    {t('tenant.dashboard.createService')}
                  </Link>
                )}
              </div>
              {services.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
                  {services.map((service) => (
                    <Link
                      key={service.id}
                      to={`/services/${service.id}`}
                      className="group relative bg-surface border border-outline-variant/30 rounded-xl overflow-hidden hover:border-primary/50 transition-colors duration-300 flex flex-col h-full cursor-pointer"
                    >
                      <div className="absolute inset-0 bg-surface-container-low opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      <div className="p-6 flex-1 flex flex-col z-10">
                        <h3 className="font-headline-md text-headline-md text-on-background mb-2">
                          {service.name}
                        </h3>
                        {service.description && (
                          <p className="text-on-surface-variant font-body-sm text-body-sm line-clamp-2 mb-4">
                            {service.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-auto">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border ${
                            service.isActive
                              ? 'bg-[var(--color-green,#22c55e)]/10 text-[var(--color-green,#22c55e)] border-[var(--color-green,#22c55e)]/30'
                              : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
                          }`}>
                            {service.isActive ? t('tenant.dashboard.active') : t('tenant.dashboard.inactive')}
                          </span>
                          <span className="text-on-surface-variant font-body-sm text-body-sm">
                            {service.duration} min
                          </span>
                          <span className="text-on-surface font-body-sm text-body-sm font-medium">
                            {formatPrice(service.price)}
                          </span>
                        </div>
                      </div>
                      <div className="bg-surface-container-high border-t border-outline-variant/30 p-4 z-10 relative">
                        <span className="w-full flex items-center justify-between text-primary font-title-sm text-title-sm group-hover:text-primary-fixed transition-colors">
                          <span>{t('tenant.dashboard.viewDetails')}</span>
                          <span className="material-symbols-outlined">arrow_forward</span>
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-surface border border-outline-variant/30 rounded-xl">
                  <span className="material-symbols-outlined text-6xl text-outline mb-4 block">event_available</span>
                  <p className="text-on-surface-variant font-body-lg text-body-lg">
                    {t('tenant.dashboard.noServices')}
                    {canEditServices ? ` ${t('tenant.dashboard.createFirst')}` : ''}
                  </p>
                  {canEditServices && (
                    <Link
                      to="/services/create"
                      className="inline-flex items-center gap-2 mt-4 py-2.5 px-5 bg-primary-container text-on-primary-container font-title-sm text-title-sm rounded hover:bg-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                      {t('tenant.dashboard.createService')}
                    </Link>
                  )}
                </div>
              )}
            </section>
          )}

          {canViewEmployees && (
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-headline-md text-headline-md text-on-background">
                  {t('tenant.dashboard.employees')}
                </h2>
                {canEditEmployees && (
                  <Link
                    to="/employees/create"
                    className="inline-flex items-center gap-1 text-primary hover:text-primary-fixed-dim font-title-sm text-title-sm transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    {t('tenant.dashboard.createEmployee')}
                  </Link>
                )}
              </div>
              {employees.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
                  {employees.map((employee) => (
                    <Link
                      key={employee.id}
                      to={`/employees/${employee.id}`}
                      className="group relative bg-surface border border-outline-variant/30 rounded-xl overflow-hidden hover:border-primary/50 transition-colors duration-300 flex flex-col h-full cursor-pointer"
                    >
                      <div className="absolute inset-0 bg-surface-container-low opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      <div className="p-6 flex-1 flex flex-col z-10">
                        <h3 className="font-headline-md text-headline-md text-on-background mb-2">
                          {employee.name}
                        </h3>
                        {employee.email && (
                          <p className="text-on-surface-variant font-body-sm text-body-sm mb-4">
                            {employee.email}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-auto">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border ${
                            employee.isActive
                              ? 'bg-[var(--color-green,#22c55e)]/10 text-[var(--color-green,#22c55e)] border-[var(--color-green,#22c55e)]/30'
                              : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
                          }`}>
                            {employee.isActive ? t('tenant.dashboard.active') : t('tenant.dashboard.inactive')}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border bg-surface-container text-on-surface-variant border-outline-variant/30">
                            {employee.offersAllServices
                              ? t('tenant.dashboard.allServices')
                              : t('tenant.dashboard.servicesCount', { count: employee.serviceIds.length })}
                          </span>
                        </div>
                      </div>
                      <div className="bg-surface-container-high border-t border-outline-variant/30 p-4 z-10 relative">
                        <span className="w-full flex items-center justify-between text-primary font-title-sm text-title-sm group-hover:text-primary-fixed transition-colors">
                          <span>{t('tenant.dashboard.viewDetails')}</span>
                          <span className="material-symbols-outlined">arrow_forward</span>
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-surface border border-outline-variant/30 rounded-xl">
                  <span className="material-symbols-outlined text-6xl text-outline mb-4 block">group</span>
                  <p className="text-on-surface-variant font-body-lg text-body-lg">
                    {t('tenant.dashboard.noEmployees')}
                    {canEditEmployees ? ` ${t('tenant.dashboard.createFirst')}` : ''}
                  </p>
                  {canEditEmployees && (
                    <Link
                      to="/employees/create"
                      className="inline-flex items-center gap-2 mt-4 py-2.5 px-5 bg-primary-container text-on-primary-container font-title-sm text-title-sm rounded hover:bg-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                      {t('tenant.dashboard.createEmployee')}
                    </Link>
                  )}
                </div>
              )}
            </section>
          )}

          {canViewReservations && (
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-headline-md text-headline-md text-on-background">
                  {t('tenant.dashboard.reservations')}
                </h2>
                {canEditReservations && (
                  <Link
                    to="/reservations/create"
                    className="inline-flex items-center gap-1 text-primary hover:text-primary-fixed-dim font-title-sm text-title-sm transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    {t('tenant.dashboard.createReservation')}
                  </Link>
                )}
              </div>
              {reservations.length > 0 ? (
                <div className="space-y-3">
                  {reservations.slice(0, 5).map((reservation) => (
                    <Link
                      key={reservation.id}
                      to={`/reservations/${reservation.id}`}
                      className="flex justify-between items-center gap-4 bg-surface border border-outline-variant/30 rounded-xl p-4 hover:border-primary/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <span className="text-on-surface font-body-md text-body-md font-medium">
                          {clientName(reservation)}
                        </span>
                        <span className="text-on-surface-variant font-body-sm text-body-sm">
                          {' '}· {reservation.service?.name ?? '—'} · {reservation.employee?.name ?? '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-on-surface font-body-sm text-body-sm">
                          {formatSlot(reservation)}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border ${STATUS_STYLES[reservation.status] ?? STATUS_STYLES.cancelled}`}
                        >
                          {reservation.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                  {reservations.length > 5 && (
                    <Link
                      to="/reservations"
                      className="inline-flex items-center gap-1 text-primary hover:text-primary-fixed-dim font-title-sm text-title-sm transition-colors"
                    >
                      {t('tenant.dashboard.viewAll', { count: reservations.length })}
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 bg-surface border border-outline-variant/30 rounded-xl">
                  <span className="material-symbols-outlined text-6xl text-outline mb-4 block">event</span>
                  <p className="text-on-surface-variant font-body-lg text-body-lg">
                    {t('tenant.dashboard.noReservations')}
                    {canEditReservations ? ` ${t('tenant.dashboard.createFirstReservation')}` : ''}
                  </p>
                  {canEditReservations && (
                    <Link
                      to="/reservations/create"
                      className="inline-flex items-center gap-2 mt-4 py-2.5 px-5 bg-primary-container text-on-primary-container font-title-sm text-title-sm rounded hover:bg-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                      {t('tenant.dashboard.createReservation')}
                    </Link>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
