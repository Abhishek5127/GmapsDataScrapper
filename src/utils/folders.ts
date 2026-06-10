/**
 * Folder color tokens. Each folder stores a color key (e.g. 'violet'); these
 * maps translate that into Tailwind classes for dots and soft chip backgrounds.
 * Using a static map keeps Tailwind's JIT happy (no dynamic class names).
 */

export const FOLDER_DOT: Record<string, string> = {
  violet: 'bg-violet-500',
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  cyan: 'bg-cyan-500',
  indigo: 'bg-indigo-500',
  fuchsia: 'bg-fuchsia-500',
};

export const FOLDER_SOFT: Record<string, string> = {
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  cyan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
};

/** Fallback color class when a folder's color key is unknown. */
export const dotClass = (color?: string): string => FOLDER_DOT[color ?? ''] ?? 'bg-slate-400';
export const softClass = (color?: string): string =>
  FOLDER_SOFT[color ?? ''] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300';
