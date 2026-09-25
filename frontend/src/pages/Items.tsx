import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

interface Item {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
}

export default function Items() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client
      .get('/items')
      .then((res) => setItems(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        Loading items...
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
        Items
      </h1>
      {items.length === 0 ? (
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          No items yet.
        </p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/items/${item.id}`}
              className="block bg-surface border border-outline-variant/30 rounded-xl p-6 hover:border-primary/50 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-headline-md text-headline-md text-on-background">
                    {item.title}
                  </h3>
                  {item.description && (
                    <p className="text-on-surface-variant font-body-sm text-body-sm mt-1">
                      {item.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-label-caps border ${
                    item.status === 'active'
                      ? 'bg-[var(--color-green,#22c55e)]/10 text-[var(--color-green,#22c55e)] border-[var(--color-green,#22c55e)]/30'
                      : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
                  }`}>
                    {item.status}
                  </span>
                  <code className="text-xs text-outline bg-surface-container-high px-2 py-1 rounded">
                    {item.id}
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
