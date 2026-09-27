import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import type { Role } from '../utils/roleConfig';

interface UserContextValue {
  user: { id: string; name: string; email: string; role: Role } | null;
  isLoading: boolean;
  login: (credentials: { email: string; password: string } | { xUserId: string }) => Promise<void>;
  logout: () => void;
  refreshUser: () => void;
  hasRole: (role: Role) => boolean;
  isAdmin: () => boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserContextValue['user']>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(() => {
    return !!localStorage.getItem('token');
  }, []);

  const fetchUser = useCallback(() => {
    const userId = localStorage.getItem('userId');
    if (!userId) { setUser(null); setIsLoading(false); return; }
    setIsLoading(true);
    client.get(`/users/${userId}`)
      .then((res) => {
        setUser({
          id: res.data.id,
          name: res.data.name,
          email: res.data.email,
          role: res.data.role || 'client',
        });
      })
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const refreshUser = useCallback(() => {
    const hasToken = checkAuth();
    if (hasToken) {
      fetchUser();
    } else {
      setUser(null);
      setIsLoading(false);
    }
  }, [checkAuth, fetchUser]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (credentials: { email: string; password: string } | { xUserId: string }) => {
    const res = await client.post('/auth/login', credentials);
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('userId', res.data.userId);
    refreshUser();
  }, [refreshUser]);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    setUser(null);
  }, []);

  const hasRole = useCallback((role: Role) => {
    return user?.role === role;
  }, [user]);

  const isAdmin = useCallback(() => {
    return user?.role === 'admin';
  }, [user]);

  return (
    <UserContext.Provider value={{
      user,
      isLoading,
      login,
      logout,
      refreshUser,
      hasRole,
      isAdmin,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
