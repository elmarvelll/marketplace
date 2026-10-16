// src/hooks/use-theme-preference.ts
// Shared dark/light preference for the auth screens so the login and sign-up
// pages stay in sync when a visitor toggles the theme.

import { useCallback, useSyncExternalStore } from "react";

const THEME_STORAGE_KEY = "akadverse-theme";
const THEME_EVENT = "akadverse-theme-change";

function readDark(): boolean {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light") return false;
    if (saved === "dark") return true;
  } catch {
    // Storage blocked: fall back to the OS preference.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
    media.removeEventListener("change", onChange);
  };
}

export function useThemePreference() {
  const isDarkMode = useSyncExternalStore(subscribe, readDark, () => true);

  const setIsDarkMode = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(readDark()) : next;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, value ? "dark" : "light");
    } catch {
      // Ignore storage failures.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return { isDarkMode, setIsDarkMode } as const;
}
