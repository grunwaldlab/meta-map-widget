import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',          // Output directory
    cssCodeSplit: true,      // Extract CSS into separate files
    sourcemap: true,         // Generate source maps for debugging
    minify: 'esbuild',       // Minify the output
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'PSMapWidget',
      fileName: (format) => `ps-leaflet-map-widget.${format}.js`,
    },
  },
});
