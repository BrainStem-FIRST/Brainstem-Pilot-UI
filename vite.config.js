import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Wait until file changes stop, then trigger a single full page reload.
 * Prevents a refresh storm when many files are saved in quick succession.
 */
function debouncedReloadPlugin(quietMs = 800) {
  let timer = null;

  return {
    name: 'debounced-reload',
    handleHotUpdate({ server }) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        server.ws.send({ type: 'full-reload' });
      }, quietMs);
      return [];
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    watch: {
      ignored: ['**/.cursor/**'],
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    },
  },
  plugins: [
    debouncedReloadPlugin(),
    react(),
  ],
});
