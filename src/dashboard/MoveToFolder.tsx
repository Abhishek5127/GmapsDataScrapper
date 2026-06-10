import { useEffect, useRef, useState } from 'react';
import type { Folder } from '@/types';
import { dotClass } from '@/utils/folders';
import { MoveIcon, InboxIcon, ChevronIcon } from '@/components/icons';

interface MoveToFolderProps {
  folders: Folder[];
  /** Called with a folder id, or null to move to Unfiled. */
  onMove: (folderId: string | null) => void;
}

/**
 * Dropdown used in the selection action bar to move the selected leads into a
 * folder (or back to Unfiled). Closes on outside-click and Escape.
 */
export function MoveToFolder({ folders, onMove }: MoveToFolderProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (folderId: string | null) => {
    onMove(folderId);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button className="btn-secondary text-sm" onClick={() => setOpen((o) => !o)}>
        <MoveIcon /> Move to
        <ChevronIcon className={`text-xs transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 max-h-72 w-56 animate-scale-in overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-soft dark:border-slate-700 dark:bg-slate-900">
          <button
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => choose(null)}
          >
            <InboxIcon className="text-base" /> Unfiled
          </button>
          {folders.length > 0 && <div className="my-1 border-t border-slate-200/70 dark:border-slate-800" />}
          {folders.map((folder) => (
            <button
              key={folder.id}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => choose(folder.id)}
            >
              <span className={`block h-2.5 w-2.5 shrink-0 rounded-full ${dotClass(folder.color)}`} />
              <span className="truncate">{folder.name}</span>
            </button>
          ))}
          {folders.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-slate-400">No folders yet — create one in the sidebar.</p>
          )}
        </div>
      )}
    </div>
  );
}
