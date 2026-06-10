import { useState } from 'react';
import type { Folder } from '@/types';
import { dotClass } from '@/utils/folders';
import { PlusIcon, CloseIcon } from './icons';

interface FolderSelectProps {
  folders: Folder[];
  /** Currently selected folder id, or undefined for "Unfiled". */
  value: string | undefined;
  onChange: (folderId: string | undefined) => void;
  /** Create a new folder, returning the created record. */
  onCreate: (name: string) => Promise<Folder>;
  label?: string;
}

/**
 * Folder chooser used on the Save Lead flow and the edit dialog. Lists existing
 * folders (plus "Unfiled") and supports creating a new folder inline.
 */
export function FolderSelect({ folders, value, onChange, onCreate, label = 'Save to folder' }: FolderSelectProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submitNew = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const folder = await onCreate(trimmed);
      onChange(folder.id);
      setName('');
      setCreating(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {!creating && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
            onClick={() => setCreating(true)}
          >
            <PlusIcon className="text-sm" /> New folder
          </button>
        )}
      </div>

      {creating ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            className="input"
            placeholder="Folder name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitNew();
              if (e.key === 'Escape') setCreating(false);
            }}
          />
          <button className="btn-primary !px-3" onClick={submitNew} disabled={busy || !name.trim()}>
            Add
          </button>
          <button className="btn-ghost !p-2" onClick={() => setCreating(false)} aria-label="Cancel">
            <CloseIcon />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className={`chip border transition ${
              value === undefined
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            Unfiled
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => onChange(folder.id)}
              className={`chip border transition ${
                value === folder.id
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${dotClass(folder.color)}`} />
              {folder.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
