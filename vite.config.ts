import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the production build works from any folder or static host.
  base: './',
  server: {
    port: 5173,
    // The game server (npm run server) handles accounts and saves; the dev server forwards to it.
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    // Phaser alone is ~1.2 MB minified; that's expected.
    chunkSizeWarningLimit: 2000,
  },
});
