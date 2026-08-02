/**
 * Tests for `earsyntax extract`.
 *
 * The command dispatcher (cli.ts/args.ts) is owned by another agent; these drive
 * {@link extractCommand} directly with a hand-built {@link CommandContext} and
 * assert against the returned {@link CommandResult}. Once the dispatcher routes
 * `extract`, the acceptance gate
 * `node packages/cli/bin/run.js extract fixtures/profiles/kiro/requirements.md --profile kiro --json`
 * exercises the same path end to end.
 *
 * Snapshot coverage diffs the projected facade candidates against the profile
 * fixture sidecars (`fixtures/profiles/*.candidates.json`). Every agreeing
 * fixture, including `openspec/spec` and `openspec/change`, matches real pipeline
 * output: the openspec locator emits one requirement statement per
 * `### Requirement:` block and skips the `#### Scenario:` gherkin steps.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GlobalOptions, ParsedArgs } from '../args.js';
import { createPainter } from '../color.js';
import type { CommandContext, CommandResult } from '../context.js';
import { CliError } from '../errors.js';
import { serialize, type Emitter } from '../response.js';
import { extractCommand } from './extract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const FIXTURES = resolve(REPO_ROOT, 'fixtures', 'profiles');

/** Build a context and invoke {@link extractCommand}, returning its result. */
function runExtract(opts: {
  paths: string[];
  profile?: string;
  json?: boolean;
  quiet?: boolean;
  cwd?: string;
}): CommandResult {
  const args: ParsedArgs = {
    positionals: opts.paths,
    booleans: new Set(),
    values: new Map(),
  };
  const global: GlobalOptions = {
    json: opts.json ?? false,
    sarif: false,
    strict: false,
    quiet: opts.quiet ?? false,
    profile: opts.profile ?? 'strict',
    color: false,
  };
  const emitter: Emitter = {
    json: global.json,
    painter: createPainter(false),
    write: () => undefined,
  };
  const context: CommandContext = { args, global, cwd: opts.cwd ?? FIXTURES, emitter };
  return extractCommand(context);
}

/** Read the `candidates` array from a profile fixture sidecar. */
function sidecarCandidates(relPath: string): Record<string, unknown>[] {
  const raw = readFileSync(resolve(FIXTURES, relPath), 'utf8');
  return (JSON.parse(raw) as { candidates: Record<string, unknown>[] }).candidates;
}

/**
 * Drop the `file` field for a position/text comparison.
 *
 * The sidecars are inconsistent about how they record `file` (some
 * profile-relative like `kiro/requirements.md`, speckit repo-relative like
 * `fixtures/profiles/speckit/spec.md`), and `file` is just the input path echoed
 * back. The load-bearing snapshot is line/col/text/profile/locatorRuleId/
 * requirementId; `file` is asserted separately as the echoed path.
 */
function withoutFile(candidates: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return candidates.map(({ file: _file, ...rest }) => rest);
}

// Fixtures whose sidecar matches real pipeline output once the command projects
// the pipeline Candidate into the frozen facade shape. Each carries the cwd that
// reproduces the sidecar's `file` convention so full-object equality holds.
const AGREEING: {
  name: string;
  doc: string;
  profile: string;
  sidecar: string;
}[] = [
  {
    name: 'kiro requirements (numbered acceptance-criteria items)',
    doc: 'kiro/requirements.md',
    profile: 'kiro',
    sidecar: 'kiro/requirements.candidates.json',
  },
  {
    name: 'strict valid (every-line)',
    doc: 'strict/valid.ears',
    profile: 'strict',
    sidecar: 'strict/valid.candidates.json',
  },
  {
    name: 'strict invalid (every-line, locate-only ignores validity)',
    doc: 'strict/invalid.ears',
    profile: 'strict',
    sidecar: 'strict/invalid.candidates.json',
  },
  {
    name: 'ears-x prohibition (every-line)',
    doc: 'ears-x/prohibition.ears',
    profile: 'ears-x',
    sidecar: 'ears-x/prohibition.candidates.json',
  },
  {
    name: 'ears-x frame-metadata (every-line, frame ids captured)',
    doc: 'ears-x/frame-metadata.ears',
    profile: 'ears-x',
    sidecar: 'ears-x/frame-metadata.candidates.json',
  },
  {
    name: 'speckit spec (requirements section, bold FR label stripped to requirementId)',
    doc: 'speckit/spec.md',
    profile: 'speckit',
    sidecar: 'speckit/spec.candidates.json',
  },
  {
    name: 'openspec spec (requirement statement per ### Requirement:, no scenario steps)',
    doc: 'openspec/spec.md',
    profile: 'openspec',
    sidecar: 'openspec/spec.candidates.json',
  },
  {
    name: 'openspec change (requirement statement per delta block, no scenario steps)',
    doc: 'openspec/change.md',
    profile: 'openspec',
    sidecar: 'openspec/change.candidates.json',
  },
];

// Zero-candidate false-positive guards.
const GUARDS: { name: string; doc: string; profile: string }[] = [
  { name: 'kiro design (no Acceptance Criteria heading)', doc: 'kiro/design.md', profile: 'kiro' },
  { name: 'speckit plan (no Requirements heading)', doc: 'speckit/plan.md', profile: 'speckit' },
  {
    name: 'openspec project (no Requirement/Scenario block)',
    doc: 'openspec/project.md',
    profile: 'openspec',
  },
];

describe('extract snapshots against profile fixtures', () => {
  for (const fixture of AGREEING) {
    it(`matches the sidecar for ${fixture.name}`, () => {
      const result = runExtract({ paths: [fixture.doc], profile: fixture.profile, json: true });
      expect(result.exitCode).toBe(0);
      expect(result.response.ok).toBe(true);
      const expected = sidecarCandidates(fixture.sidecar);
      const actual = result.response.candidates as Record<string, unknown>[];
      expect(withoutFile(actual)).toEqual(withoutFile(expected));
      // `file` echoes the input path, profile-relative under the fixtures cwd.
      expect(actual.every((candidate) => candidate.file === fixture.doc)).toBe(true);
      expect(result.response.summary).toEqual({ files: 1, candidates: expected.length });
    });
  }

  for (const guard of GUARDS) {
    it(`reports zero candidates and exit 0 for ${guard.name}`, () => {
      const result = runExtract({ paths: [guard.doc], profile: guard.profile, json: true });
      expect(result.exitCode).toBe(0);
      expect(result.response.ok).toBe(true);
      expect(result.response.candidates).toEqual([]);
      expect(result.response.summary).toEqual({ files: 1, candidates: 0 });
    });
  }
});

describe('extract candidate projection', () => {
  it('emits facade field order: file, line, col, text, profile, locatorRuleId', () => {
    const result = runExtract({ paths: ['strict/valid.ears'], profile: 'strict', json: true });
    const first = JSON.stringify((result.response.candidates as unknown[])[0]);
    expect(first).toBe(
      '{"file":"strict/valid.ears","line":1,"col":1,' +
        '"text":"The billing service shall verify the HMAC signature of every incoming webhook.",' +
        '"profile":"strict","locatorRuleId":"strict.every-line"}',
    );
  });

  it('places requirementId last in the field order when the locator finds one', () => {
    const result = runExtract({
      paths: ['ears-x/frame-metadata.ears'],
      profile: 'ears-x',
      json: true,
    });
    const candidates = result.response.candidates as { requirementId?: string }[];
    expect(candidates.map((candidate) => candidate.requirementId)).toEqual([
      'REQ-001',
      'REQ-002',
      'REQ-003',
    ]);
    const serialized = JSON.stringify(candidates[0]);
    expect(serialized.indexOf('"locatorRuleId"')).toBeLessThan(
      serialized.indexOf('"requirementId"'),
    );
  });
});

describe('extract envelope and exit codes', () => {
  it('carries the base envelope keys in order with an empty next', () => {
    const result = runExtract({ paths: ['strict/valid.ears'], profile: 'strict', json: true });
    expect(Object.keys(result.response)).toEqual([
      'version',
      'command',
      'ok',
      'summary',
      'candidates',
      'next',
    ]);
    expect(result.response.command).toBe('extract');
    expect(result.response.next).toEqual([]);
  });

  it('defaults to the strict profile', () => {
    const result = runExtract({ paths: ['strict/valid.ears'], json: true });
    expect(result.exitCode).toBe(0);
    const candidates = result.response.candidates as { profile: string }[];
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) => candidate.profile === 'strict')).toBe(true);
  });

  it('serializes to valid JSON with no undefined leakage', () => {
    const result = runExtract({ paths: ['strict/valid.ears'], profile: 'strict', json: true });
    const text = serialize(result.response);
    expect(text).not.toContain('undefined');
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('exits 2 with a usage error when no paths are given', () => {
    try {
      runExtract({ paths: [], profile: 'strict', json: true });
      throw new Error('expected a CliError');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).exitCode).toBe(2);
      expect((error as CliError).diagnostic.code).toBe('extract.no_paths');
    }
  });

  it('exits 2 on an unknown profile', () => {
    try {
      runExtract({ paths: ['strict/valid.ears'], profile: 'nope', json: true });
      throw new Error('expected a CliError');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).exitCode).toBe(2);
      expect((error as CliError).diagnostic.code).toBe('cli.unknown_profile');
    }
  });

  it('exits 2 on a missing file', () => {
    try {
      runExtract({ paths: ['strict/does-not-exist.ears'], profile: 'strict', json: true });
      throw new Error('expected a CliError');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).exitCode).toBe(2);
      expect((error as CliError).diagnostic.code).toBe('extract.missing_file');
    }
  });
});

describe('extract human output', () => {
  it('renders lines as file:line:col [rule] text with a summary footer', () => {
    const result = runExtract({ paths: ['strict/valid.ears'], profile: 'strict' });
    const lines = result.pretty.split('\n');
    expect(lines[0]).toBe(
      'strict/valid.ears:1:1 [strict.every-line] The billing service shall verify the HMAC signature of every incoming webhook.',
    );
    expect(result.pretty).toContain('7 candidates');
  });

  it('prefixes the requirementId in human lines when present', () => {
    const result = runExtract({ paths: ['ears-x/frame-metadata.ears'], profile: 'ears-x' });
    expect(result.pretty.split('\n')[0]).toContain('[ears-x.every-line] REQ-001 ');
  });

  it('omits the summary footer under --quiet but keeps the candidate lines', () => {
    const result = runExtract({ paths: ['strict/valid.ears'], profile: 'strict', quiet: true });
    expect(result.pretty).not.toContain('7 candidates');
    expect(result.pretty).toContain('strict/valid.ears:1:1 [strict.every-line]');
  });

  it('prints a friendly note for zero candidates in human mode', () => {
    const result = runExtract({ paths: ['kiro/design.md'], profile: 'kiro' });
    expect(result.exitCode).toBe(0);
    expect(result.pretty).toBe('No candidates found.');
  });
});
