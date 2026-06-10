import { useEffect, useState, useCallback } from 'react';
import type { ThemeMode } from '@/types';
import { getSettings, saveSettings } from '@/utils/settings';

/**
 * Theme hook: reads the persisted theme, applies the `dark` class to <html>,
 * and reacts to the OS preference when the mode is `system`.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>('system');

  // Load persisted theme once.
  useEffect(() => {
    void getSettings().then((s) => setThemeState(s.theme));
  }, []);

  // Apply the resolved theme to the document element.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', isDark);
    };
    apply();
    if (theme === 'system') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
  }, [theme]);

  // Persist + update theme.
  const setTheme = useCallback(async (next: ThemeMode) => {
    setThemeState(next);
    const settings = await getSettings();
    await saveSettings({ ...settings, theme: next });
  }, []);

  const cycle = useCallback(() => {
    const order: ThemeMode[] = ['light', 'dark', 'system'];
    const idx = order.indexOf(theme);
    void setTheme(order[(idx + 1) % order.length]);
  }, [theme, setTheme]);

  return { theme, setTheme, cycle };
}
