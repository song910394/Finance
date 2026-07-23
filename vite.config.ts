import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  base: '/Finance/',
  server: {
    port: 5040,
    host: '0.0.0.0',
  },
  plugins: [react()],
  define: {
    '__APP_VERSION__': JSON.stringify(pkg.version)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
