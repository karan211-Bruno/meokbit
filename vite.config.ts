import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5182,
    host: true,
  },
  preview: {
    port: 4186,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
