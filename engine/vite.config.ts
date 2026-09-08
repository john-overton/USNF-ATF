import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The engine is a browser dev target and the Electron renderer. Relative base so the
// production bundle loads from a file:// URL inside the packaged app.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome140',
    sourcemap: true,
    // Three.js alone is ~600 kB minified; one chunk is fine for a desktop app loaded from disk.
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
