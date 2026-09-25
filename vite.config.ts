import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built game works from any folder or host.
  base: './',
  server: { host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
