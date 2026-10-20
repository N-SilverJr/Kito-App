import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SessionResponse } from '@nutripals/core';
import { api } from './api';

type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';

interface AuthContextValue {
  session: SessionResponse | null;
  status: AuthStatus;
  error: string | null;
  refresh: () => Promise<SessionResponse | null>;
  setSession: (session: SessionResponse) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SessionResponse | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.auth.session();
      setSessionState(next);
      setStatus('authenticated');
      setError(null);
      return next;
    } catch (caught) {
      const statusCode = (caught as { status?: number }).status;
      setSessionState(null);
      if (statusCode === 401) {
        setStatus('anonymous');
        setError(null);
      } else {
        setStatus('error');
        setError(caught instanceof Error ? caught.message : 'Could not reach the server.');
      }
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => {
      setSessionState(null);
      setStatus('anonymous');
    };
    window.addEventListener('nutripals:unauthorized', onUnauthorized);
    return () => window.removeEventListener('nutripals:unauthorized', onUnauthorized);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // The local session is cleared regardless; the cookie is httpOnly.
    }
    setSessionState(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      status,
      error,
      refresh,
      setSession: (next) => {
        setSessionState(next);
        setStatus('authenticated');
      },
      signOut,
    }),
    [session, status, error, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
