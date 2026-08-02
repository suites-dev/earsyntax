import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { REPO_ROOT, runCli, runCliJson } from './helpers.js';

/**
 * CLI smoke conformance.
 *
 * Proves the frozen alpha facade at the process boundary: the eight commands are
 * present and nothing outside them is, the exit-code contract (0/1/2) holds, the
 * JSON envelopes parse, the tool is stateless (validates from stdin in an empty
 * directory and never writes a workspace), and the SARIF projection is schema-tagged.
 */

const KIRO_EXTRACT_FIXTURE = join(REPO_ROOT, 'fixtures/profiles/kiro/requirements.md');
const KIRO_HOST_REPO = join(REPO_ROOT, 'fixtures/host-repos/kiro');
const KIRO_HOST_DOC = join(
  REPO_ROOT,
  'fixtures/host-repos/kiro/.kiro/specs/checkout/requirements.md',
);

const FACADE_COMMANDS = [
  'validate',
  'extract',
  'instructions',
  'explain',
  'profiles',
  'doctor',
  'init',
  'version',
];

// Verbs and flags that belonged to the removed `.earsyntax/` workspace and
// lifecycle surface. None may reappear in help.
const FORBIDDEN_COMMANDS = ['new', 'list', 'status', 'show', 'accept', 'check'];
const FORBIDDEN_FLAGS = ['--tools', '--work'];

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('help surface', () => {
  it('lists exactly the eight facade commands', () => {
    const help = runCli(['--help']);
    expect(help.code).toBe(0);
    for (const command of FACADE_COMMANDS) {
      expect(help.stdout).toContain(command);
    }
    // "exactly eight" is proven against the feature manifest, the machine-readable
    // command list, so a stray tenth command cannot slip past a substring check.
    const { json } = runCliJson(['version', '--features', '--json']);
    const features = json.features as Record<string, unknown>;
    expect(features.commands).toEqual(FACADE_COMMANDS);
  });

  it('advertises none of the removed workspace verbs', () => {
    const help = runCli(['--help']);
    for (const verb of FORBIDDEN_COMMANDS) {
      // Word-boundary check so "extract" does not count as containing "act".
      expect(new RegExp(`\\b${verb}\\b`).test(help.stdout)).toBe(false);
    }
  });

  it('advertises none of the removed workspace flags', () => {
    const help = runCli(['--help']);
    for (const flag of FORBIDDEN_FLAGS) {
      expect(help.stdout).not.toContain(flag);
    }
  });
});

describe('version --features --json', () => {
  it('parses and reports the profile list and sarif capability', () => {
    const { result, json } = runCliJson(['version', '--features', '--json']);
    expect(result.code).toBe(0);
    const features = json.features as Record<string, unknown>;
    expect(Array.isArray(features.profiles)).toBe(true);
    expect(features.profiles).toEqual(['strict', 'ears-x', 'kiro', 'speckit', 'openspec']);
    expect(features.sarif).toBe(true);
  });
});

describe('validate exit-code contract', () => {
  it('exits 0 for clean EARS on stdin', () => {
    const result = runCli(['validate', '-'], { input: 'The system shall respond.\n' });
    expect(result.code).toBe(0);
  });

  it('exits 1 for broken EARS on stdin', () => {
    const result = runCli(['validate', '-'], { input: 'When foo the bar.\n' });
    expect(result.code).toBe(1);
  });

  it('exits 2 for a missing file', () => {
    const result = runCli(['validate', join(REPO_ROOT, 'does', 'not', 'exist.md')]);
    expect(result.code).toBe(2);
  });

  it('validates from stdin in an empty directory and writes nothing (stateless proof)', () => {
    const dir = makeTempDir('earsyntax-conf-empty-');
    const result = runCli(['validate', '-', '--cwd', dir], {
      input: 'The system shall respond.\n',
      cwd: dir,
    });
    expect(result.code).toBe(0);
    // The stateless facade never materializes a workspace to validate.
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe('extract', () => {
  it('locates the nine Kiro candidates as JSON', () => {
    const { result, json } = runCliJson([
      'extract',
      KIRO_EXTRACT_FIXTURE,
      '--profile',
      'kiro',
      '--json',
    ]);
    expect(result.code).toBe(0);
    expect(Array.isArray(json.candidates)).toBe(true);
    expect((json.candidates as unknown[]).length).toBe(9);
  });
});

describe('doctor', () => {
  it('detects the Kiro host on the kiro fixture repo', () => {
    const { result, json } = runCliJson(['doctor', '--cwd', KIRO_HOST_REPO, '--json'], {
      cwd: KIRO_HOST_REPO,
    });
    expect(result.code).toBe(0);
    const detected = json.detected as { hosts: { host: string }[] };
    expect(detected.hosts.map((entry) => entry.host)).toContain('kiro');
  });
});

describe('explain', () => {
  it('resolves a current registry id', () => {
    const { result, json } = runCliJson(['explain', 'EARS-E001', '--json']);
    expect(result.code).toBe(0);
    expect(json.id).toBe('EARS-E001');
  });

  it('resolves a deprecated alias and flags the deprecation', () => {
    const { result, json } = runCliJson(['explain', 'catalog.system_ambiguous', '--json']);
    expect(result.code).toBe(0);
    expect(json.id).toBe('EARS-E001');
    expect(json.alias).toBe(true);
    expect(String(json.deprecationNote)).toContain('deprecated alias');
  });
});

describe('profiles', () => {
  it('lists the five built-in profiles as JSON', () => {
    const { result, json } = runCliJson(['profiles', '--json']);
    expect(result.code).toBe(0);
    const profiles = json.profiles as { name: string }[];
    expect(profiles.map((profile) => profile.name)).toEqual([
      'strict',
      'ears-x',
      'kiro',
      'speckit',
      'openspec',
    ]);
  });
});

describe('init idempotency', () => {
  it('skips every managed file on a second run and never creates .earsyntax/', () => {
    const dir = makeTempDir('earsyntax-conf-init-');

    const first = runCliJson(['init', '--agent', 'claude', '--host', 'kiro', '--cwd', dir, '--json'], {
      cwd: dir,
    });
    expect(first.result.code).toBe(0);
    const firstWritten = first.json.written as unknown[];
    expect(firstWritten.length).toBeGreaterThan(0);

    const second = runCliJson(['init', '--agent', 'claude', '--host', 'kiro', '--cwd', dir, '--json'], {
      cwd: dir,
    });
    expect(second.result.code).toBe(0);
    expect(second.json.ok).toBe(true);
    expect(second.json.written).toEqual([]);
    // Second run touches nothing: every managed file is reported as skipped.
    expect((second.json.skipped as unknown[]).length).toBe(firstWritten.length);

    // The host-native facade owns no managed workspace directory.
    expect(readdirSync(dir)).not.toContain('.earsyntax');
  });
});

describe('validate --sarif', () => {
  it('emits schema-tagged SARIF for the Kiro fixture', () => {
    const { result, json } = runCliJson([
      'validate',
      KIRO_HOST_DOC,
      '--profile',
      'kiro',
      '--sarif',
    ]);
    // A clean run still emits a valid SARIF log; exit 0 with no error findings.
    expect(result.code).toBe(0);
    expect(json.version).toBe('2.1.0');
    expect(String(json.$schema)).toBe(
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    );
    expect(Array.isArray(json.runs)).toBe(true);
    expect((json.runs as unknown[]).length).toBe(1);
  });
});
