// Shared helpers for the Path/Point library: reference resolution, cross-Auto
// propagation of renames/deletes, and folder persistence driven by a diff between
// two in-memory snapshots (also used to write back undo/redo states).

import {
  savePathToProject,
  savePointToProject,
  saveAutoToProject,
  deletePathFromProject,
  deletePointFromProject,
  deleteAutoFromProject,
  safeNameFromString,
} from './projectFolder';
import { readEntity } from './dataService';
import { normalizeSavedPath } from './pathWaypoints';

export function safeId(name) {
  return safeNameFromString(name);
}

/**
 * Slot references store an id that is derived from the record name, and older files
 * used a stricter slug, so a reference matches on the id or on either slug form.
 */
export function matchesRef(record, targetId) {
  if (!record || targetId == null) return false;
  const target = String(targetId);
  const id = String(record._id ?? record.id ?? '');
  const name = (record.name ?? '').trim();
  return id === target
    || safeNameFromString(name) === target
    || name.replace(/[^a-zA-Z0-9_\-]/g, '_') === target;
}

export function findPath(paths, id) {
  return (paths ?? []).find(p => matchesRef(p, id)) ?? null;
}

export function findPoint(points, id) {
  return (points ?? []).find(p => matchesRef(p, id)) ?? null;
}

function slotRefId(slot) {
  return slot.type === 'path' ? slot.pathId : slot.type === 'point' ? slot.pointId : null;
}

function slotReferences(slot, kind, record) {
  if (slot.type !== kind) return false;
  return matchesRef(record, slotRefId(slot));
}

export async function loadLibrary() {
  const [paths, points, autos] = await Promise.all([
    readEntity('SavedAuto'),
    readEntity('Point'),
    readEntity('Auto'),
  ]);
  return {
    paths: Array.isArray(paths) ? paths.map(normalizeSavedPath) : [],
    points: Array.isArray(points) ? points : [],
    autos: Array.isArray(autos) ? autos : [],
  };
}

export function autosUsing(autos, kind, record) {
  return (autos ?? []).filter(a => (a.sequence ?? []).some(slot => slotReferences(slot, kind, record)));
}

/** Point every slot that referenced `record` at its new (name-derived) id. */
export function retargetAutosForRename(autos, kind, record, newName) {
  const newId = safeNameFromString(newName);
  const key = kind === 'path' ? 'pathId' : 'pointId';
  return (autos ?? []).map(auto => {
    let changed = false;
    const sequence = (auto.sequence ?? []).map(slot => {
      if (!slotReferences(slot, kind, record)) return slot;
      changed = true;
      return { ...slot, [key]: newId };
    });
    return changed ? { ...auto, sequence } : auto;
  });
}

/** Drop every slot that referenced `record`; neighbouring slots re-chain on their own. */
export function removeReferencesFromAutos(autos, kind, record) {
  return (autos ?? []).map(auto => {
    const sequence = (auto.sequence ?? []).filter(slot => !slotReferences(slot, kind, record));
    return sequence.length === (auto.sequence ?? []).length ? auto : { ...auto, sequence };
  });
}

function isSameRecord(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(stripVolatile(a)) === JSON.stringify(stripVolatile(b));
}

function stripVolatile(record) {
  const { updated_date, created_date, ...rest } = record ?? {};
  return rest;
}

async function persistDiff(prev, next, save, remove) {
  const prevById = new Map((prev ?? []).map(r => [String(r.id), r]));
  const nextById = new Map((next ?? []).map(r => [String(r.id), r]));
  for (const [id, record] of nextById) {
    if (!isSameRecord(prevById.get(id), record)) await save(record);
  }
  for (const [id, record] of prevById) {
    if (!nextById.has(id)) await remove(record);
  }
}

export function persistPathsDiff(prev, next) {
  return persistDiff(prev, next, r => savePathToProject(r, null), r => deletePathFromProject(r.name ?? r.id));
}

export function persistPointsDiff(prev, next) {
  return persistDiff(prev, next, r => savePointToProject(r, null), r => deletePointFromProject(r.name ?? r.id));
}

export function persistAutosDiff(prev, next) {
  return persistDiff(prev, next, r => saveAutoToProject(r, null), r => deleteAutoFromProject(r.name ?? r.id));
}

export async function persistLibraryDiff(prev, next) {
  await persistPathsDiff(prev.paths, next.paths);
  await persistPointsDiff(prev.points, next.points);
  await persistAutosDiff(prev.autos, next.autos);
}

/** Rename a record and keep every Auto that referenced it pointing at the new id. */
export function applyRename(library, kind, record, newName) {
  const trimmed = (newName ?? '').trim();
  if (!trimmed) return library;
  const newId = safeNameFromString(trimmed);
  const listKey = kind === 'path' ? 'paths' : 'points';
  const list = library[listKey].map(r => (r.id === record.id ? { ...r, id: newId, name: trimmed } : r));
  return {
    ...library,
    [listKey]: list,
    autos: retargetAutosForRename(library.autos, kind, record, trimmed),
  };
}

export function applyDelete(library, kind, record) {
  const listKey = kind === 'path' ? 'paths' : 'points';
  return {
    ...library,
    [listKey]: library[listKey].filter(r => r.id !== record.id),
    autos: removeReferencesFromAutos(library.autos, kind, record),
  };
}
