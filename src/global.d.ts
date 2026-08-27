/** File System Access API (Chrome/Edge) — not in all DOM lib versions. */
interface FileSystemHandle {
  readonly kind: 'file' | 'directory';
  readonly name: string;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: 'directory';
}

interface Window {
  showDirectoryPicker?(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
}

/** Replaced at build time by Vite's `define` — true only in the desktop (Electron) build. */
declare const __DESKTOP_BUILD__: boolean;

interface Window {
  /** Present only inside the Electron shell (see electron/preload.cjs). */
  brainstemDesktop?: {
    isDesktop: true;
    version: string | null;
    platform: string;
  };
}

/** Vite's `import.meta.env`. Declared here because jsconfig sets `"types": []`. */
interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
