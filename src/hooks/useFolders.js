import { useCallback, useEffect, useRef, useState } from 'react';
import { UNFILED, loadFolderRegistry, saveFolderRegistry, normalizeFolderName } from '../lib/folders';

/**
 * Folder bookkeeping for one kind of record (`'autos' | 'paths' | 'points'`).
 *
 * The hook owns the folder *list* — the part that has to survive an empty folder — while the
 * caller owns the records. Renaming or deleting a folder has to retag whatever was filed in
 * it, and only the caller knows how those records are stored, so it passes `onRetag`.
 *
 * @param kindKey  registry key for this list
 * @param onRetag  `(from, to)` — move every record in folder `from` to `to` (`UNFILED` on delete)
 */
export function useFolders(kindKey, onRetag) {
  const [registry, setRegistry] = useState(null);
  const registryRef = useRef(null);
  const retagRef = useRef(onRetag);
  const [collapsed, setCollapsed] = useState(() => new Set());

  useEffect(() => { retagRef.current = onRetag; }, [onRetag]);

  useEffect(() => {
    let cancelled = false;
    loadFolderRegistry().then(loaded => {
      if (cancelled) return;
      registryRef.current = loaded;
      setRegistry(loaded);
    });
    return () => { cancelled = true; };
  }, []);

  const write = useCallback((nextList) => {
    const next = { ...(registryRef.current ?? {}), [kindKey]: nextList };
    registryRef.current = next;
    setRegistry(next);
    saveFolderRegistry(next);
  }, [kindKey]);

  const list = registry?.[kindKey] ?? [];

  const createFolder = useCallback((rawName) => {
    const name = normalizeFolderName(rawName);
    if (!name) return;
    const current = registryRef.current?.[kindKey] ?? [];
    if (current.some(f => f.toLowerCase() === name.toLowerCase())) return;
    write([...current, name]);
  }, [kindKey, write]);

  const renameFolder = useCallback((from, rawTo) => {
    const to = normalizeFolderName(rawTo);
    if (!to || to === from) return;
    const current = registryRef.current?.[kindKey] ?? [];
    if (current.some(f => f.toLowerCase() === to.toLowerCase())) {
      window.alert(`A folder named "${to}" already exists.`);
      return;
    }
    write(current.map(f => (f === from ? to : f)));
    retagRef.current?.(from, to);
  }, [kindKey, write]);

  const deleteFolder = useCallback((name) => {
    const current = registryRef.current?.[kindKey] ?? [];
    write(current.filter(f => f !== name));
    retagRef.current?.(name, UNFILED);
  }, [kindKey, write]);

  const toggleCollapsed = useCallback((name) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  return { folderRegistry: list, collapsed, toggleCollapsed, createFolder, renameFolder, deleteFolder };
}
