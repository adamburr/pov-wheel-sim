import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build works under GitHub Pages' /pov-wheel-sim/ subpath.
  base: './',
  server: { port: 5173 },
  build: {
    rolldownOptions: {
      // three.js in a chunk of its own: it changes far less often than the app, so browsers keep it
      // cached across deploys.
      output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] } },
    },
    // three.js with its add-ons (controls, bloom) is over Vite's 500 kB default, and can't be split further.
    chunkSizeWarningLimit: 650,
  },
  test: { environment: 'node' },
});
