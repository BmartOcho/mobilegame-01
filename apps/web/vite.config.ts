import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 5173 },
  build: { target: 'es2022', outDir: 'dist' },
  optimizeDeps: { exclude: ['@dimforge/rapier2d-deterministic-compat'] },
});
