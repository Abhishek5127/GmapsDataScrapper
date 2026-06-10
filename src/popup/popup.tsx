import { useCallback, useEffect, useState } from 'react';
import type { ScrapedLead, Stats, Settings, SaveResult, MessageResponse } from '@/types';
import { getActiveTab, sendToTab, sendToBackground } from '@/utils/messaging';
import { getSettings, saveSettings, applyFieldFilter } from '@/utils/settings';
import { useTheme } from '@/hooks/useTheme';
import { useFolders } from '@/hooks/useFolders';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { FolderSelect } from '@/components/FolderSelect';
import { useToast } from '@/components/Toast';
import { MapPinIcon, GlobeIcon, GridIcon, SettingsIcon, PlusIcon } from '@/components/icons';

/** A compact statistic chip. */
function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="card flex flex-col items-center px-2 py-2.5">
      <span className={`text-lg font-bold ${accent}`}>{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
    </div>
  );
}

/** Render a single previewed field row. */
function FieldRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 border-b border-slate-100 py-1.5 text-xs last:border-0 dark:border-slate-800">
      <span className="w-24 shrink-0 font-semibold text-slate-500">{label}</span>
      <span className="flex-1 break-words text-slate-800 dark:text-slate-200">{value}</span>
    </div>
  );
}

export function Popup() {
  useTheme();
  const { toast } = useToast();
  const { folders, create: createFolder } = useFolders();

  const [tab, setTab] = useState<chrome.tabs.Tab | undefined>();
  const [lead, setLead] = useState<ScrapedLead | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMaps = tab?.url?.includes('google.com/maps') ?? false;

  const loadStats = useCallback(async () => {
    const res = await sendToBackground<Stats>({ type: 'GET_STATS' });
    if (res.ok && res.data) setStats(res.data);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      const [s, activeTab] = await Promise.all([getSettings(), getActiveTab()]);
      setSettings(s);
      setTab(activeTab);

      if (!activeTab?.id || !/^https?:/i.test(activeTab.url ?? '')) {
        setError('Open a website or a Google Maps listing to collect a lead.');
        setLoading(false);
        void loadStats();
        return;
      }

      const res = await sendToTab<ScrapedLead>(activeTab.id, { type: 'SCRAPE_CURRENT' });
      if (res.ok && res.data) setLead(res.data);
      else setError(res.error ?? 'Could not read this page. Try reloading it.');
      setLoading(false);
      void loadStats();
    })();
  }, [loadStats]);

  /** Persist the current lead into the chosen folder, filtered by enabled fields. */
  const handleSave = async () => {
    if (!lead || !settings) return;
    setSaving(true);
    const filtered = applyFieldFilter(lead, settings.enabledFields) as ScrapedLead;
    filtered.folderId = folderId;
    const res: MessageResponse<SaveResult> = await sendToBackground<SaveResult>({
      type: 'SAVE_LEAD',
      payload: filtered,
    });
    setSaving(false);
    if (res.ok) {
      const folderName = folders.find((f) => f.id === folderId)?.name ?? 'Unfiled';
      toast(
        res.data?.status === 'merged'
          ? `Merged into an existing record · ${folderName}`
          : `Lead saved to ${folderName}`,
        'success',
      );
      void loadStats();
    } else {
      toast(`Save failed: ${res.error}`, 'error');
    }
  };

  const toggleAutoSave = async () => {
    if (!settings) return;
    const key = isMaps ? 'autoSave' : 'autoSaveWebsites';
    const next = { ...settings, [key]: !settings[key] } as Settings;
    setSettings(next);
    await saveSettings(next);
    toast(`Auto-save ${next[key] ? 'on' : 'off'} for ${isMaps ? 'Maps' : 'websites'}`, 'info');
  };

  const openDashboard = () => chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') });
  const openSettings = () => chrome.runtime.openOptionsPage();

  const previewRows = () => {
    if (!lead || !settings) return null;
    const f = settings.enabledFields;
    return (
      <div className="card px-3 py-2">
        {f.businessName && <FieldRow label="Business" value={lead.businessName ?? ''} />}
        {f.phone && <FieldRow label="Phone" value={(lead.phone ?? []).join(', ')} />}
        {f.email && <FieldRow label="Email" value={(lead.email ?? []).join(', ')} />}
        {f.website && <FieldRow label="Website" value={lead.website ?? ''} />}
        {f.address && <FieldRow label="Address" value={lead.address ?? ''} />}
        {f.rating && <FieldRow label="Rating" value={lead.rating != null ? `${lead.rating} ★` : ''} />}
        {f.reviewCount && <FieldRow label="Reviews" value={lead.reviewCount != null ? String(lead.reviewCount) : ''} />}
        {f.category && <FieldRow label="Category" value={lead.category ?? ''} />}
        {f.socialLinks && <FieldRow label="Social" value={Object.keys(lead.socialLinks ?? {}).join(', ')} />}
        {f.contactPage && <FieldRow label="Contact" value={lead.contactPage ?? ''} />}
        {f.mapsUrl && lead.mapsUrl && <FieldRow label="Maps" value="Google Maps link captured" />}
        {!hasAnyData(lead) && (
          <p className="py-3 text-center text-xs text-slate-500">No contact details detected on this page.</p>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 bg-transparent p-4">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={34} />
          <div>
            <h1 className="text-sm font-bold leading-tight">MapHarvest</h1>
            <p className="flex items-center gap-1 text-[11px] text-slate-500">
              {isMaps ? <MapPinIcon /> : <GlobeIcon />}
              {isMaps ? 'Google Maps' : 'Website'}
            </p>
          </div>
        </div>
        <ThemeToggle popupOnly />
      </header>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Total" value={stats.total} accent="text-brand-600 dark:text-brand-300" />
          <Stat label="Today" value={stats.today} accent="text-red-500" />
          <Stat label="Month" value={stats.thisMonth} accent="text-yellow-500 dark:text-yellow-300" />
          <Stat label="Unique" value={stats.uniqueBusinesses} accent="text-green-600 dark:text-green-300" />
        </div>
      )}

      {loading ? (
        <div className="card flex items-center justify-center py-8 text-sm text-slate-500">Reading page…</div>
      ) : error ? (
        <div className="card flex flex-col items-center gap-3 px-3 py-6 text-center">
          <p className="text-xs text-slate-500">{error}</p>
          {tab?.id && /^https?:/i.test(tab.url ?? '') && (
            <button className="btn-secondary text-xs" onClick={() => tab.id && chrome.tabs.reload(tab.id)}>
              Reload page
            </button>
          )}
        </div>
      ) : (
        <>
          {previewRows()}

          {/* Folder chooser */}
          <div className="card px-3 py-3">
            <FolderSelect folders={folders} value={folderId} onChange={setFolderId} onCreate={createFolder} />
          </div>

          <button className="btn-primary w-full" onClick={handleSave} disabled={saving || !lead}>
            <PlusIcon /> {saving ? 'Saving…' : 'Save Lead'}
          </button>

          <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
            <span className="font-medium">Auto-save {isMaps ? 'Maps listings' : 'websites'}</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={isMaps ? (settings?.autoSave ?? false) : (settings?.autoSaveWebsites ?? false)}
              onChange={toggleAutoSave}
            />
          </label>
        </>
      )}

      {/* Footer actions */}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary text-xs" onClick={openDashboard}>
          <GridIcon /> Dashboard
        </button>
        <button className="btn-secondary text-xs" onClick={openSettings}>
          <SettingsIcon /> Settings
        </button>
      </div>
    </div>
  );
}

/** True when the scraped lead has at least one populated detail. */
function hasAnyData(lead: ScrapedLead): boolean {
  return Boolean(
    lead.businessName ||
      lead.phone?.length ||
      lead.email?.length ||
      lead.website ||
      lead.address ||
      lead.category ||
      (lead.socialLinks && Object.keys(lead.socialLinks).length),
  );
}
