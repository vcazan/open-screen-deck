import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'happy-dom',
    // Playwright owns e2e/*.spec.ts — vitest runs unit tests only
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
