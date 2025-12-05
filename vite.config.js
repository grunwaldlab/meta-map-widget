import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'PSMapWidget',
      formats: ['iife', 'es', 'umd'],
      fileName: (format) => `meta-map-widget.${format}.min.js`,
    },

    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        globals: {
          leaflet: 'L'
        }
      }
    }
  }
});
