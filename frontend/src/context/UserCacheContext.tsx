import { createContext, useContext, useState, useCallback, useRef } from 'react';
import client from '../api/client';

interface CachedUser {
  id: string;
  name: string;
  email: string;
}

interface UserCacheContextValue {
  getUser: (id: string) => CachedUser | null;
  ensureUser: (id: string) => Promise<CachedUser | null>;
}

const UserCacheContext = createContext<UserCacheContextValue | null>(null);

export function UserCacheProvider({ children }: { children: React.ReactNode }) {
  const cacheRef = useRef<Map<string, CachedUser>>(new Map());
  const pendingRef = useRef<Map<string, Promise<CachedUser | null>>>(new Map());
  const [, setTick] = useState(0);

  const getUser = useCallback((id: string): CachedUser | null => {
    return cacheRef.current.get(id) ?? null;
  }, []);

  const ensureUser = useCallback(async (id: string): Promise<CachedUser | null> => {
    if (!id) return null;
    if (cacheRef.current.has(id)) return cacheRef.current.get(id)!;

    if (pendingRef.current.has(id)) return pendingRef.current.get(id)!;

    const promise = client.get(`/users/${id}`)
      .then((res) => {
        const user: CachedUser = {
          id: res.data.id,
          name: res.data.name,
          email: res.data.email,
        };
        cacheRef.current.set(id, user);
        setTick((t) => t + 1);
        return user;
      })
      .catch(() => null)
      .finally(() => {
        pendingRef.current.delete(id);
      });

    pendingRef.current.set(id, promise);
    return promise;
  }, []);

  return (
    <UserCacheContext.Provider value={{ getUser, ensureUser }}>
      {children}
    </UserCacheContext.Provider>
  );
}

export function useUserCache(): UserCacheContextValue {
  const ctx = useContext(UserCacheContext);
  if (!ctx) throw new Error('useUserCache must be used within UserCacheProvider');
  return ctx;
}
