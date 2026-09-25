/**
 * @file Dashboard.tsx
 * @module pages
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useUser } from '../context/UserContext';

interface Item {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
}

export default function Dashboard() {
  const { user } = useUser();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    client.get('/items')
      .then((res) => {
        if (!cancelled) setItems(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        Loading dashboard...
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
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display-lg text-display-lg text-on-background">
          {user ? `Welcome, ${user.name}` : 'Dashboard'}
        </h1>
        <p className="text-on-surface-variant mt-2 font-body-lg text-body-lg">
          Your items at a glance.
        </p>
      </div>

      {/* Items grid */}
      {items.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/items/${item.id}`}
              className="group relative bg-surface border border-outline-variant/30 rounded-xl overflow-hidden hover:border-primary/50 transition-colors duration-300 flex flex-col h-full cursor-pointer"
            >
              <div className="absolute inset-0 bg-surface-container-low opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="p-6 flex-1 flex flex-col z-10">
                <h3 className="font-headline-md text-headline-md text-on-background mb-2">
                  {item.title}
                </h3>
                {item.description && (
                  <p className="text-on-surface-variant font-body-sm text-body-sm line-clamp-2 mb-4">
                    {item.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-auto">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border ${
                    item.status === 'active'
                      ? 'bg-[var(--color-green,#22c55e)]/10 text-[var(--color-green,#22c55e)] border-[var(--color-green,#22c55e)]/30'
                      : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
                  }`}>
                    {item.status}
                  </span>
                </div>
              </div>
              <div className="bg-surface-container-high border-t border-outline-variant/30 p-4 z-10 relative">
                <span className="w-full flex items-center justify-between text-primary font-title-sm text-title-sm group-hover:text-primary-fixed transition-colors">
                  <span>View Details</span>
                  <span className="material-symbols-outlined">arrow_forward</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-surface border border-outline-variant/30 rounded-xl">
          <span className="material-symbols-outlined text-6xl text-outline mb-4 block">inventory_2</span>
          <p className="text-on-surface-variant font-body-lg text-body-lg">
            No items yet. Create your first one.
          </p>
          <Link
            to="/items/create"
            className="inline-flex items-center gap-2 mt-4 py-2.5 px-5 bg-primary-container text-on-primary-container font-title-sm text-title-sm rounded hover:bg-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Create Item
          </Link>
        </div>
      )}
    </div>
  );
}
