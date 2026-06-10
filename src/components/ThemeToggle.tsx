import { useTheme } from '@/hooks/useTheme';
import { SunIcon, MoonIcon, MonitorIcon } from './icons';
import type { ThemeMode } from '@/types';

const NEXT_LABEL: Record<ThemeMode, string> = {
  light: 'Switch to dark',
  dark: 'Switch to system',
  system: 'Switch to light',
};

function resolvedPopupTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

export function ThemeToggle({ className = '', popupOnly = false }: { className?: string; popupOnly?: boolean }) {
  const { theme, setTheme, cycle } = useTheme();
  const popupTheme = resolvedPopupTheme(theme);
  const Icon = theme === 'light' ? SunIcon : theme === 'dark' ? MoonIcon : MonitorIcon;
  const label = popupOnly
    ? popupTheme === 'dark' ? 'Switch to light' : 'Switch to dark'
    : NEXT_LABEL[theme];

  const handleClick = () => {
    if (popupOnly) {
      void setTheme(popupTheme === 'dark' ? 'light' : 'dark');
      return;
    }
    cycle();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      aria-label={label}
      className={`btn-ghost !p-2 text-lg text-brand-600 hover:bg-brand-50 dark:text-yellow-300 dark:hover:bg-slate-800 ${className}`}
    >
      {popupOnly ? (popupTheme === 'dark' ? <MoonIcon /> : <SunIcon />) : <Icon />}
    </button>
  );
}
