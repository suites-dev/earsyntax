import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['src/e2e/**/*.test.ts', '**/node_modules/**', '**/dist/**'],
    environment: 'node',
    globals: false,
    passWithNoTests: true,
  },
});
