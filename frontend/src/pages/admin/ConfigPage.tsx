import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useConfig, type Config } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'];
const STORAGE_KEY = 'admin.config.openSections';

function getStoredOpenSections(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function persistOpenSections(open: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...open]));
}

function detectInputType(config: Config): 'select-loglevel' | 'textarea-json' | 'number' | 'text' {
  if (config.key === 'logging.level') return 'select-loglevel';
  if (typeof config.value === 'object' && config.value !== null) return 'textarea-json';
  if (typeof config.value === 'number') return 'number';
  return 'text';
}

function ConfigValueInput({
  config,
  value,
  onChange,
}: {
  config: Config;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const inputType = detectInputType(config);

  if (inputType === 'select-loglevel') {
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface-container-high text-on-surface border border-outline-variant/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
      >
        {LOG_LEVELS.map((l) => (
          <option key={l} value={l}>{l}</option>
        ))}
      </select>
    );
  }

  if (inputType === 'textarea-json') {
    return (
      <textarea
        value={JSON.stringify(value, null, 2)}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            onChange(e.target.value);
          }
        }}
        rows={4}
        className="w-full bg-surface-container-high text-on-surface border border-outline-variant/30 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary resize-y"
      />
    );
  }

  if (inputType === 'number') {
    return (
      <input
        type="number"
        value={Number(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-surface-container-high text-on-surface border border-outline-variant/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
      />
    );
  }

  return (
    <input
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-surface-container-high text-on-surface border border-outline-variant/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
    />
  );
}

export default function ConfigPage() {
  const { configs, loading, error, upsert, remove } = useConfig();
  const { showSuccess, showError } = useToast();
  const location = useLocation();

  const [openSections, setOpenSections] = useState<Set<string>>(getStoredOpenSections);
  const [editingValues, setEditingValues] = useState<Record<string, unknown>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  // Deep linking: expand section from URL hash
  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (hash) {
      setOpenSections((prev) => {
        const next = new Set(prev);
        next.add(hash);
        persistOpenSections(next);
        return next;
      });
    }
  }, [location.hash]);

  const categories = useMemo(() => {
    const map = new Map<string, Config[]>();
    for (const c of configs) {
      const cat = c.category || 'uncategorized';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(c);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [configs]);

  const toggleSection = useCallback((cat: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      persistOpenSections(next);
      return next;
    });
  }, []);

  const handleValueChange = useCallback((key: string, value: unknown) => {
    setEditingValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async (config: Config) => {
    const key = config.key;
    const value = editingValues[key] !== undefined ? editingValues[key] : config.value;
    setSavingKey(key);
    try {
      await upsert(key, value, config.description ?? undefined, config.category ?? undefined);
      showSuccess(`Config "${key}" saved`);
      setEditingValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : `Failed to save "${key}"`);
    } finally {
      setSavingKey(null);
    }
  }, [editingValues, upsert, showSuccess, showError]);

  const handleDelete = useCallback(async (config: Config) => {
    if (!window.confirm(`Delete config "${config.key}"?`)) return;
    setDeletingKey(config.key);
    try {
      await remove(config.key);
      showSuccess(`Config "${config.key}" deleted`);
    } catch (err) {
      showError(err instanceof Error ? err.message : `Failed to delete "${config.key}"`);
    } finally {
      setDeletingKey(null);
    }
  }, [remove, showSuccess, showError]);

  const hasChanges = (config: Config) => {
    return editingValues[config.key] !== undefined &&
      JSON.stringify(editingValues[config.key]) !== JSON.stringify(config.value);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        Loading config...
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
        Config
      </h1>

      {categories.length === 0 && (
        <p className="text-on-surface-variant font-body-lg text-body-lg">
          No configuration entries found.
        </p>
      )}

      <div className="space-y-2">
        {categories.map(([cat, items]) => {
          const isOpen = openSections.has(cat);
          return (
            <div key={cat} className="bg-surface border border-outline-variant/30 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleSection(cat)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-container-low transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-on-surface-variant">
                    {isOpen ? 'expand_more' : 'chevron_right'}
                  </span>
                  <span className="font-title-sm text-title-sm text-on-surface capitalize">{cat}</span>
                </div>
                <span className="text-xs text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">
                  {items.length}
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-outline-variant/20 px-4 py-3 space-y-4">
                  {items.map((config) => {
                    const currentVal = editingValues[config.key] !== undefined
                      ? editingValues[config.key]
                      : config.value;
                    const dirty = hasChanges(config);
                    return (
                      <div key={config.key} className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-3 items-start">
                        <div>
                          <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                            {config.key}
                          </p>
                          {config.description && (
                            <p className="text-xs text-on-surface-variant mt-0.5">{config.description}</p>
                          )}
                        </div>
                        <ConfigValueInput
                          config={config}
                          value={currentVal}
                          onChange={(v) => handleValueChange(config.key, v)}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSave(config)}
                            disabled={savingKey === config.key || !dirty}
                            className="px-3 py-2 text-sm font-medium rounded bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {savingKey === config.key ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => handleDelete(config)}
                            disabled={deletingKey === config.key}
                            className="px-3 py-2 text-sm font-medium rounded bg-error-container text-on-error-container hover:bg-error/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {deletingKey === config.key ? '...' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
