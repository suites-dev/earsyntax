import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './helpers.js';

/**
 * Demo smoke.
 *
 * The agentic-loop demo is the end-to-end story: detect the host, render files,
 * extract, validate, repair, revalidate, emit SARIF. In deterministic mode
 * (RUN_CLAUDE=0) with pauses off it must run to completion and exit 0.
 */

const DEMO_SCRIPT = join(REPO_ROOT, 'scripts/agentic-loop-demo.sh');

describe('agentic-loop demo', () => {
  it('runs to completion deterministically with no pauses', () => {
    expect(existsSync(DEMO_SCRIPT)).toBe(true);
    const result = spawnSync('bash', [DEMO_SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, RUN_CLAUDE: '0', PAUSE: '0' },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.status !== 0) {
      // Surface the tail so a failing demo is diagnosable from the test log.
      const output = `${result.stdout}\n${result.stderr}`;
      throw new Error(`agentic-loop-demo.sh exited ${result.status}:\n${output.slice(-2000)}`);
    }
    expect(result.status).toBe(0);
  });
});
