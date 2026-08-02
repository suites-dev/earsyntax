/**
 * Tests for the stateless `validate` command.
 *
 * The logic tests drive {@link runValidate} with injected {@link ValidateDeps}
 * so no disk or stdin is touched: they cover the profile, input-resolution, and
 * findings framing. A second group drives the {@link validateCommand} handler
 * against real temp files and repo fixtures, covering emission (`--json`,
 * `--quiet`, pretty), the exit-code matrix end to end, and the kiro/strict
 * profile split.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GlobalOptions, ParsedArgs } from '../args.js';
import { createPainter } from '../color.js';
import type { CommandContext } from '../context.js';
import type { Emitter } from '../response.js';
import { runValidate, type ValidateDeps, validateCommand } from './validate.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const KIRO_REQUIREMENTS = 'fixtures/profiles/kiro/requirements.md';

const CWD = '/work';

const CLEAN_LINE = 'When the user clicks the button, the system shall do it.\n';
const WARN_LINE = 'When the user submits the form, the system shall handle it appropriately.\n';
const KIRO_LINES = [
  'WHEN a user submits valid credentials THE SYSTEM SHALL establish an authenticated session.',
  'THE SYSTEM SHALL persist the working draft every thirty seconds.',
  '',
].join('\n');

/** A hermetic {@link ValidateDeps} over an in-memory file map. Keys are absolute. */
function fakeDeps(
  files: Record<string, string>,
  overrides: Partial<ValidateDeps> = {},
): ValidateDeps {
  return {
    exists: (absPath) => Object.hasOwn(files, absPath),
    readFile: (absPath) => {
      if (!Object.hasOwn(files, absPath)) {
        throw new Error(`no such file: ${absPath}`);
      }
      return files[absPath];
    },
    glob: () => [],
    readStdin: () => '',
    ...overrides,
  };
}

/** Run `validate` over a single in-memory file under a profile. */
function runOne(
  name: string,
  content: string,
  profileName = 'strict',
  strict = false,
): ReturnType<typeof runValidate> {
  return runValidate(
    { paths: [name], profileName, strict, sarif: false, json: true, cwd: CWD },
    fakeDeps({ [`${CWD}/${name}`]: content }),
  );
}

describe('runValidate — inputs and exit codes', () => {
  it('exits 0 on a clean file with no findings', () => {
    const r = runOne('clean.ears', CLEAN_LINE);
    expect(r.exitCode).toBe(0);
    expect(r.response.ok).toBe(true);
    const findings = r.response.findings as { summary: { errors: number } };
    expect(findings.summary.errors).toBe(0);
  });

  it('exits 1 on error-severity findings', () => {
    const r = runOne('bad.ears', KIRO_LINES);
    expect(r.exitCode).toBe(1);
    expect(r.response.ok).toBe(false);
    const findings = r.response.findings as { diagnostics: { id: string }[] };
    const ids = new Set(findings.diagnostics.map((d) => d.id));
    expect(ids.has('EARS-E014')).toBe(true);
    expect(ids.has('EARS-E015')).toBe(true);
  });

  it('--strict flips a warning-only run from exit 0 to exit 1', () => {
    const lenient = runOne('warn.ears', WARN_LINE, 'strict', false);
    expect(lenient.exitCode).toBe(0);
    expect((lenient.response.findings as { summary: { warnings: number } }).summary.warnings).toBe(
      1,
    );

    const strict = runOne('warn.ears', WARN_LINE, 'strict', true);
    expect(strict.exitCode).toBe(1);
    const findings = strict.response.findings as {
      summary: { errors: number; warnings: number };
      diagnostics: { id: string; severity: string }[];
    };
    expect(findings.summary.errors).toBe(1);
    expect(findings.summary.warnings).toBe(0);
    // The W-band id is preserved; only the effective severity is upgraded.
    expect(findings.diagnostics[0]?.id).toBe('EARS-W016');
    expect(findings.diagnostics[0]?.severity).toBe('error');
  });

  it('aggregates multiple files into one Findings with the right file count', () => {
    const r = runValidate(
      {
        paths: ['a.ears', 'b.ears'],
        profileName: 'strict',
        strict: false,
        sarif: false,
        json: true,
        cwd: CWD,
      },
      fakeDeps({ [`${CWD}/a.ears`]: CLEAN_LINE, [`${CWD}/b.ears`]: KIRO_LINES }),
    );
    expect(r.exitCode).toBe(1);
    const findings = r.response.findings as { summary: { files: number } };
    expect(findings.summary.files).toBe(2);
  });

  it('expands a glob pattern in sorted order', () => {
    const r = runValidate(
      {
        paths: ['*.ears'],
        profileName: 'strict',
        strict: false,
        sarif: false,
        json: true,
        cwd: CWD,
      },
      fakeDeps(
        { [`${CWD}/a.ears`]: CLEAN_LINE, [`${CWD}/b.ears`]: CLEAN_LINE },
        { glob: () => ['b.ears', 'a.ears'] },
      ),
    );
    expect(r.exitCode).toBe(0);
    const findings = r.response.findings as { summary: { files: number } };
    expect(findings.summary.files).toBe(2);
  });

  it('reads stdin as one document via -', () => {
    const r = runValidate(
      { paths: ['-'], profileName: 'strict', strict: false, sarif: false, json: true, cwd: CWD },
      fakeDeps({}, { readStdin: () => CLEAN_LINE }),
    );
    expect(r.exitCode).toBe(0);
    const findings = r.response.findings as { summary: { files: number; requirements: number } };
    expect(findings.summary.files).toBe(1);
    expect(findings.summary.requirements).toBe(1);
    const diag = r.response.findings as { diagnostics: { file: string }[] };
    expect(diag.diagnostics).toEqual([]);
  });

  it('rejects reading stdin twice', () => {
    const r = runValidate(
      {
        paths: ['-', '-'],
        profileName: 'strict',
        strict: false,
        sarif: false,
        json: true,
        cwd: CWD,
      },
      fakeDeps({}, { readStdin: () => CLEAN_LINE }),
    );
    expect(r.exitCode).toBe(2);
    expect((r.response.diagnostics as { code: string }[])[0]?.code).toBe(
      'validate.duplicate_stdin',
    );
  });

  it('exits 2 with a typed diagnostic on an unknown profile', () => {
    const r = runOne('clean.ears', CLEAN_LINE, 'nope');
    expect(r.exitCode).toBe(2);
    expect(r.response.ok).toBe(false);
    expect((r.response.diagnostics as { code: string }[])[0]?.code).toBe('cli.unknown_profile');
    expect(r.response.findings).toBeUndefined();
  });

  it('exits 2 on a missing file (an environment failure, not a finding)', () => {
    const r = runValidate(
      {
        paths: ['ghost.ears'],
        profileName: 'strict',
        strict: false,
        sarif: false,
        json: true,
        cwd: CWD,
      },
      fakeDeps({}),
    );
    expect(r.exitCode).toBe(2);
    const diag = (r.response.diagnostics as { code: string; path?: string }[])[0];
    expect(diag.code).toBe('validate.missing_file');
    expect(diag.path).toBe('ghost.ears');
  });

  it('exits 2 on an unreadable file', () => {
    const r = runValidate(
      {
        paths: ['locked.ears'],
        profileName: 'strict',
        strict: false,
        sarif: false,
        json: true,
        cwd: CWD,
      },
      fakeDeps(
        { [`${CWD}/locked.ears`]: '' },
        {
          exists: () => true,
          readFile: () => {
            throw new Error('EACCES');
          },
        },
      ),
    );
    expect(r.exitCode).toBe(2);
    expect((r.response.diagnostics as { code: string }[])[0]?.code).toBe('validate.unreadable');
  });

  it('exits 2 when no paths are given', () => {
    const r = runValidate(
      { paths: [], profileName: 'strict', strict: false, sarif: false, json: true, cwd: CWD },
      fakeDeps({}),
    );
    expect(r.exitCode).toBe(2);
    expect((r.response.diagnostics as { code: string }[])[0]?.code).toBe('validate.no_files');
  });

  it('exits 2 when a glob matches nothing', () => {
    const r = runValidate(
      {
        paths: ['*.ears'],
        profileName: 'strict',
        strict: false,
        sarif: false,
        json: true,
        cwd: CWD,
      },
      fakeDeps({}, { glob: () => [] }),
    );
    expect(r.exitCode).toBe(2);
    expect((r.response.diagnostics as { code: string }[])[0]?.code).toBe('validate.no_files');
  });

  it('emits a valid, empty SARIF log as raw stdout on a clean run (exit 0)', () => {
    const r = runValidate(
      {
        paths: ['clean.ears'],
        profileName: 'strict',
        strict: false,
        sarif: true,
        json: false,
        cwd: CWD,
      },
      fakeDeps({ [`${CWD}/clean.ears`]: CLEAN_LINE }),
    );
    expect(r.exitCode).toBe(0);
    const log = JSON.parse(r.raw ?? '') as {
      version: string;
      runs: { results: unknown[]; tool: { driver: { name: string; rules: unknown[] } } }[];
    };
    expect(log.version).toBe('2.1.0');
    expect(log.runs[0]?.tool.driver.name).toBe('earsyntax');
    expect(log.runs[0]?.results).toEqual([]);
    expect(log.runs[0]?.tool.driver.rules).toEqual([]);
  });

  it('emits SARIF results with EARS ids, levels, and positions on a failing run (exit 1)', () => {
    const r = runValidate(
      {
        paths: ['bad.ears'],
        profileName: 'strict',
        strict: false,
        sarif: true,
        json: false,
        cwd: CWD,
      },
      fakeDeps({ [`${CWD}/bad.ears`]: 'The system resets the timer.\n' }),
    );
    expect(r.exitCode).toBe(1);
    const log = JSON.parse(r.raw ?? '') as {
      runs: {
        results: {
          ruleId: string;
          ruleIndex: number;
          level: string;
          locations: {
            physicalLocation: { artifactLocation: { uri: string }; region: { startLine: number } };
          }[];
        }[];
        tool: { driver: { rules: { id: string }[] } };
      }[];
    };
    const results = log.runs[0]?.results ?? [];
    expect(results.length).toBeGreaterThan(0);
    const missingShall = results.find((result) => result.ruleId === 'EARS-E007');
    expect(missingShall).toBeDefined();
    expect(missingShall?.level).toBe('error');
    expect(missingShall?.locations[0]?.physicalLocation.artifactLocation.uri).toBe('bad.ears');
    expect(missingShall?.locations[0]?.physicalLocation.region.startLine).toBe(1);
    // The referenced rule id is declared on the driver.
    expect(log.runs[0]?.tool.driver.rules.map((rule) => rule.id)).toContain('EARS-E007');
  });

  it('rejects --json --sarif together as a flag conflict', () => {
    const r = runValidate(
      {
        paths: ['clean.ears'],
        profileName: 'strict',
        strict: false,
        sarif: true,
        json: true,
        cwd: CWD,
      },
      fakeDeps({ [`${CWD}/clean.ears`]: CLEAN_LINE }),
    );
    expect(r.exitCode).toBe(2);
    expect((r.response.diagnostics as { code: string }[])[0]?.code).toBe('cli.conflicting_flags');
  });
});

describe('runValidate — JSON envelope shape', () => {
  it('emits exactly the frozen envelope and findings key order', () => {
    const r = runOne('bad.ears', KIRO_LINES);
    expect(Object.keys(r.response)).toEqual(['version', 'command', 'ok', 'findings', 'next']);
    expect(r.response.command).toBe('validate');
    const findings = r.response.findings as Record<string, unknown>;
    expect(Object.keys(findings)).toEqual(['ok', 'summary', 'diagnostics']);
    expect(Object.keys(findings.summary as Record<string, unknown>)).toEqual([
      'files',
      'requirements',
      'valid',
      'errors',
      'warnings',
    ]);
    const first = (findings.diagnostics as Record<string, unknown>[])[0];
    // Optional keys included only when present, always in contract order.
    expect(Object.keys(first).slice(0, 4)).toEqual(['id', 'severity', 'file', 'line']);
  });

  it('adds a repair next action pointing at the first errored file', () => {
    const r = runOne('bad.ears', KIRO_LINES, 'strict');
    const next = r.response.next;
    expect(next).toHaveLength(1);
    expect(next[0]?.command).toBe(
      'earsyntax instructions repair --file bad.ears --profile strict --json',
    );
    expect(next[0]?.forAgent).toBe(true);
  });

  it('carries an empty next on a clean run', () => {
    const r = runOne('clean.ears', CLEAN_LINE);
    expect(r.response.next).toEqual([]);
  });
});

/**
 * Build a {@link CommandContext} for the handler. Like extract's tests, this
 * drives {@link validateCommand} directly and asserts against the returned
 * {@link CommandResult}; the handler reads resolved globals, never args, and
 * never writes (the dispatcher owns the single write), so no output capture is
 * needed.
 */
function makeContext(
  positionals: string[],
  options: { profile?: string; json?: boolean; quiet?: boolean; strict?: boolean; cwd: string },
): CommandContext {
  const args: ParsedArgs = { positionals, booleans: new Set(), values: new Map() };
  const global: GlobalOptions = {
    json: options.json ?? false,
    sarif: false,
    strict: options.strict ?? false,
    quiet: options.quiet ?? false,
    profile: options.profile ?? 'strict',
    cwd: options.cwd,
    color: false,
  };
  const emitter: Emitter = {
    json: global.json,
    painter: createPainter(false),
    write: () => undefined,
  };
  return { args, global, cwd: options.cwd, emitter };
}

describe('validateCommand — handler and emission', () => {
  function tempDir(): string {
    return mkdtempSync(join(tmpdir(), 'earsyntax-validate-'));
  }

  it('frames a JSON-mode run as a clean validate envelope', () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'clean.ears'), CLEAN_LINE);
    const result = validateCommand(makeContext(['clean.ears'], { json: true, cwd }));
    expect(result.exitCode).toBe(0);
    expect(result.response.command).toBe('validate');
    expect(result.response.ok).toBe(true);
  });

  it('honors --quiet by blanking the pretty rendering but keeping the exit code', () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'bad.ears'), KIRO_LINES);
    const result = validateCommand(makeContext(['bad.ears'], { quiet: true, cwd }));
    expect(result.exitCode).toBe(1);
    expect(result.pretty).toBe('');
  });

  it('prints one line per finding plus a summary in pretty mode', () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'bad.ears'), KIRO_LINES);
    const result = validateCommand(makeContext(['bad.ears'], { cwd }));
    expect(result.exitCode).toBe(1);
    const text = result.pretty;
    expect(text).toContain('bad.ears:1');
    expect(text).toContain('EARS-E014');
    expect(text).toMatch(/valid across 1 file\(s\)/);
  });
});

describe('validateCommand — kiro and strict profiles', () => {
  it('validates the kiro requirements fixture clean under the kiro profile', () => {
    const result = validateCommand(
      makeContext([KIRO_REQUIREMENTS], { profile: 'kiro', json: true, cwd: REPO_ROOT }),
    );
    expect(result.exitCode).toBe(0);
  });

  it('locates nothing in a markdown fixture under strict (strict is markdown-blind)', () => {
    // strict's locator covers only .ears/plain text, so a .md yields zero
    // candidates and a clean exit. Failing the kiro house style under strict is
    // exercised via .ears content below, not via this markdown file.
    const result = validateCommand(
      makeContext([KIRO_REQUIREMENTS], { profile: 'strict', json: true, cwd: REPO_ROOT }),
    );
    expect(result.exitCode).toBe(0);
    const findings = result.response.findings as { summary: { requirements: number } };
    expect(findings.summary.requirements).toBe(0);
  });

  it('fails the kiro house style under strict when the lines are plain .ears', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'earsyntax-validate-'));
    writeFileSync(join(cwd, 'criteria.ears'), KIRO_LINES);
    const result = validateCommand(
      makeContext(['criteria.ears'], { profile: 'strict', json: true, cwd }),
    );
    expect(result.exitCode).toBe(1);
    const findings = result.response.findings as { diagnostics: { id: string }[] };
    const ids = new Set(findings.diagnostics.map((d) => d.id));
    expect(ids.has('EARS-E014')).toBe(true);
    expect(ids.has('EARS-E015')).toBe(true);
  });
});
