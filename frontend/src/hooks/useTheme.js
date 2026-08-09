import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'witech_theme';
const SWITCHING_CLASS = 'wt-theme-switching';
// Must outlast the .18s transition declared for SWITCHING_CLASS in theme.css.
const SWITCH_MS = 220;

function readInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // private browsing — fall through
  }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function persistTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // private browsing — the choice simply will not persist
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(readInitialTheme);
  const switchTimer = useRef(0);

  // Reflect the theme onto <html>. Deliberately does NOT write to storage:
  // this effect also runs on mount, and persisting there would freeze a
  // preference the user never expressed — a visitor whose OS is dark would
  // be pinned to dark for good merely by loading a page, and could never go
  // back to "follow my system" without clearing site data. Only an explicit
  // setTheme / toggleTheme persists.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => () => window.clearTimeout(switchTimer.current), []);

  const setTheme = useCallback((next) => {
    const value = next === 'dark' ? 'dark' : 'light';

    // Turn the cross-fade on for the length of the swap only. See the
    // comment on .wt-theme-switching in theme.css for why a permanent
    // version of that rule breaks every Tailwind transition in the app.
    const root = document.documentElement;
    root.classList.add(SWITCHING_CLASS);
    window.clearTimeout(switchTimer.current);
    switchTimer.current = window.setTimeout(() => {
      root.classList.remove(SWITCHING_CLASS);
    }, SWITCH_MS);

    persistTheme(value);
    setThemeState(value);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, toggleTheme, setTheme };
}
