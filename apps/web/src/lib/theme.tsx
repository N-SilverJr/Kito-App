import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ThemePreference } from '@nutripals/core';
import { api } from './api';
import { useAuth } from './auth';

interface ThemeContextValue {
  theme: ThemePreference;
  resolved: 'light' | 'dark';
  setTheme: (theme: ThemePreference) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'nutripals-theme';

function readStored(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // ignore storage failures
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [theme, setThemeState] = useState<ThemePreference>(readStored);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => setPrefersDark(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    if (session && session.preferences.theme !== theme) {
      setThemeState(session.preferences.theme);
    }
    // Only sync once per session update; user changes are applied immediately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.preferences.theme]);

  const apply = useCallback((next: ThemePreference) => {
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage failures
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      apply(next);
      if (session) {
        api.me.updatePreferences({ theme: next }).catch(() => {
          // Local preference still applies if the server is unreachable.
        });
      }
    },
    [apply, session],
  );

  const cycleTheme = useCallback(() => {
    const resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  }, [theme, prefersDark, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolved: theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme,
      setTheme,
      cycleTheme,
    }),
    [theme, prefersDark, setTheme, cycleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
