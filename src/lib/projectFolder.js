// Project folder management using File System Access API
// Stores a directory handle in memory (persists for the browser session)

import { getDefaultFieldId } from './fieldConfig.js';

const DEFAULT_FRC_ROBOT = {
  width: 0.76,
  length: 0.76,
  maxVel: 3.0,
  maxAccel: 2.5,
  unit: 'm',
  subsystems: [],
};

const DEFAULT_FTC_ROBOT = {
  width: 18,
  length: 18,
  maxVel: 60,
  maxAccel: 40,
  unit: 'in',
  subsystems: [],
};
import {
  formatWaypointForExport, normalizeSavedPaths, getPathExportMetadata, resolveConstraints,
} from './pathWaypoints.js';
import {
  syncFtcOpmodeAuto, deleteFtcOpmodeAuto, syncAllFtcOpmodeAutos, purgeFtcOpmodesWhenNotFtc,
} from './ftcOpmodeGenerator.js';

let _dirHandle = null;

/**
 * Version of the on-disk JSON format. Bump when a shape change would break a reader; the
 * robot-side parser can then refuse a file it does not understand instead of silently
 * misreading it.
 */
export const PILOT_SCHEMA_VERSION = 2;

/** Project league, for stamping units onto exports. Falls back to FRC when unreadable. */
async function projectLeague() {
  const settings = await loadAppSettingsFromProject();
  return settings?.projectType === 'ftc' ? 'ftc' : 'frc';
}

/**
 * Every record the app writes carries the same envelope: what format it is, what units its
 * numbers are in, and when it was last written. Previously only paths declared units, so a
 * reader of points/ or autos/ had to guess inches vs metres — and `updated_date` only moved
 * on some of the write paths, which made it worse than absent.
 */
async function stampRecord(record, league) {
  const resolved = league ?? (await projectLeague());
  return {
    schemaVersion: PILOT_SCHEMA_VERSION,
    ...record,
    ...getPathExportMetadata(resolved),
    updated_date: new Date().toISOString(),
  };
}

/** File/id slug: spaces become underscores; display names keep spaces. */
export function safeNameFromString(str) {
  return (str ?? '').trim().replace(/\s+/g, '_');
}

export function getProjectDir() { return _dirHandle; }
export function setProjectDir(handle) { _dirHandle = handle; }
export function hasProjectDir() { return _dirHandle !== null; }

async function getOrCreateSubdir(name) {
  return _dirHandle.getDirectoryHandle(name, { create: true });
}

async function deleteFileIfExists(dir, filename) {
  try { await dir.removeEntry(filename); } catch (_) { /* ignore */ }
}

export async function savePathToProject(pathObj, previousName, projectType = 'frc') {
  if (!_dirHandle) return;
  // Guard: name must exist and be non-empty, otherwise skip to avoid creating path.path.json
  if (!pathObj.name || pathObj.name.trim() === '') return;
  const dir = await getOrCreateSubdir('paths');
  const safeName = safeNameFromString(pathObj.name);
  if (previousName && previousName !== pathObj.name) {
    const oldSafe = safeNameFromString(previousName);
    await deleteFileIfExists(dir, `${oldSafe}.path.json`);
  }

  const fmt4 = v => parseFloat((v ?? 0).toFixed(4));
  const wps = pathObj.waypoints ?? [];
  const appSettings = await loadAppSettingsFromProject();
  const league = appSettings?.projectType ?? projectType;
  // `waypointParams` used to mirror `wp.params` by index for external tools. Two copies of
  // the same data can disagree, and nothing reads it, so only the inline copy is written now.
  const { waypointParams, ...rest } = pathObj;
  const exportObj = await stampRecord({
    ...rest,
    constraints: resolveConstraints(pathObj.constraints, league),
    waypoints: wps.map((w, i) => formatWaypointForExport(w, i, wps.length, fmt4)),
  }, league);

  const fh = await dir.getFileHandle(`${safeName}.path.json`, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(exportObj, null, 2));
  await writable.close();
}

async function getSubdirIfExists(name) {
  if (!_dirHandle) return null;
  try {
    return await _dirHandle.getDirectoryHandle(name, { create: false });
  } catch {
    return null;
  }
}

export async function deletePathFromProject(name) {
  if (!_dirHandle) return;
  try {
    const dir = await getSubdirIfExists('paths');
    if (!dir) return;
    const safeName = safeNameFromString(name);
    if (!safeName) return;
    await deleteFileIfExists(dir, `${safeName}.path.json`);
  } catch (_) { /* ignore */ }
}

export async function deleteSkeletonFromProject(name) {
  if (!_dirHandle) return;
  try {
    const dir = await getSubdirIfExists('skeletons');
    if (!dir) return;
    const safeName = safeNameFromString(name);
    if (!safeName) return;
    await deleteFileIfExists(dir, `${safeName}.skeleton.json`);
  } catch (_) { /* ignore */ }
}

export async function deleteVariantFromProject(name) {
  if (!_dirHandle) return;
  try {
    const dir = await getSubdirIfExists('variants');
    if (!dir) return;
    const safeName = safeNameFromString(name);
    if (!safeName) return;
    await deleteFileIfExists(dir, `${safeName}.variant.json`);
    await deleteFtcOpmodeAuto(name);
  } catch (_) { /* ignore */ }
}

export async function saveSkeletonToProject(skeletonObj, previousName) {
  if (!_dirHandle) return;
  if (!skeletonObj.name || skeletonObj.name.trim() === '') return;
  const dir = await getOrCreateSubdir('skeletons');
  const safeName = safeNameFromString(skeletonObj.name);
  if (previousName && previousName !== skeletonObj.name) {
    const oldSafe = safeNameFromString(previousName);
    await deleteFileIfExists(dir, `${oldSafe}.skeleton.json`);
  }
  const fh = await dir.getFileHandle(`${safeName}.skeleton.json`, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(skeletonObj, null, 2));
  await writable.close();
}

export async function saveVariantToProject(variantObj, previousName) {
  if (!_dirHandle) return;
  if (!variantObj.name || variantObj.name.trim() === '') return;
  const dir = await getOrCreateSubdir('variants');
  const safeName = safeNameFromString(variantObj.name);
  if (previousName && previousName !== variantObj.name) {
    const oldSafe = safeNameFromString(previousName);
    await deleteFileIfExists(dir, `${oldSafe}.variant.json`);
  }
  const fh = await dir.getFileHandle(`${safeName}.variant.json`, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(variantObj, null, 2));
  await writable.close();
  await syncFtcOpmodeAuto(variantObj, previousName);
}

// ─── Point library (shared, named field positions) ────────────────────────

export async function savePointToProject(pointObj, previousName) {
  if (!_dirHandle) return;
  if (!pointObj.name || pointObj.name.trim() === '') return;
  const dir = await getOrCreateSubdir('points');
  const safeName = safeNameFromString(pointObj.name);
  if (previousName && previousName !== pointObj.name) {
    const oldSafe = safeNameFromString(previousName);
    await deleteFileIfExists(dir, `${oldSafe}.point.json`);
  }
  const fh = await dir.getFileHandle(`${safeName}.point.json`, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(await stampRecord(pointObj), null, 2));
  await writable.close();
}

export async function loadPointsFromProject() {
  if (!_dirHandle) return null;
  try {
    const dir = await _dirHandle.getDirectoryHandle('points', { create: false });
    const points = [];
    for await (const entry of dir.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.point.json')) {
        const fh = await dir.getFileHandle(entry.name);
        const file = await fh.getFile();
        const text = await file.text();
        points.push(JSON.parse(text));
      }
    }
    return points.length > 0 ? points : null;
  } catch {
    return null;
  }
}

export async function deletePointFromProject(name) {
  if (!_dirHandle) return;
  try {
    const dir = await getSubdirIfExists('points');
    if (!dir) return;
    const safeName = safeNameFromString(name);
    if (!safeName) return;
    await deleteFileIfExists(dir, `${safeName}.point.json`);
  } catch (_) { /* ignore */ }
}

// ─── Auto (unified, directly-runnable sequence — replaces Skeleton+Variant) ─

export async function saveAutoToProject(autoObj, previousName) {
  if (!_dirHandle) return;
  if (!autoObj.name || autoObj.name.trim() === '') return;
  const dir = await getOrCreateSubdir('autos');
  const safeName = safeNameFromString(autoObj.name);
  if (previousName && previousName !== autoObj.name) {
    const oldSafe = safeNameFromString(previousName);
    await deleteFileIfExists(dir, `${oldSafe}.auto.json`);
  }
  const fh = await dir.getFileHandle(`${safeName}.auto.json`, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(await stampRecord(autoObj), null, 2));
  await writable.close();
  await syncFtcOpmodeAuto(autoObj, previousName);
}

export async function loadAutosFromProject() {
  if (!_dirHandle) return null;
  try {
    const dir = await _dirHandle.getDirectoryHandle('autos', { create: false });
    const autos = [];
    for await (const entry of dir.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.auto.json')) {
        const fh = await dir.getFileHandle(entry.name);
        const file = await fh.getFile();
        const text = await file.text();
        autos.push(JSON.parse(text));
      }
    }
    return autos.length > 0 ? autos : null;
  } catch {
    return null;
  }
}

export async function deleteAutoFromProject(name) {
  if (!_dirHandle) return;
  try {
    const dir = await getSubdirIfExists('autos');
    if (!dir) return;
    const safeName = safeNameFromString(name);
    if (!safeName) return;
    await deleteFileIfExists(dir, `${safeName}.auto.json`);
    await deleteFtcOpmodeAuto(name);
  } catch (_) { /* ignore */ }
}

/** Flatten a legacy (SkeletonAuto commands + ChildAuto overrides) pair into a unified Auto sequence. */
function migrateSkeletonVariantToSequence(skeleton, variant) {
  const overrideMap = Object.fromEntries((variant.commandOverrides ?? []).map(o => [o.cmdId, o]));
  return (skeleton?.commands ?? []).map(cmd => {
    const override = overrideMap[cmd.id] ?? {};
    const base = { id: cmd.id, type: cmd.type, skip: override.skip ?? false };
    if (cmd.type === 'path') return { ...base, pathId: override.pathId ?? cmd.pathId ?? null };
    if (cmd.type === 'wait') return { ...base, duration: override.waitDuration ?? cmd.defaultWait ?? 0 };
    if (cmd.type === 'subsystem') return { ...base, subsystemName: cmd.subsystemName, commandName: cmd.commandName };
    if (cmd.type === 'parallel') return { ...base, parallelSubs: cmd.parallelSubs ?? [] };
    return base;
  });
}

/**
 * One-time lazy migration: legacy Skeleton+Variant pairs are merged into unified Autos the
 * first time a project with old-format data is opened. Original skeleton/variant files are
 * left on disk untouched (no longer read by the app) rather than deleted.
 */
export async function migrateLegacyAutosIfNeeded() {
  if (!_dirHandle) return;
  const skeletons = await loadSkeletonsFromProject();
  const variants = await loadVariantsFromProject();
  if (!skeletons?.length && !variants?.length) return;

  const existingAutos = (await loadAutosFromProject()) ?? [];
  const existingNames = new Set(existingAutos.map(a => safeNameFromString(a.name)));

  for (const variant of (variants ?? [])) {
    const safeName = safeNameFromString(variant.name);
    if (existingNames.has(safeName)) continue;
    const skeleton = (skeletons ?? []).find(s =>
      s.id === variant.skeletonId || safeNameFromString(s.name) === safeNameFromString(variant.skeletonId));
    const sequence = migrateSkeletonVariantToSequence(skeleton, variant);
    await saveAutoToProject({ id: safeName, name: variant.name, sequence }, null);
    existingNames.add(safeName);
  }

  await retireLegacyAutoFolders();
}

/**
 * Move consumed skeleton/variant files into `legacy/` once every Auto they describe exists
 * under `autos/`.
 *
 * They used to be left in place forever: inert, committed to git, drifting further from the
 * real sequence with every edit, and indistinguishable from live data to anyone reading the
 * folder. Moved rather than deleted, because this runs without asking and the originals are
 * the only copy of anything the migration got wrong.
 */
async function retireLegacyAutoFolders() {
  if (!_dirHandle) return;
  const autos = (await loadAutosFromProject()) ?? [];
  const migratedNames = new Set(autos.map(a => safeNameFromString(a.name)));
  const variants = (await loadVariantsFromProject()) ?? [];

  // Only retire once every variant has a matching Auto — a partial migration keeps its source.
  const allMigrated = variants.every(v => migratedNames.has(safeNameFromString(v.name)));
  if (!allMigrated) return;

  const legacyRoot = await getOrCreateSubdir('legacy');
  for (const folder of ['variants', 'skeletons']) {
    const dir = await getSubdirIfExists(folder);
    if (!dir) continue;
    const target = await legacyRoot.getDirectoryHandle(folder, { create: true });
    for await (const entry of dir.values()) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
      const text = await (await entry.getFile()).text();
      const fh = await target.getFileHandle(entry.name, { create: true });
      const writable = await fh.createWritable();
      await writable.write(text);
      await writable.close();
      await deleteFileIfExists(dir, entry.name);
    }
    try { await _dirHandle.removeEntry(folder, { recursive: true }); } catch { /* not empty / gone */ }
  }

  const readme = await legacyRoot.getFileHandle('README.md', { create: true });
  const rw = await readme.createWritable();
  await rw.write([
    '# Legacy auto format',
    '',
    'These skeleton/variant files were the old way an Auto was stored: a shared skeleton of',
    'commands plus a per-variant list of overrides. They have been migrated into `autos/`,',
    'where each Auto is one self-contained file, and nothing reads them any more.',
    '',
    'Kept only so a bad migration can be checked against the original. Safe to delete once',
    'the autos in `autos/` look right.',
    '',
  ].join('\n'));
  await rw.close();
}

export async function saveSettingsToProject(settingsObj) {
  if (!_dirHandle) return;
  const fh = await _dirHandle.getFileHandle('robot_settings.json', { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(settingsObj, null, 2));
  await writable.close();
}

export async function saveSubsystemConfigToProject(configObj) {
  if (!_dirHandle) return;
  const fh = await _dirHandle.getFileHandle('subsystem_config.json', { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(configObj, null, 2));
  await writable.close();
}

export async function saveAppSettingsToProject(settingsObj) {
  if (!_dirHandle) return;
  const fh = await _dirHandle.getFileHandle('app_settings.json', { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(settingsObj, null, 2));
  await writable.close();
}

// FIX: getFileHandle returns a FileSystemFileHandle — must call .getFile() then .text()
export async function loadPathsFromProject() {
  if (!_dirHandle) return null;
  try {
    const dir = await _dirHandle.getDirectoryHandle('paths', { create: false });
    const paths = [];
    for await (const entry of dir.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.path.json')) {
        const fh = await dir.getFileHandle(entry.name);
        const file = await fh.getFile();
        const text = await file.text();
        paths.push(JSON.parse(text));
      }
    }
    return paths.length > 0 ? paths : null;
  } catch {
    return null;
  }
}

export async function loadSkeletonsFromProject() {
  if (!_dirHandle) return null;
  try {
    const dir = await _dirHandle.getDirectoryHandle('skeletons', { create: false });
    const skeletons = [];
    for await (const entry of dir.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.skeleton.json')) {
        const fh = await dir.getFileHandle(entry.name);
        const file = await fh.getFile();
        const text = await file.text();
        skeletons.push(JSON.parse(text));
      }
    }
    return skeletons.length > 0 ? skeletons : null;
  } catch {
    return null;
  }
}

export async function loadVariantsFromProject() {
  if (!_dirHandle) return null;
  try {
    const dir = await _dirHandle.getDirectoryHandle('variants', { create: false });
    const variants = [];
    for await (const entry of dir.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.variant.json')) {
        const fh = await dir.getFileHandle(entry.name);
        const file = await fh.getFile();
        const text = await file.text();
        variants.push(JSON.parse(text));
      }
    }
    return variants.length > 0 ? variants : null;
  } catch {
    return null;
  }
}

export async function loadSettingsFromProject() {
  if (!_dirHandle) return null;
  try {
    const fh = await _dirHandle.getFileHandle('robot_settings.json', { create: false });
    const file = await fh.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function loadSubsystemConfigFromProject() {
  if (!_dirHandle) return null;
  try {
    const fh = await _dirHandle.getFileHandle('subsystem_config.json', { create: false });
    const file = await fh.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function loadAppSettingsFromProject() {
  if (!_dirHandle) return null;
  try {
    const fh = await _dirHandle.getFileHandle('app_settings.json', { create: false });
    const file = await fh.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function initializeProjectFolder(projectType = 'frc') {
  if (!_dirHandle) return;
  const existingAppSettings = await loadAppSettingsFromProject();
  const league = existingAppSettings?.projectType === 'ftc' || existingAppSettings?.projectType === 'frc'
    ? existingAppSettings.projectType
    : (projectType === 'ftc' ? 'ftc' : 'frc');
  const settingsExists = await loadSettingsFromProject();
  if (!settingsExists) {
    await saveSettingsToProject(league === 'ftc' ? DEFAULT_FTC_ROBOT : DEFAULT_FRC_ROBOT);
  }
  const configExists = await loadSubsystemConfigFromProject();
  if (!configExists) {
    await saveSubsystemConfigToProject({ subsystems: [] });
  }
  const appSettingsExists = await loadAppSettingsFromProject();
  if (!appSettingsExists) {
    await saveAppSettingsToProject({
      projectType: league,
      selectedFieldId: getDefaultFieldId(league),
    });
  }
  await migrateLegacyAutosIfNeeded();
  if (league === 'ftc') {
    await syncAllFtcOpmodeAutos();
  } else {
    await purgeFtcOpmodesWhenNotFtc();
  }
}