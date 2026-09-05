import { 
  getProjectDir, 
  loadPathsFromProject, 
  loadPointsFromProject,
  loadAutosFromProject,
  loadSettingsFromProject,
  loadSubsystemConfigFromProject,
  loadAppSettingsFromProject,
  savePathToProject,
  savePointToProject,
  saveAutoToProject,
  saveSettingsToProject,
  saveSubsystemConfigToProject,
  saveAppSettingsToProject,
  deletePathFromProject,
  deletePointFromProject,
  deleteAutoFromProject,
  safeNameFromString,
} from './projectFolder';
import { getDefaultFieldId } from './fieldConfig';
import { normalizeSavedPaths } from './pathWaypoints';

const APP_SETTINGS_STORAGE_KEY = 'brainstem_app_settings';
const LEAGUE_STORAGE_KEY = 'brainstem_league_preference';

const LOCAL_ENTITY_KEYS = {
  RobotSettings: 'brainstem_local_robot_settings',
  SubsystemConfig: 'brainstem_local_subsystem_config',
};

function readLocalEntity(entityType) {
  const key = LOCAL_ENTITY_KEYS[entityType];
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalEntity(entityType, data) {
  const key = LOCAL_ENTITY_KEYS[entityType];
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* ignore */ }
}

function makeRecord(data) {
  return {
    id: data.id || `gen-${Date.now()}`,
    created_date: new Date().toISOString(),
    ...data,
  };
}

function allocateUniqueName(baseName, existing = []) {
  const taken = new Set();
  for (const r of existing) {
    if (r.id) taken.add(String(r.id));
    const slug = safeNameFromString(r.name);
    if (slug) taken.add(slug);
  }
  let name = (baseName && String(baseName).trim()) || 'Untitled';
  let id = safeNameFromString(name);
  if (!id) {
    name = `Untitled_${Date.now()}`;
    id = safeNameFromString(name);
  }
  if (!taken.has(id)) return { name, id };
  const stem = name;
  let n = 1;
  while (taken.has(safeNameFromString(`${stem}_${n}`))) n++;
  name = `${stem}_${n}`;
  return { name, id: safeNameFromString(name) };
}

function getStoredLeaguePreference() {
  try {
    const raw = localStorage.getItem(LEAGUE_STORAGE_KEY);
    if (raw === 'ftc' || raw === 'frc') return raw;
  } catch { /* ignore */ }
  return 'frc';
}

function defaultAppSettings() {
  const league = getStoredLeaguePreference();
  return {
    projectType: league,
    selectedFieldId: getDefaultFieldId(league),
  };
}

const ENTITY_FILES = {
  RobotSettings: 'robot-settings.json',
  SubsystemConfig: 'subsystem-config.json',
  AppSettings: 'app_settings.json',
};

const fileModTimes = {};

function getFolder() {
  return getProjectDir();
}

async function readFromFolder(entityType) {
  const folder = getFolder();
  if (!folder) return null;
  const filename = ENTITY_FILES[entityType];
  if (!filename) return null;
  try {
    const fh = await folder.getFileHandle(filename, { create: false });
    const file = await fh.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function writeToFolder(entityType, data) {
  const folder = getFolder();
  if (!folder) return false;
  const filename = ENTITY_FILES[entityType];
  if (!filename) return false;
  try {
    const fh = await folder.getFileHandle(filename, { create: true });
    const writable = await fh.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    fileModTimes[entityType] = Date.now();
    return true;
  } catch (err) {
    console.error(`Failed to write ${filename}:`, err);
    return false;
  }
}

async function checkExternalChange(entityType) {
  const folder = getFolder();
  if (!folder) return false;
  const filename = ENTITY_FILES[entityType];
  if (!filename) return false;
  try {
    const fh = await folder.getFileHandle(filename, { create: false });
    const lastModTime = fileModTimes[entityType] || 0;
    const stat = await fh.getFile();
    return stat.lastModified > lastModTime + 1000;
  } catch {
    return false;
  }
}

function stripBuiltInFields(obj) {
  if (Array.isArray(obj)) return obj.map(stripBuiltInFields);
  if (obj !== null && typeof obj === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'created_date' || key === 'updated_date' || key === 'created_by') continue;
      cleaned[key] = stripBuiltInFields(value);
    }
    return cleaned;
  }
  return obj;
}

function stripIds(records) {
  return records.map(r => stripBuiltInFields(r));
}

function ensureIds(records) {
  return records.map((r, idx) => {
    // Use existing id, or derive a stable one from the name, or generate one
    const id = r.id || (r.name ? safeNameFromString(r.name) : `gen-${Date.now()}-${idx}`);
    return {
      id,
      created_date: r.created_date || new Date().toISOString(),
      ...r,
    };
  });
}

// ─── SavedAuto helpers ──────────────────────────────────────────────────────

// Re-export for UI modules
export { safeNameFromString };

async function readSavedAutos() {
  const paths = await loadPathsFromProject();
  if (!paths) return [];
  return ensureIds(normalizeSavedPaths(paths));
}

async function readPoints() {
  const data = await loadPointsFromProject();
  if (!data) return [];
  return ensureIds(data);
}

async function readAutos() {
  const data = await loadAutosFromProject();
  if (!data) return [];
  return ensureIds(data);
}

async function writeSavedAuto(id, updates) {
  const all = await readSavedAutos();
  const record = all.find(r => r.id === id);
  if (!record) return;
  const oldId = record.id;
  const newName = updates.name ?? record.name;
  const newId = updates.name ? safeNameFromString(newName) : oldId;
  const updated = { ...record, ...updates, id: newId };
  const previousName = updates.name && updates.name !== record.name ? record.name : null;
  await savePathToProject(updated, previousName);
}

// ───────────────────────────────────────────────────────────────────────────

export async function readEntity(entityType) {
  if (getProjectDir()) {
    if (entityType === 'SavedAuto') return await readSavedAutos();
    if (entityType === 'Point') {
      const data = await loadPointsFromProject();
      return data ? ensureIds(data) : [];
    }
    if (entityType === 'Auto') {
      const data = await loadAutosFromProject();
      return data ? ensureIds(data) : [];
    }
    if (entityType === 'RobotSettings') {
      const s = await loadSettingsFromProject();
      return s ? ensureIds([s]) : [];
    }
    if (entityType === 'SubsystemConfig') {
      const c = await loadSubsystemConfigFromProject();
      return c ? ensureIds([c]) : [];
    }
    if (entityType === 'AppSettings') {
      const s = await loadAppSettingsFromProject();
      return s ?? defaultAppSettings();
    }
  }

  if (!getProjectDir()) {
    if (entityType === 'AppSettings') {
      try {
        const raw = localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch { /* ignore */ }
      return defaultAppSettings();
    }
    if (entityType === 'RobotSettings') {
      const s = readLocalEntity(entityType);
      return s ? ensureIds([s]) : [];
    }
    if (entityType === 'SubsystemConfig') {
      const c = readLocalEntity(entityType);
      return c ? ensureIds([c]) : [];
    }
    return [];
  }
}

export async function createEntity(entityType, data) {
  const folder = getFolder();

  if (folder) {
    if (entityType === 'SavedAuto') {
      const { name, id } = allocateUniqueName(data.name, await readSavedAutos());
      const record = {
        created_date: new Date().toISOString(),
        ...data,
        name,
        id,
      };
      await savePathToProject(record, null);
      return record;
    }
    if (entityType === 'Point') {
      const { name, id } = allocateUniqueName(data.name, await readPoints());
      const record = {
        created_date: new Date().toISOString(),
        ...data,
        name,
        id,
      };
      await savePointToProject(record, null);
      return record;
    }
    if (entityType === 'Auto') {
      const { name, id } = allocateUniqueName(data.name, await readAutos());
      const record = {
        created_date: new Date().toISOString(),
        ...data,
        name,
        id,
      };
      await saveAutoToProject(record, null);
      return record;
    }
    const records = (await readFromFolder(entityType)) || [];
    const record = { ...data };
    records.push(record);
    await writeToFolder(entityType, stripIds(records));
    return {
      id: `gen-${Date.now()}`,
      created_date: new Date().toISOString(),
      ...data,
    };
  }
  if (entityType === 'Auto' || entityType === 'SavedAuto' || entityType === 'Point') {
    const { name, id } = allocateUniqueName(data.name || entityType, []);
    return makeRecord({ ...data, name, id });
  }
  return makeRecord(data);
}

export async function updateEntity(entityType, id, updates) {
  const folder = getFolder();

  // SavedAuto is always folder-only (IDs are safe-name slugs, not DB IDs)
  if (entityType === 'SavedAuto') {
    if (folder) await writeSavedAuto(id, updates);
    return;
  }

  if (entityType === 'Point' && folder) {
    const all = await readPoints();
    const record = all.find(r => r.id === id);
    if (!record) return;
    const oldId = record.id;
    const newName = updates.name ?? record.name;
    const newId = updates.name ? safeNameFromString(newName) : oldId;
    const updated = { ...record, ...updates, id: newId };
    const previousName = updates.name && updates.name !== record.name ? record.name : null;
    await savePointToProject(updated, previousName);
    return;
  }

  if (entityType === 'Auto' && folder) {
    const all = await readAutos();
    const record = all.find(r => r.id === id);
    if (!record) return;
    const oldId = record.id;
    const newName = updates.name ?? record.name;
    const newId = updates.name ? safeNameFromString(newName) : oldId;
    const updated = { ...record, ...updates, id: newId };
    const previousName = updates.name && updates.name !== record.name ? record.name : null;
    await saveAutoToProject(updated, previousName);
    return;
  }

  if (folder) {
    if (await checkExternalChange(entityType)) {
      const proceed = window.confirm(`${entityType} was modified externally. Overwrite with your changes?`);
      if (!proceed) return;
    }

    let records = (await readFromFolder(entityType)) || [];
    const withIds = ensureIds(records);
    const idx = withIds.findIndex(r => r.id === id);
    if (idx >= 0) {
      withIds[idx] = { ...withIds[idx], ...updates };
      await writeToFolder(entityType, stripIds(withIds));
    }
  }
}

export async function deleteEntity(entityType, id) {
  const folder = getFolder();

  if (folder) {
    if (entityType === 'SavedAuto') {
      const all = await readSavedAutos();
      const record = all.find(r => r.id === id);
      await deletePathFromProject(record?.name ?? id);
      return;
    }
    if (entityType === 'Point') {
      const all = await readPoints();
      const record = all.find(r => r.id === id);
      await deletePointFromProject(record?.name ?? id);
      return;
    }
    if (entityType === 'Auto') {
      const all = await readAutos();
      const record = all.find(r => r.id === id);
      await deleteAutoFromProject(record?.name ?? id);
      return;
    }

    let records = (await readFromFolder(entityType)) || [];
    const withIds = ensureIds(records);
    const filtered = withIds.filter(r => r.id !== id);
    await writeToFolder(entityType, stripIds(filtered));
  }
}

export async function writeEntity(entityType, data) {
  const folder = getFolder();

  if (entityType === 'AppSettings') {
    if (folder) {
      await saveAppSettingsToProject(data);
      fileModTimes[entityType] = Date.now();
    } else {
      localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(data));
    }
    return;
  }

  if (folder) {
    if (await checkExternalChange(entityType)) {
      const proceed = window.confirm(`${entityType} was modified externally. Overwrite with your changes?`);
      if (!proceed) return;
    }
    if (entityType === 'RobotSettings') await saveSettingsToProject(data);
    else if (entityType === 'SubsystemConfig') await saveSubsystemConfigToProject(data);
    else await writeToFolder(entityType, data);
  } else if (entityType === 'RobotSettings' || entityType === 'SubsystemConfig') {
    writeLocalEntity(entityType, data);
  }
}