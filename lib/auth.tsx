import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  Account,
  clearToken,
  createPhoneAccount,
  fetchMe,
  getStoredToken,
  revokeToken,
  storeToken,
  PhoneSignupRequest,
} from '@/lib/api';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  token: string | null;
  account: Account | null;
  error: string | null;
  refresh: () => Promise<void>;
  completePhoneSignup: (payload: PhoneSignupRequest) => Promise<{ token: string; account: Account }>;
  loginWithToken: (token: string) => Promise<{ token: string; account: Account }>;
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

  const completePhoneSignup = useCallback(async (payload: PhoneSignupRequest) => {
    setStatus('loading');
    setError(null);
    try {
      const tokenResp = await createPhoneAccount(payload);
      await storeToken(tokenResp.access_token);
      const me = await fetchMe(tokenResp.access_token);
      setToken(tokenResp.access_token);
      setAccount(me);
      setStatus('authenticated');
      return { token: tokenResp.access_token, account: me };
    } catch (err) {
      setToken(null);
      setAccount(null);
      setStatus('unauthenticated');
      setError(err instanceof Error ? err.message : 'Signup failed');
      throw err;
    }
  }, []);

  const loginWithToken = useCallback(async (tokenValue: string) => {
    setStatus('loading');
    setError(null);
    try {
      await storeToken(tokenValue);
      const me = await fetchMe(tokenValue);
      setToken(tokenValue);
      setAccount(me);
      setStatus('authenticated');
      return { token: tokenValue, account: me };
    } catch (err) {
      await clearToken();
      setToken(null);
      setAccount(null);
      setStatus('unauthenticated');
      setError(err instanceof Error ? err.message : 'Login failed');
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
      completePhoneSignup,
      loginWithToken,
      logout,
    }),
    [account, completePhoneSignup, error, loginWithToken, logout, refresh, status, token]
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
