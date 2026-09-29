/**
 * @file Services.tsx
 * @module pages
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useUser } from '../context/UserContext';
import { can } from '../utils/roleConfig';
import { formatPrice } from '../utils/booking';

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  price: number | null;
  category: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function Services() {
  const { user } = useUser();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canView = user ? can(user.role, 'viewServices') : false;

  useEffect(() => {
    let cancelled = false;
    if (!canView) {
      setLoading(false);
      return () => { cancelled = true; };
    }
    client
      .get('/services')
      .then((res) => {
        if (!cancelled) setServices(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [canView]);

  if (!canView) {
    return (
      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6">
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          You don't have access to services.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        Loading services...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-error-container text-on-error-container p-4 rounded-xl">
        Error: {error}
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display-lg-mobile text-display-lg-mobile text-on-background mb-6">
        Services
      </h1>
      {services.length === 0 ? (
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          No services yet.
        </p>
      ) : (
        <div className="space-y-4">
          {services.map((service) => (
            <Link
              key={service.id}
              to={`/services/${service.id}`}
              className="block bg-surface border border-outline-variant/30 rounded-xl p-6 hover:border-primary/50 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-headline-md text-headline-md text-on-background">
                    {service.name}
                  </h3>
                  {service.description && (
                    <p className="text-on-surface-variant font-body-sm text-body-sm mt-1">
                      {service.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-on-surface-variant font-body-sm text-body-sm">
                      {service.duration} min
                    </span>
                    <span className="text-on-surface font-body-sm text-body-sm font-medium">
                      {formatPrice(service.price)}
                    </span>
                    {service.category && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border bg-surface-container text-on-surface-variant border-outline-variant/30">
                        {service.category}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border ${
                    service.isActive
                      ? 'bg-[var(--color-green,#22c55e)]/10 text-[var(--color-green,#22c55e)] border-[var(--color-green,#22c55e)]/30'
                      : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
                  }`}>
                    {service.isActive ? 'active' : 'inactive'}
                  </span>
                  <code className="text-xs text-outline bg-surface-container-high px-2 py-1 rounded">
                    {service.id}
                  </code>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
