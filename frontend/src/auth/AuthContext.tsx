import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { ApiError } from '../api/errors';
import type { User } from '../api/types';
import { DEFAULT_CURRENCY } from '../lib/money';
import { clearToken, getToken, setToken } from '../lib/session';

type Status = 'resolving' | 'anonymous' | 'authenticated';

interface AuthContextValue {
  status: Status;
  user: User | null;
  walletBalanceCents: number | null;
  currency: string;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: { email: string; password: string; displayName: string }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>(() => (getToken() ? 'resolving' : 'anonymous'));
  const [user, setUser] = useState<User | null>(null);
  const [walletBalanceCents, setWalletBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);

  const load = useCallback(async () => {
    if (!getToken()) {
      setStatus('anonymous');
      setUser(null);
      return;
    }
    try {
      const me = await api.me();
      setUser(me.user);
      setWalletBalance(me.wallet.balanceCents);
      setCurrency(me.wallet.currency);
      setStatus('authenticated');
    } catch (error) {
      // A 401 already dropped the token inside the client; anything else means
      // we cannot prove a session, so treat it as anonymous and let the user retry.
      if (!(error instanceof ApiError) || error.code === 'UNAUTHORIZED') clearToken();
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const adopt = useCallback((payload: { token: string; user: User }) => {
    setToken(payload.token);
    setUser(payload.user);
    setStatus('authenticated');
  }, []);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      adopt(await api.login(input));
      await load();
    },
    [adopt, load],
  );

  const register = useCallback(
    async (input: { email: string; password: string; displayName: string }) => {
      adopt(await api.register(input));
      await load();
    },
    [adopt, load],
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setWalletBalance(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      walletBalanceCents,
      currency,
      login,
      register,
      logout,
      refresh: load,
    }),
    [status, user, walletBalanceCents, currency, login, register, logout, load],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
