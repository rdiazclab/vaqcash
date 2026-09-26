import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { readLocal, writeLocal } from './storage';

export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'sobres:theme';

interface ThemeContextValue {
  choice: ThemeChoice;
  resolved: 'light' | 'dark';
  setChoice: (choice: ThemeChoice) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readChoice(): ThemeChoice {
  const raw = readLocal(KEY);
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' =
    choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;

  useEffect(() => {
    // data-theme is always written, so the CSS variables and the `dark:` variant
    // agree even when the choice is "follow the system".
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    writeLocal(KEY, next);
  }, []);

  const toggle = useCallback(() => {
    setChoiceState((current) => {
      const next: ThemeChoice =
        (current === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : current) === 'dark'
          ? 'light'
          : 'dark';
      writeLocal(KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ choice, resolved, setChoice, toggle }),
    [choice, resolved, setChoice, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
