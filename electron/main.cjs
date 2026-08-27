// Desktop shell for the BrainSTEM Pilot UI.
//
// The same Vite bundle powers the GitHub Pages site and this app. The only
// differences are baked in at build time (see vite.config.js): the desktop
// build uses a relative base and a hash router, so every asset and route
// resolves against the loaded index.html rather than a server path.

const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('node:path');

const isDev = !app.isPackaged;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#10131a', // matches --background, so no white flash on load
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Anything that wants a new window (target=_blank, window.open) is an
  // external link as far as the app is concerned — hand it to the OS browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:$/.test(new URL(url).protocol)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Same for in-page navigations away from the app's own document.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url);
    const current = new URL(mainWindow.webContents.getURL());
    if (target.origin !== current.origin || target.pathname !== current.pathname) {
      event.preventDefault();
      if (/^https?:$/.test(target.protocol)) shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'BrainSTEM Pilot on the Web',
          click: () => shell.openExternal('https://brainstem-first.github.io/Brainstem-Pilot-UI/'),
        },
        {
          label: 'Report an Issue',
          click: () =>
            shell.openExternal('https://github.com/BrainStem-FIRST/Brainstem-Pilot-UI/issues'),
        },
        { type: 'separator' },
        {
          label: `Version ${app.getVersion()}`,
          click: () => {
            dialog.showMessageBox(mainWindow ?? undefined, {
              type: 'info',
              title: 'BrainSTEM Pilot',
              message: `BrainSTEM Pilot ${app.getVersion()}`,
              detail: `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// One instance only: a second launch focuses the window that already exists.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    // The sandboxed preload has no access to app.getVersion(); the renderer it
    // spawns inherits this env, which is where preload.cjs reads it from.
    process.env.BRAINSTEM_APP_VERSION = app.getVersion();
    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
