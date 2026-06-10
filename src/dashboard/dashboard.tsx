import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { Lead, Settings, Stats } from '@/types';
import {
  getAllLeads,
  deleteLead,
  deleteLeads,
  putLead,
  clearLeads,
  getStats,
  bulkSave,
  renameFolder,
  deleteFolder,
  moveLeads,
} from '@/storage/db';
import { getSettings } from '@/utils/settings';
import { buildColumns, exportToExcel, exportToPdf, importLeadsFromFile } from '@/utils/exporter';
import { useTheme } from '@/hooks/useTheme';
import { useFolders } from '@/hooks/useFolders';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { Logo } from '@/components/Logo';
import { EditLeadModal } from './EditLeadModal';
import { FolderSidebar, type FolderFilter } from './FolderSidebar';
import { MoveToFolder } from './MoveToFolder';
import {
  SearchIcon,
  TrashIcon,
  EditIcon,
  DownloadIcon,
  UploadIcon,
  SettingsIcon,
  ChevronIcon,
  MapPinIcon,
  GlobeIcon,
  UsersIcon,
  CalendarIcon,
  BuildingIcon,
  ChartIcon,
  FileTextIcon,
} from '@/components/icons';

type SortDir = 'asc' | 'desc';
type SourceFilter = 'all' | 'google_maps' | 'website';

/** A dashboard statistic card. */
function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: number;
  accent: string;
  icon: ReactNode;
}) {
  return (
    <div className="card group flex items-center gap-3 p-4 hover:shadow-[0_18px_44px_-30px_rgba(15,23,42,.45)]">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg text-white shadow-sm transition group-hover:-translate-y-0.5 ${accent}`}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold">{value.toLocaleString()}</div>
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export function Dashboard() {
  useTheme();
  const { toast } = useToast();
  const { folders, refresh: refreshFolders, create: createFolder } = useFolders();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all');
  const [sortKey, setSortKey] = useState<string>('Date Added');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Lead | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Reload everything from storage and refresh the toolbar badge. */
  const load = useCallback(async () => {
    setLoading(true);
    const [allLeads, s, st] = await Promise.all([getAllLeads(), getSettings(), getStats()]);
    setLeads(allLeads);
    setSettings(s);
    setStats(st);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Notify the background so the toolbar badge stays in sync. */
  const notifyChanged = useCallback(() => {
    void chrome.runtime.sendMessage({ type: 'LEADS_CHANGED' }).catch(() => undefined);
  }, []);

  const pageSize = settings?.pageSize ?? 10;
  const columns = useMemo(
    () => (settings ? buildColumns(settings.enabledFields) : []),
    [settings],
  );

  /* ------------------------- derived data ------------------------- */

  /** Lead counts per folder (plus all / unfiled) for the sidebar badges. */
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = { all: leads.length, unfiled: 0 };
    for (const folder of folders) counts[folder.id] = 0;
    for (const lead of leads) {
      if (!lead.folderId || !(lead.folderId in counts)) counts.unfiled++;
      else counts[lead.folderId]++;
    }
    return counts;
  }, [leads, folders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const knownFolderIds = new Set(folders.map((f) => f.id));
    return leads.filter((lead) => {
      if (sourceFilter !== 'all' && lead.source !== sourceFilter) return false;
      if (folderFilter === 'unfiled' && lead.folderId && knownFolderIds.has(lead.folderId)) return false;
      if (folderFilter !== 'all' && folderFilter !== 'unfiled' && lead.folderId !== folderFilter) return false;
      if (!q) return true;
      // Search across all displayable column values.
      return columns.some((col) => col.value(lead).toLowerCase().includes(q));
    });
  }, [leads, search, sourceFilter, folderFilter, folders, columns]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.header === sortKey);
    if (!col) return filtered;
    const numeric = sortKey === 'Rating' || sortKey === 'Reviews';
    const dateCol = sortKey === 'Date Added';
    const arr = [...filtered].sort((a, b) => {
      let cmp: number;
      if (dateCol) {
        cmp = a.createdAt - b.createdAt;
      } else if (numeric) {
        cmp = (parseFloat(col.value(a)) || 0) - (parseFloat(col.value(b)) || 0);
      } else {
        cmp = col.value(a).localeCompare(col.value(b));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, columns, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sorted, currentPage, pageSize],
  );

  // Reset to first page when filters change.
  useEffect(() => setPage(1), [search, sourceFilter, folderFilter, pageSize]);

  /* --------------------------- selection -------------------------- */

  const pageIds = paged.map((l) => l.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const shouldIgnoreRowClick = (event: MouseEvent<HTMLElement>) =>
    Boolean((event.target as HTMLElement).closest('button, a, input, select, textarea, label'));

  /* ---------------------------- sorting --------------------------- */

  const onSort = (header: string) => {
    if (sortKey === header) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(header);
      setSortDir('asc');
    }
  };

  /* ------------------------- mutations ---------------------------- */

  const handleDelete = async (id: string) => {
    await deleteLead(id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    notifyChanged();
    await load();
    toast('Lead deleted', 'info');
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    await deleteLeads(ids);
    clearSelection();
    notifyChanged();
    await load();
    toast(`${ids.length} lead${ids.length > 1 ? 's' : ''} deleted`, 'info');
  };

  const handleClearAll = async () => {
    await clearLeads();
    clearSelection();
    setConfirmClear(false);
    notifyChanged();
    await load();
    toast('All leads cleared', 'info');
  };

  const handleEditSave = async (lead: Lead) => {
    await putLead(lead);
    setEditing(null);
    notifyChanged();
    await load();
    toast('Lead updated', 'success');
  };

  /* --------------------------- folders ---------------------------- */

  const handleCreateFolder = async (name: string) => {
    await createFolder(name);
    toast(`Folder “${name}” created`, 'success');
  };

  const handleRenameFolder = async (id: string, name: string) => {
    await renameFolder(id, name);
    await refreshFolders();
    toast('Folder renamed', 'success');
  };

  const handleDeleteFolder = async (id: string) => {
    await deleteFolder(id);
    if (folderFilter === id) setFolderFilter('all');
    await refreshFolders();
    notifyChanged();
    await load();
    toast('Folder deleted — its leads moved to Unfiled', 'info');
  };

  const handleMoveSelected = async (folderId: string | null) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    await moveLeads(ids, folderId);
    clearSelection();
    notifyChanged();
    await load();
    const dest = folderId ? folders.find((f) => f.id === folderId)?.name ?? 'folder' : 'Unfiled';
    toast(`Moved ${ids.length} lead${ids.length > 1 ? 's' : ''} to ${dest}`, 'success');
  };

  /** Heading shown above the table, reflecting the active folder filter. */
  const scopeTitle = (() => {
    if (folderFilter === 'all') return 'All leads';
    if (folderFilter === 'unfiled') return 'Unfiled';
    return folders.find((f) => f.id === folderFilter)?.name ?? 'Folder';
  })();

  /* --------------------------- export ----------------------------- */

  /** Records targeted by an export/action: selection if any, else filtered. */
  const exportScope = (): { records: Lead[]; label: string } => {
    if (selected.size > 0) {
      const set = selected;
      return { records: sorted.filter((l) => set.has(l.id)), label: `${selected.size} selected` };
    }
    return { records: sorted, label: `${sorted.length} filtered` };
  };

  const exportFilename = (records: Lead[]): string => {
    const folderNames = new Set<string>();
    const folderNameById = new Map(folders.map((folder) => [folder.id, folder.name]));

    records.forEach((lead) => {
      folderNames.add(lead.folderId ? folderNameById.get(lead.folderId) ?? 'Unknown Folder' : 'Unfiled');
    });

    let scope = scopeTitle;
    if (selected.size > 0) {
      const names = [...folderNames].sort((a, b) => a.localeCompare(b));
      scope = names.length === 1 ? names[0] : `${names.slice(0, 3).join(' + ')}${names.length > 3 ? ' + more' : ''}`;
    }

    const safeScope = scope.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'leads';
    return `leads-${safeScope}`;
  };

  const exportOptions = () => ({
    folderNames: Object.fromEntries(folders.map((folder) => [folder.id, folder.name])),
  });

  const runExport = async (kind: 'xlsx' | 'pdf') => {
    if (!settings) return;
    const { records } = exportScope();
    try {
      if (records.length === 0) throw new Error('There are no leads to export.');
      const filename = exportFilename(records);
      const options = exportOptions();
      if (kind === 'xlsx') exportToExcel(records, settings, filename, options);
      else exportToPdf(records, settings, filename, options);
      await chrome.runtime.sendMessage({ type: 'BUMP_EXPORT_COUNT', count: records.length }).catch(() => undefined);
      setStats((prev) => (prev ? { ...prev, exportCount: prev.exportCount + records.length } : prev));
      toast(`Exported ${records.length} lead${records.length > 1 ? 's' : ''} to ${kind.toUpperCase()}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  };

  /* --------------------------- import ----------------------------- */

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    try {
      const imported = await importLeadsFromFile(file);
      const { created, merged } = await bulkSave(imported);
      notifyChanged();
      await load();
      toast(`Imported ${created} new, merged ${merged} duplicate${merged === 1 ? '' : 's'}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed', 'error');
    }
  };

  /* ----------------------------- UI ------------------------------- */

  const SortHeader = ({ header }: { header: string }) => (
    <button
      onClick={() => onSort(header)}
      className="flex items-center gap-1 font-semibold hover:text-brand-600"
    >
      {header}
      {sortKey === header && (
        <ChevronIcon className={`text-xs transition ${sortDir === 'asc' ? 'rotate-180' : ''}`} />
      )}
    </button>
  );

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-[88rem] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <h1 className="text-base font-bold leading-tight">MapHarvest</h1>
              <p className="text-xs text-slate-500">Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button className="btn-secondary" onClick={() => chrome.runtime.openOptionsPage()}>
              <SettingsIcon /> Settings
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[88rem] px-4 py-6">
        {/* Stats */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Total Leads" value={stats.total} accent="bg-brand-600" icon={<UsersIcon />} />
            <StatCard label="Added Today" value={stats.today} accent="bg-red-500" icon={<CalendarIcon />} />
            <StatCard label="This Month" value={stats.thisMonth} accent="bg-yellow-400 text-slate-950" icon={<ChartIcon />} />
            <StatCard label="Unique Businesses" value={stats.uniqueBusinesses} accent="bg-green-500" icon={<BuildingIcon />} />
            <StatCard label="Total Exported" value={stats.exportCount} accent="bg-slate-900 dark:bg-slate-700" icon={<DownloadIcon />} />
          </div>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Folder sidebar */}
          <FolderSidebar
            folders={folders}
            value={folderFilter}
            onChange={setFolderFilter}
            counts={folderCounts}
            onCreate={handleCreateFolder}
            onRename={handleRenameFolder}
            onDelete={handleDeleteFolder}
          />

          {/* Main column */}
          <div className="min-w-0 flex-1">
            {/* Toolbar */}
            <div className="card mb-4 flex flex-col gap-3 p-3 shadow-[0_16px_42px_-28px_rgba(15,23,42,.35)] lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input pl-9"
                    placeholder="Search leads…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  className="input w-auto"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
                >
                  <option value="all">All sources</option>
                  <option value="google_maps">Google Maps</option>
                  <option value="website">Websites</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleImport}
                />
                <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  <UploadIcon /> Import
                </button>
                <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white/70 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
                  <button className="btn-ghost rounded-none text-sm" onClick={() => runExport('xlsx')} title="Export to Excel">
                    <DownloadIcon /> Excel
                  </button>
                  <button className="btn-ghost rounded-none border-l border-slate-300 text-sm dark:border-slate-700" onClick={() => runExport('pdf')} title="Export to PDF">
                    <FileTextIcon /> PDF
                  </button>
                </div>
              </div>
            </div>

            {/* Selection action bar */}
            {selected.size > 0 && (
              <div className="mb-3 flex animate-fade-in flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm shadow-sm dark:border-brand-800 dark:bg-brand-950/50">
                <span className="font-medium text-brand-700 dark:text-brand-300">
                  {selected.size} selected · exports &amp; moves use the selection
                </span>
                <div className="flex flex-wrap gap-2">
                  <MoveToFolder folders={folders} onMove={handleMoveSelected} />
                  <button className="btn-ghost text-sm" onClick={clearSelection}>Clear</button>
                  <button className="btn-danger text-sm" onClick={handleBulkDelete}>
                    <TrashIcon /> Delete
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="card flex flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  {scopeTitle}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {sorted.length}
                  </span>
                </h2>
              </div>
              <div className="w-full overflow-x-auto">
                <table className="w-full table-auto text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-100/80 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
                    <tr>
                      <th className="sticky left-0 z-10 w-10 bg-slate-100/80 px-3 py-3 dark:bg-slate-800/70">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand-600"
                          checked={allPageSelected}
                          onChange={togglePage}
                          aria-label="Select all on page"
                        />
                      </th>
                      {columns.map((col) => (
                        <th key={col.header} className="whitespace-nowrap px-3 py-3">
                          <SortHeader header={col.header} />
                        </th>
                      ))}
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={columns.length + 2} className="px-3 py-12 text-center text-slate-500">
                          Loading leads…
                        </td>
                      </tr>
                    ) : paged.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length + 2} className="px-3 py-16 text-center">
                          <p className="text-slate-500">No leads found.</p>
                          <p className="mt-1 text-xs text-slate-400">
                            Visit a website or Google Maps listing and click “Save Lead”, or import a file.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      paged.map((lead) => (
                        <tr
                          key={lead.id}
                          onClick={(event) => {
                            if (shouldIgnoreRowClick(event)) return;
                            toggleRow(lead.id);
                          }}
                          onDoubleClick={(event) => {
                            if (shouldIgnoreRowClick(event)) return;
                            setEditing(lead);
                          }}
                          title="Click to select. Double-click to edit."
                          className={`cursor-pointer border-b border-slate-100 transition duration-150 hover:bg-slate-50/90 dark:border-slate-800 dark:hover:bg-slate-800/45 ${
                            selected.has(lead.id) ? 'bg-brand-50/60 dark:bg-brand-950/40' : ''
                          }`}
                        >
                          <td className="sticky left-0 z-10 bg-inherit px-3 py-2.5">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-brand-600"
                              checked={selected.has(lead.id)}
                              onChange={() => toggleRow(lead.id)}
                              aria-label="Select row"
                            />
                          </td>
                          {columns.map((col) => (
                            <td key={col.header} className="px-3 py-2.5 align-top">
                              <CellValue header={col.header} value={col.value(lead)} source={lead.source} />
                            </td>
                          ))}
                          <td className="px-3 py-2.5">
                            <div className="flex justify-end gap-1">
                              <button className="btn-ghost !p-1.5" onClick={() => setEditing(lead)} title="Edit">
                                <EditIcon />
                              </button>
                              <button
                                className="btn-ghost !p-1.5 text-red-600"
                                onClick={() => handleDelete(lead.id)}
                                title="Delete"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800 sm:flex-row">
                <span className="text-slate-500">
                  {sorted.length === 0
                    ? 'No records'
                    : `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, sorted.length)} of ${sorted.length}`}
                </span>
                <div className="flex items-center gap-1">
                  <button className="btn-secondary text-xs" disabled={currentPage <= 1} onClick={() => setPage(1)}>
                    « First
                  </button>
                  <button
                    className="btn-secondary text-xs"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ‹ Prev
                  </button>
                  <span className="px-2 text-slate-500">
                    Page {currentPage} / {totalPages}
                  </span>
                  <button
                    className="btn-secondary text-xs"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next ›
                  </button>
                  <button
                    className="btn-secondary text-xs"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(totalPages)}
                  >
                    Last »
                  </button>
                </div>
              </div>
            </div>

            {/* Danger zone */}
            {leads.length > 0 && (
              <div className="mt-4 flex justify-end">
                <button className="btn-ghost text-xs text-red-600" onClick={() => setConfirmClear(true)}>
                  <TrashIcon /> Clear all leads
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Edit modal */}
      <EditLeadModal
        lead={editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSave={handleEditSave}
      />

      {/* Clear-all confirmation */}
      <Modal
        open={confirmClear}
        title="Clear all leads?"
        onClose={() => setConfirmClear(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmClear(false)}>Cancel</button>
            <button className="btn-danger" onClick={handleClearAll}>Delete everything</button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This permanently removes all {leads.length} stored leads. Consider exporting first — this cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

/** Render a cell, linking URLs and badging the source column. */
function CellValue({ header, value, source }: { header: string; value: string; source: Lead['source'] }) {
  if (!value) return <span className="text-slate-300 dark:text-slate-600">—</span>;

  if (header === 'Source') {
    const isMaps = source === 'google_maps';
    return (
      <span
        className={`badge gap-1 ${
          isMaps
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-200'
        }`}
      >
        {isMaps ? <MapPinIcon /> : <GlobeIcon />}
        {value}
      </span>
    );
  }

  if (/^https?:\/\//i.test(value) && !value.includes('; ')) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="block max-w-[220px] truncate text-brand-600 hover:underline dark:text-brand-400"
        title={value}
      >
        {value}
      </a>
    );
  }

  return (
    <span className="block max-w-[260px] truncate" title={value}>
      {value}
    </span>
  );
}
