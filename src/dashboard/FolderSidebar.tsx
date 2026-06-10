import { useState } from 'react';
import type { Folder } from '@/types';
import { dotClass } from '@/utils/folders';
import {
  FolderIcon,
  GridIcon,
  InboxIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  CloseIcon,
} from '@/components/icons';

/** Special filter values alongside a concrete folder id. */
export type FolderFilter = 'all' | 'unfiled' | string;

interface FolderSidebarProps {
  folders: Folder[];
  /** Currently active filter. */
  value: FolderFilter;
  onChange: (value: FolderFilter) => void;
  /** Lead counts keyed by folder id, plus 'all' and 'unfiled' totals. */
  counts: Record<string, number>;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/** A single selectable row (All / Unfiled / a folder). */
function Row({
  active,
  onClick,
  icon,
  label,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: React.ReactNode;
  count: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
        active
          ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
      }`}
    >
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="shrink-0 text-base">{icon}</span>
        <span className="truncate">{label}</span>
      </button>
      <span
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
          active ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/25 dark:text-brand-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        }`}
      >
        {count}
      </span>
      {children}
    </div>
  );
}

/**
 * Dashboard folder navigation. Lists All / Unfiled / every folder (with lead
 * counts), filters the table on click, and supports inline create, rename and
 * delete. Deleting a folder moves its leads to Unfiled (handled in the DB).
 */
export function FolderSidebar({ folders, value, onChange, counts, onCreate, onRename, onDelete }: FolderSidebarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const submitNew = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await onCreate(name);
      setNewName('');
      setCreating(false);
    } finally {
      setBusy(false);
    }
  };

  const submitRename = async (id: string) => {
    const name = renameValue.trim();
    if (!name) return setRenamingId(null);
    setBusy(true);
    try {
      await onRename(id, name);
      setRenamingId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="card w-full shrink-0 p-3 lg:w-60">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Folders</h2>
        {!creating && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
            onClick={() => setCreating(true)}
          >
            <PlusIcon className="text-sm" /> New
          </button>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <Row
          active={value === 'all'}
          onClick={() => onChange('all')}
          icon={<GridIcon />}
          label="All leads"
          count={counts.all ?? 0}
        />
        <Row
          active={value === 'unfiled'}
          onClick={() => onChange('unfiled')}
          icon={<InboxIcon />}
          label="Unfiled"
          count={counts.unfiled ?? 0}
        />

        {folders.length > 0 && <div className="my-1.5 border-t border-slate-200/70 dark:border-slate-800" />}

        {folders.map((folder) => {
          const active = value === folder.id;
          if (renamingId === folder.id) {
            return (
              <div key={folder.id} className="flex items-center gap-1.5 px-1.5 py-1">
                <input
                  autoFocus
                  className="input !py-1 text-sm"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitRename(folder.id);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                />
                <button
                  className="btn-ghost !p-1.5"
                  onClick={() => setRenamingId(null)}
                  aria-label="Cancel rename"
                >
                  <CloseIcon />
                </button>
              </div>
            );
          }
          if (confirmId === folder.id) {
            return (
              <div
                key={folder.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs dark:bg-red-950/40"
              >
                <span className="text-red-700 dark:text-red-300">Delete “{folder.name}”?</span>
                <div className="flex shrink-0 gap-1">
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setConfirmId(null)}>
                    No
                  </button>
                  <button
                    className="btn-danger !px-2 !py-1 text-xs"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await onDelete(folder.id);
                        setConfirmId(null);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Yes
                  </button>
                </div>
              </div>
            );
          }
          return (
            <Row
              key={folder.id}
              active={active}
              onClick={() => onChange(folder.id)}
              icon={<span className={`block h-2.5 w-2.5 rounded-full ${dotClass(folder.color)}`} />}
              label={folder.name}
              count={counts[folder.id] ?? 0}
            >
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                <button
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  title="Rename folder"
                  onClick={() => {
                    setRenameValue(folder.name);
                    setRenamingId(folder.id);
                  }}
                >
                  <EditIcon className="text-xs" />
                </button>
                <button
                  className="rounded-md p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40"
                  title="Delete folder"
                  onClick={() => setConfirmId(folder.id)}
                >
                  <TrashIcon className="text-xs" />
                </button>
              </div>
            </Row>
          );
        })}

        {creating && (
          <div className="mt-1 flex items-center gap-1.5 px-1.5 py-1">
            <FolderIcon className="shrink-0 text-slate-400" />
            <input
              autoFocus
              className="input !py-1 text-sm"
              placeholder="Folder name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNew();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setNewName('');
                }
              }}
            />
            <button className="btn-primary !px-2.5 !py-1 text-xs" onClick={submitNew} disabled={busy || !newName.trim()}>
              Add
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
