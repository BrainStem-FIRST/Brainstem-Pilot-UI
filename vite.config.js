import path from 'path'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

// The desktop build loads index.html off disk, so assets must resolve relative
// to the document; the GitHub Pages build is served from a repo subpath.
// `npm run build:desktop` sets DESKTOP=1 — everything else is identical.
const isDesktop = process.env.DESKTOP === '1';

// https://vite.dev/config/
export default defineConfig({
  base: isDesktop ? './' : '/Brainstem-Pilot-UI/',
  define: {
    __DESKTOP_BUILD__: JSON.stringify(isDesktop),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    noDiscovery: true,
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-router-dom',
      '@tanstack/react-query',
      '@hello-pangea/dnd',
      'framer-motion',
      'lucide-react',
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
    ],
  },
  server: {
    // The desktop shell opens its own window; don't also pop a browser tab.
    open: !isDesktop,
    watch: {
      ignored: [
        '**/.git/**',
        '**/.cursor/**',
        '**/node_modules/**',
        '**/dist/**',
      ],
    },
  },
  plugins: [react()],
});
