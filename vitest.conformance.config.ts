import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Business-case e2e suite config.
 *
 * The e2e tests are separate from the per-package unit suites. They import
 * public package entrypoints through source aliases, never built dist artifacts.
 * The real binary is exercised by scripts/cli-e2e.sh.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@earsyntax/cli': fileURLToPath(new URL('./packages/cli/src/index.ts', import.meta.url)),
      '@earsyntax/cli-contract': fileURLToPath(
        new URL('./packages/cli-contract/src/index.ts', import.meta.url),
      ),
      '@earsyntax/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@earsyntax/extract': fileURLToPath(
        new URL('./packages/extract/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['packages/cli/src/e2e/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
