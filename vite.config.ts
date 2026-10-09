/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the build also works inside a Capacitor WebView later.
  base: './',
  worker: { format: 'es' },
  server: { host: true },
  preview: { host: true },
  test: {
    include: ['tests/**/*.test.ts', 'server/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
