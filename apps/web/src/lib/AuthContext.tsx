import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, type AuthUserDto } from './api';

interface AuthContextValue {
  user: AuthUserDto | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
  /**
   * Test seam only (mirrors App's `queryClient` prop): when provided, skips the initial
   * `GET /api/auth/me` call entirely and starts already-resolved in this state, so unit tests
   * that render `<App/>` don't need to stub an auth response on top of their own fetch mocks.
   * Real app usage never passes this — it's always `undefined` outside tests.
   */
  initialUser?: AuthUserDto | null;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, initialUser }) => {
  const [user, setUser] = useState<AuthUserDto | null>(initialUser ?? null);
  const [isLoading, setIsLoading] = useState(initialUser === undefined);

  useEffect(() => {
    if (initialUser !== undefined) {
      return;
    }
    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const me = await api.login(email, password);
    setUser(me);
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const me = await api.signup(email, password);
    setUser(me);
  }, []);

  const continueAsGuest = useCallback(async () => {
    const me = await api.continueAsGuest();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, continueAsGuest, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return ctx;
}
