import {
  getProjectDir,
  setProjectDir,
  initializeProjectFolder,
} from './projectFolder';
import { clearTabs } from './workspaceTabs';

/**
 * Is `handle` the project that is already open? Prefers `isSameEntry` (exact, even for two
 * folders with the same name); falls back to the last-opened folder name on a cold start,
 * where there is no previous handle to compare against.
 */
export async function isSameProject(handle) {
  const previous = getProjectDir();
  if (previous) {
    try { return await previous.isSameEntry(handle); } catch { return false; }
  }
  try { return localStorage.getItem('lastProjectFolder') === handle.name; } catch { return false; }
}

/**
 * Directory picker + bind. Returns the handle, or null if the user cancelled / the browser
 * cannot pick a folder. Open Auto tabs are cleared only when the folder actually changes.
 */
export async function pickAndBindProject({ projectType, loadLeagueFromProject }) {
  if (!window.showDirectoryPicker) {
    alert('Your browser does not support the File System Access API. Please use Chrome or Edge, or install the desktop app.');
    return null;
  }
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (!(await isSameProject(dirHandle))) clearTabs();
    setProjectDir(dirHandle);
    await initializeProjectFolder(projectType);
    await loadLeagueFromProject();
    try {
      localStorage.setItem('lastProjectFolder', dirHandle.name);
    } catch {
      // localStorage unavailable; that's ok
    }
    return dirHandle;
  } catch (err) {
    if (err.name === 'SecurityError') {
      // Silently ignore — only works when the app is opened in a standalone browser tab
      return null;
    }
    if (err.name !== 'AbortError') throw err;
    return null;
  }
}
