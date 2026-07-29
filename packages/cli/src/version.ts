/**
 * Version and feature discovery.
 *
 * The reported `version` is the installed `@earsyntax/cli` package version,
 * read from `package.json` at runtime so it never drifts from what npm shipped.
 * {@link FEATURES} is the capability map agents branch on without guessing.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function readPackageVersion(): string {
  // From dist/version.js (built) or src/version.ts (vitest), the package root
  // is one directory up, and package.json lives there.
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, '..', 'package.json');
  try {
    const raw = readFileSync(pkgPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'version' in parsed) {
      const version = (parsed as { version?: unknown }).version;
      if (typeof version === 'string') {
        return version;
      }
    }
  } catch {
    // Fall through to the pinned default.
  }
  return '0.1.0';
}

/** The installed package version, resolved once at module load. */
export const CLI_VERSION = readPackageVersion();

/** The facade contract version. Increments only on a breaking JSON change. */
export const FACADE_CONTRACT = 1;

/** The capability map shape agents branch on. */
export interface Features {
  facade: number;
  workItems: boolean;
  instructions: string[];
  inputFormats: string[];
  outputFormats: string[];
  sarif: boolean;
}

/** Capability map returned by `version --features`. */
export const FEATURES: Features = {
  facade: FACADE_CONTRACT,
  workItems: true,
  instructions: ['author', 'convert', 'repair', 'review'],
  inputFormats: ['.ears', 'markdown', 'yaml', 'json'],
  outputFormats: ['pretty', 'json'],
  // SARIF output exists in @earsyntax/cli-contract but is not wired into the
  // CLI in this milestone; the flag is false so agents do not select it.
  sarif: false,
};
