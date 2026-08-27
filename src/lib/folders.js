// Folders for the Auto list and the Path & Point Index.
//
// A folder is a *label*, not a directory: every record keeps its own flat JSON file under
// autos/, paths/ or points/, and just carries a `folder` name. Nesting real subdirectories
// would break name→filename lookup and the generated FTC opmodes, and would make moving a
// record a file move rather than a one-field edit.
//
// Because the label lives on the record, a folder with nothing in it has nowhere to live —
// so the *set* of folders is kept alongside it in app settings. That is what lets you make
// a folder first and fill it afterwards.

import { readEntity, writeEntity } from './dataService';

/** Records with no folder set collect here; it is a bucket, not a folder you can rename. */
export const UNFILED = '';
export const UNFILED_LABEL = 'Unfiled';

/** Registry keys — one list of folders per kind of record. */
export const FOLDER_KINDS = { auto: 'autos', path: 'paths', point: 'points' };

const EMPTY_REGISTRY = { autos: [], paths: [], points: [] };

/** Folder names are plain labels: no slashes (they read as nesting) and no stray whitespace. */
export function normalizeFolderName(name) {
  return (name ?? '').replace(/[/\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function folderOf(record) {
  return normalizeFolderName(record?.folder);
}

/**
 * Every folder to show for one kind: the ones saved in the registry plus any a record still
 * claims (so a folder never disappears just because the registry is out of date), sorted
 * case-insensitively. `UNFILED` is not included — it is rendered separately.
 */
export function folderNames(registryList, records) {
  const seen = new Map();
  const add = (name) => {
    const clean = normalizeFolderName(name);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, clean);
  };
  (registryList ?? []).forEach(add);
  (records ?? []).forEach(r => add(r.folder));
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Records bucketed by folder, in display order: named folders alphabetically, then Unfiled
 * last. Empty folders are kept so you can see (and drop things into) one you just made.
 */
export function groupByFolder(records, registryList) {
  const names = folderNames(registryList, records);
  const byKey = new Map(names.map(n => [n.toLowerCase(), { name: n, records: [] }]));
  const unfiled = { name: UNFILED, label: UNFILED_LABEL, records: [] };

  for (const rec of records ?? []) {
    const folder = folderOf(rec);
    const group = folder ? byKey.get(folder.toLowerCase()) : null;
    (group ?? unfiled).records.push(rec);
  }

  const groups = names.map(n => byKey.get(n.toLowerCase()));
  // Only show the Unfiled bucket when there is either something in it or nowhere else to look.
  if (unfiled.records.length > 0 || groups.length === 0) groups.push(unfiled);
  return groups;
}

// ── Registry persistence (app settings) ────────────────────────────────────────

export async function loadFolderRegistry() {
  const settings = await readEntity('AppSettings');
  const stored = settings?.folders ?? {};
  return {
    autos: Array.isArray(stored.autos) ? stored.autos : [],
    paths: Array.isArray(stored.paths) ? stored.paths : [],
    points: Array.isArray(stored.points) ? stored.points : [],
  };
}

/** Read-modify-write: app settings hold more than folders, so never replace it wholesale. */
export async function saveFolderRegistry(registry) {
  const settings = (await readEntity('AppSettings')) ?? {};
  await writeEntity('AppSettings', { ...settings, folders: { ...EMPTY_REGISTRY, ...registry } });
}
