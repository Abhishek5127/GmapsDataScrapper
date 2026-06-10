import { useEffect, useState } from 'react';
import type { CollectableField, Settings as SettingsType, ThemeMode } from '@/types';
import { getSettings, saveSettings, defaultSettings, FIELD_LABELS, ALL_FIELDS } from '@/utils/settings';
import { useTheme } from '@/hooks/useTheme';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useToast } from '@/components/Toast';
import { GridIcon, SettingsIcon } from '@/components/icons';

/** A labelled toggle switch. */
function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-800">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
      <span className="relative inline-flex">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-brand-gradient dark:bg-slate-700" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Settings() {
  useTheme();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  if (!settings) {
    return <div className="p-10 text-center text-slate-500">Loading settings…</div>;
  }

  const update = (patch: Partial<SettingsType>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  };

  const toggleField = (field: CollectableField) => {
    update({ enabledFields: { ...settings.enabledFields, [field]: !settings.enabledFields[field] } });
  };

  const setAllFields = (value: boolean) => {
    const next = ALL_FIELDS.reduce(
      (acc, f) => {
        acc[f] = value;
        return acc;
      },
      {} as Record<CollectableField, boolean>,
    );
    update({ enabledFields: next });
  };

  const handleSave = async () => {
    await saveSettings(settings);
    setDirty(false);
    toast('Preferences saved', 'success');
  };

  const handleReset = async () => {
    const d = defaultSettings();
    setSettings(d);
    await saveSettings(d);
    setDirty(false);
    toast('Settings reset to defaults', 'info');
  };

  const enabledCount = ALL_FIELDS.filter((f) => settings.enabledFields[f]).length;

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-lift">
            <SettingsIcon className="text-xl" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Settings</h1>
            <p className="text-sm text-slate-500">Configure what MapHarvest captures.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            className="btn-secondary"
            onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })}
          >
            <GridIcon /> Dashboard
          </button>
        </div>
      </header>

      {/* Fields to collect */}
      <section className="card mb-6 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Fields to collect</h2>
            <p className="text-xs text-slate-500">{enabledCount} of {ALL_FIELDS.length} fields enabled</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost text-xs" onClick={() => setAllFields(true)}>Select all</button>
            <button className="btn-ghost text-xs" onClick={() => setAllFields(false)}>Clear</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ALL_FIELDS.map((field) => (
            <label
              key={field}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-600"
                checked={settings.enabledFields[field]}
                onChange={() => toggleField(field)}
              />
              {FIELD_LABELS[field]}
            </label>
          ))}
        </div>
      </section>

      {/* Automation */}
      <section className="card mb-6 space-y-3 p-5">
        <h2 className="text-base font-semibold">Automation</h2>
        <Toggle
          label="Auto-save Google Maps listings"
          description="Automatically save a lead whenever you open a business on Google Maps."
          checked={settings.autoSave}
          onChange={(v) => update({ autoSave: v })}
        />
        <Toggle
          label="Auto-save websites"
          description="Automatically capture contact info on every website you visit (use with care)."
          checked={settings.autoSaveWebsites}
          onChange={(v) => update({ autoSaveWebsites: v })}
        />
      </section>

      {/* Appearance & display */}
      <section className="card mb-6 space-y-4 p-5">
        <h2 className="text-base font-semibold">Appearance &amp; display</h2>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">Theme</span>
          <div className="flex gap-1 rounded-lg border border-slate-200 p-1 dark:border-slate-800">
            {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => update({ theme: mode })}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
                  settings.theme === mode
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">Rows per page (dashboard)</span>
          <select
            className="input w-28"
            value={settings.pageSize}
            onChange={(e) => update({ pageSize: Number(e.target.value) })}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Save bar */}
      <div className="sticky bottom-4 flex items-center justify-between rounded-lg border border-white/70 bg-white/90 px-5 py-3 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <span className="text-xs text-slate-500">
          {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
        </span>
        <div className="flex gap-2">
          <button className="btn-ghost text-sm" onClick={handleReset}>Reset to defaults</button>
          <button className="btn-primary" onClick={handleSave} disabled={!dirty}>Save preferences</button>
        </div>
      </div>
    </div>
  );
}
