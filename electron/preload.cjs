// The UI is entirely client-side (localStorage + the File System Access API),
// so the renderer needs no privileged bridge. This exposes just enough for the
// app to know it is running in the desktop shell, and nothing else.

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('brainstemDesktop', {
  isDesktop: true,
  version: process.env.BRAINSTEM_APP_VERSION ?? null,
  platform: process.platform,
});
