import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works under GitHub Pages' /pov-wheel-sim/ subpath.
  base: './',
  server: { port: 5173 },
  test: { environment: 'node' },
} as any);
