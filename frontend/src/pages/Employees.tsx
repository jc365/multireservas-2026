/**
 * @file Employees.tsx
 * @module pages
 *
 * Lista de empleados del tenant (F3.2). owner ve todo (con toggle
 * de inactivos); employee solo se ve a sí mismo (self-view en backend).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useUser } from '../context/UserContext';
import { can } from '../utils/roleConfig';

interface Employee {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  userId: string | null;
  offersAllServices: boolean;
  serviceIds: string[];
  isActive: boolean;
  createdAt: string;
}

export default function Employees() {
  const { user } = useUser();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const canView = user ? can(user.role, 'viewEmployees') : false;
  const isOwner = user?.role === 'owner';

  useEffect(() => {
    let cancelled = false;
    if (!canView) {
      setLoading(false);
      return () => { cancelled = true; };
    }
    const params = includeInactive && isOwner ? '?includeInactive=true' : '';
    client
      .get(`/employees${params}`)
      .then((res) => {
        if (!cancelled) setEmployees(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [canView, includeInactive, isOwner]);

  if (!canView) {
    return (
      <div className="bg-surface border border-outline-variant/30 rounded-xl p-6">
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          You don't have access to employees.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        Loading employees...
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-display-lg-mobile text-display-lg-mobile text-on-background">
          Employees
        </h1>
        {isOwner && (
          <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant cursor-pointer">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Include inactive
          </label>
        )}
      </div>
      {employees.length === 0 ? (
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          No employees yet.
        </p>
      ) : (
        <div className="space-y-4">
          {employees.map((employee) => (
            <Link
              key={employee.id}
              to={`/employees/${employee.id}`}
              className="block bg-surface border border-outline-variant/30 rounded-xl p-6 hover:border-primary/50 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-headline-md text-headline-md text-on-background">
                    {employee.name}
                  </h3>
                  <div className="flex items-center gap-3 mt-2">
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
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border bg-surface-container text-on-surface-variant border-outline-variant/30">
                    {employee.offersAllServices
                      ? 'all services'
                      : `${employee.serviceIds.length} services`}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border ${
                    employee.isActive
                      ? 'bg-[var(--color-green,#22c55e)]/10 text-[var(--color-green,#22c55e)] border-[var(--color-green,#22c55e)]/30'
                      : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
                  }`}>
                    {employee.isActive ? 'active' : 'inactive'}
                  </span>
                  <code className="text-xs text-outline bg-surface-container-high px-2 py-1 rounded">
                    {employee.id}
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
