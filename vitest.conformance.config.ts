import { defineConfig } from 'vitest/config';

/**
 * Conformance suite config.
 *
 * The conformance tests are a separate vitest project from the per-package unit
 * suites. They spawn the real built binary (packages/cli/bin/run.js) and never
 * import command internals, so they must run after `pnpm build`. `pnpm test`
 * (which filters to packages/**) does not pick these up; only `pnpm conformance`
 * runs them, via `vitest run --config vitest.conformance.config.ts`.
 */
export default defineConfig({
  test: {
    include: ['test/conformance/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // Each smoke test spawns the CLI (and the demo test runs a shell script),
    // so give the slow spawners room without failing on the default 5s timeout.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
