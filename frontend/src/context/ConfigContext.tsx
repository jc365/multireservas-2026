import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import client from '../api/client';
import { setLogLevel } from '../utils/logger';
import { useUser } from './UserContext';

interface Config {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  category: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

interface ConfigContextValue {
  configs: Config[];
  loading: boolean;
  error: string | null;
  getConfig: (key: string) => Config | undefined;
  getConfigValue: <T = unknown>(key: string, defaultValue: T) => T;
  refresh: () => Promise<void>;
  upsert: (key: string, value: unknown, description?: string, category?: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevLogLevel = useRef<string | null>(null);

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await client.get('/config');
      const newLevel = data.find((c: Config) => c.key === 'logging.level')?.value as string | undefined;
      if (prevLogLevel.current !== null && newLevel && prevLogLevel.current !== newLevel) {
        console.log(`🔄 [Config] Log level changed: ${prevLogLevel.current} → ${newLevel}`);
      }
      if (newLevel) {
        setLogLevel(newLevel);
      }
      prevLogLevel.current = newLevel ?? null;
      setConfigs(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load config';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setConfigs([]);
      setError(null);
      setLoading(false);
      return;
    }
    fetchConfigs();
    const id = setInterval(fetchConfigs, 30_000);
    return () => clearInterval(id);
  }, [user?.id, fetchConfigs]);

  const getConfig = useCallback(
    (key: string) => configs.find((c) => c.key === key),
    [configs]
  );

  const getConfigValue = useCallback(
    <T = unknown>(key: string, defaultValue: T): T => {
      const config = configs.find((c) => c.key === key);
      if (!config) return defaultValue;
      return config.value as T;
    },
    [configs]
  );

  const upsert = useCallback(
    async (key: string, value: unknown, description?: string, category?: string) => {
      await client.put(`/config/${key}`, { value, description, category });
      await fetchConfigs();
    },
    [fetchConfigs]
  );

  const remove = useCallback(
    async (key: string) => {
      await client.delete(`/config/${key}`);
      await fetchConfigs();
    },
    [fetchConfigs]
  );

  return (
    <ConfigContext.Provider
      value={{ configs, loading, error, getConfig, getConfigValue, refresh: fetchConfigs, upsert, remove }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider');
  return ctx;
}

export type { Config };
