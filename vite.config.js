import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'PSMapWidget',
      fileName: (format) => `ps-leaflet-map-widget.${format}.js`,
    },
  },
  css: {
    postcss: null
  }
});
