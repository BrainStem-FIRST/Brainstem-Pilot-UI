// The Auto workspace's open-tab strip, persisted across reloads.
//
// Tabs are stored as `{ id, name }`, where `id` is an Auto's safe-name slug. Those slugs only
// mean anything inside one project folder, so the strip has to be emptied when a different
// project is opened — otherwise the tabs point at Autos that don't exist here.

const TABS_STORAGE_KEY = 'brainstem_auto_workspace_tabs';

export function readTabs() {
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function writeTabs(tabs) {
  try { localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs)); } catch { /* ignore */ }
}

export function clearTabs() {
  try { localStorage.removeItem(TABS_STORAGE_KEY); } catch { /* ignore */ }
}
