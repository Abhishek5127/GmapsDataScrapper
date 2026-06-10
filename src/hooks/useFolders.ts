import { useCallback, useEffect, useState } from 'react';
import type { Folder } from '@/types';
import { getFolders, createFolder } from '@/storage/db';

/**
 * Folder state for extension pages (popup, dashboard). Loads folders directly
 * from IndexedDB (same origin) and exposes a memoized create helper. Cached in
 * component state so re-renders don't re-query the DB.
 */
export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await getFolders();
    setFolders(list);
    setLoading(false);
    return list;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (name: string, color?: string) => {
      const folder = await createFolder(name, color);
      await refresh();
      return folder;
    },
    [refresh],
  );

  return { folders, loading, refresh, create };
}
