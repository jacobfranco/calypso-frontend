import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  Account,
  clearToken,
  createAccount,
  fetchMe,
  getStoredToken,
  loginWithPassword,
  revokeToken,
  storeToken,
} from '@/lib/api';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  token: string | null;
  account: Account | null;
  error: string | null;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFromStorage = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const stored = await getStoredToken();
      if (!stored) {
        setToken(null);
        setAccount(null);
        setStatus('unauthenticated');
        return;
      }

      const me = await fetchMe(stored);
      setToken(stored);
      setAccount(me);
      setStatus('authenticated');
    } catch (err) {
      await clearToken();
      setToken(null);
      setAccount(null);
      setStatus('unauthenticated');
      setError(err instanceof Error ? err.message : 'Unable to restore session');
    }
  }, []);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const me = await fetchMe(token);
      setAccount(me);
      setStatus('authenticated');
    } catch (err) {
      await clearToken();
      setToken(null);
      setAccount(null);
      setStatus('unauthenticated');
      setError(err instanceof Error ? err.message : 'Session expired');
    }
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    setStatus('loading');
    setError(null);
    try {
      const tokenResp = await loginWithPassword(email, password);
      await storeToken(tokenResp.access_token);
      const me = await fetchMe(tokenResp.access_token);
      setToken(tokenResp.access_token);
      setAccount(me);
      setStatus('authenticated');
    } catch (err) {
      setToken(null);
      setAccount(null);
      setStatus('unauthenticated');
      setError(err instanceof Error ? err.message : 'Login failed');
      throw err;
    }
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    setStatus('loading');
    setError(null);
    try {
      const tokenResp = await createAccount({ name, email, password });
      await storeToken(tokenResp.access_token);
      const me = await fetchMe(tokenResp.access_token);
      setToken(tokenResp.access_token);
      setAccount(me);
      setStatus('authenticated');
    } catch (err) {
      setToken(null);
      setAccount(null);
      setStatus('unauthenticated');
      setError(err instanceof Error ? err.message : 'Signup failed');
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await revokeToken(token);
      } catch (err) {
        // Ignore revoke failures for local logout.
      }
    }
    await clearToken();
    setToken(null);
    setAccount(null);
    setStatus('unauthenticated');
  }, [token]);

  const value = useMemo(
    () => ({
      status,
      token,
      account,
      error,
      refresh,
      login,
      signup,
      logout,
    }),
    [account, error, login, logout, refresh, signup, status, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
