/**
 * Tests for `earsyntax instructions <author|convert|repair|review>`.
 *
 * These drive {@link instructionsCommand} directly with a hand-built
 * {@link CommandContext} and assert against the returned {@link CommandResult},
 * mirroring `extract.test.ts`. Dispatcher routing (cli.ts/args.ts) is covered
 * separately.
 *
 * The command is deterministic data: no clock, no LLM, no host-file mutation. It
 * returns rules, the profile locator and dialect, an edit policy, and (for
 * `repair` and `review`) the findings the validate pipeline reports. The
 * repair-with-findings case seeds a broken host file in a temp directory so the
 * embedded findings and per-id fix rules are real pipeline output.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GlobalOptions, ParsedArgs } from '../args.js';
import { createPainter } from '../color.js';
import type { CommandContext, CommandResult } from '../context.js';
import { CliError } from '../errors.js';
import { type Emitter, serialize } from '../response.js';
import { instructionsCommand } from './instructions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const FIXTURES = resolve(REPO_ROOT, 'fixtures', 'profiles');

const KIRO_DOC = 'kiro/requirements.md';

/** A broken Kiro host file seeded in a temp dir, for real repair/review findings. */
const BROKEN_DOC = [
  '## Requirements',
  '',
  '### Requirement 1',
  '',
  '#### Acceptance Criteria',
  '',
  '1. WHEN a user submits valid credentials THE SYSTEM SHALL establish a session.',
  '2. IF five sign-in attempts fail THE SYSTEM SHALL lock the account.',
  '',
].join('\n');

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'earsyntax-instr-'));
  writeFileSync(join(tmpDir, 'broken.md'), BROKEN_DOC, 'utf8');
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/** Build a context and invoke {@link instructionsCommand}, returning its result. */
function runInstructions(opts: {
  mode?: string;
  file?: string;
  from?: string;
  profile?: string;
  strict?: boolean;
  json?: boolean;
  quiet?: boolean;
  cwd?: string;
}): CommandResult {
  const values = new Map<string, string>();
  if (opts.file !== undefined) {
    values.set('file', opts.file);
  }
  if (opts.from !== undefined) {
    values.set('from', opts.from);
  }
  const args: ParsedArgs = {
    positionals: opts.mode === undefined ? [] : [opts.mode],
    booleans: new Set(),
    values,
  };
  const global: GlobalOptions = {
    json: opts.json ?? false,
    sarif: false,
    strict: opts.strict ?? false,
    quiet: opts.quiet ?? false,
    profile: opts.profile ?? 'strict',
  };
  const emitter: Emitter = {
    json: global.json,
    painter: createPainter(false),
    write: () => undefined,
  };
  const context: CommandContext = { args, global, cwd: opts.cwd ?? FIXTURES, emitter };
  return instructionsCommand(context);
}

/** Assert a thrown {@link CliError} with exit 2 and the given diagnostic code. */
function expectUsageError(run: () => void, code: string): void {
  try {
    run();
    throw new Error('expected a CliError');
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).exitCode).toBe(2);
    expect((error as CliError).diagnostic.code).toBe(code);
  }
}

describe('instructions payload shape per mode', () => {
  const WRITING_MODES = ['author', 'convert'] as const;
  const FINDINGS_MODES = ['repair', 'review'] as const;

  for (const mode of [...WRITING_MODES, ...FINDINGS_MODES]) {
    it(`frames ${mode} with the core payload keys, exit 0, ok true`, () => {
      const file = mode === 'author' || mode === 'convert' ? KIRO_DOC : 'broken.md';
      const cwd = mode === 'author' || mode === 'convert' ? FIXTURES : tmpDir;
      const result = runInstructions({ mode, file, profile: 'kiro', json: true, cwd });
      expect(result.exitCode).toBe(0);
      expect(result.response.ok).toBe(true);
      expect(result.response.command).toBe(`instructions ${mode}`);
      expect(result.response.mode).toBe(mode);
      expect(result.response.profile).toBe('kiro');
      expect(result.response.outputPolicy).toBe('edit-in-place');
      expect(result.response.editPolicy).toEqual({ editableFile: file, preserveStructure: true });
      expect(Array.isArray(result.response.rules)).toBe(true);
      expect((result.response.rules as string[]).length).toBeGreaterThan(0);
    });
  }

  for (const mode of WRITING_MODES) {
    it(`omits findings for ${mode}`, () => {
      const result = runInstructions({ mode, file: KIRO_DOC, profile: 'kiro', json: true });
      expect('findings' in result.response).toBe(false);
    });
  }

  for (const mode of FINDINGS_MODES) {
    it(`embeds findings for ${mode}`, () => {
      const result = runInstructions({
        mode,
        file: 'broken.md',
        profile: 'kiro',
        json: true,
        cwd: tmpDir,
      });
      expect('findings' in result.response).toBe(true);
      const findings = result.response.findings as { summary: { requirements: number } };
      expect(findings.summary.requirements).toBe(2);
    });
  }

  it('carries the instructions payload keys in the frozen order (repair)', () => {
    const result = runInstructions({
      mode: 'repair',
      file: 'broken.md',
      profile: 'kiro',
      json: true,
      cwd: tmpDir,
    });
    expect(Object.keys(result.response)).toEqual([
      'version',
      'command',
      'ok',
      'mode',
      'file',
      'profile',
      'locator',
      'dialect',
      'rules',
      'editPolicy',
      'outputPolicy',
      'findings',
      'next',
    ]);
  });

  it('places sourceFile and sourcePolicy right after profile when --from is given', () => {
    const result = runInstructions({
      mode: 'author',
      file: 'docs/new-requirements.md',
      from: KIRO_DOC,
      profile: 'kiro',
      json: true,
    });
    expect(Object.keys(result.response)).toEqual([
      'version',
      'command',
      'ok',
      'mode',
      'file',
      'profile',
      'sourceFile',
      'sourcePolicy',
      'locator',
      'dialect',
      'rules',
      'editPolicy',
      'outputPolicy',
      'next',
    ]);
    expect(result.response.sourceFile).toBe(KIRO_DOC);
    expect(result.response.sourcePolicy).toBe('read-only');
  });
});

describe('instructions --from validity matrix', () => {
  for (const mode of ['author', 'convert'] as const) {
    it(`accepts --from for ${mode} and adds a read-the-source rule`, () => {
      const result = runInstructions({
        mode,
        file: 'x.md',
        from: KIRO_DOC,
        profile: 'kiro',
        json: true,
      });
      expect(result.exitCode).toBe(0);
      expect(result.response.sourceFile).toBe(KIRO_DOC);
      expect(result.response.editPolicy).toEqual({ editableFile: 'x.md', preserveStructure: true });
      const rules = result.response.rules as string[];
      expect(rules.some((rule) => rule.includes('source file'))).toBe(true);
      expect(rules.some((rule) => rule.includes('Leave the source file unchanged.'))).toBe(true);
    });
  }

  for (const mode of ['repair', 'review'] as const) {
    it(`rejects --from for ${mode} with exit 2`, () => {
      expectUsageError(
        () =>
          runInstructions({
            mode,
            file: 'broken.md',
            from: KIRO_DOC,
            profile: 'kiro',
            json: true,
            cwd: tmpDir,
          }),
        'instructions.from_not_allowed',
      );
    });
  }
});

describe('instructions repair embeds real findings and keyed fix rules', () => {
  it('reports the seeded diagnostics and their per-id fix rules', () => {
    const result = runInstructions({
      mode: 'repair',
      file: 'broken.md',
      profile: 'kiro',
      json: true,
      cwd: tmpDir,
    });
    const findings = result.response.findings as {
      ok: boolean;
      summary: { errors: number };
      diagnostics: { id: string }[];
    };
    expect(findings.ok).toBe(false);
    expect(findings.summary.errors).toBe(2);
    const ids = findings.diagnostics.map((diagnostic) => diagnostic.id);
    expect(ids).toContain('EARS-E006');
    expect(ids).toContain('EARS-E008');

    const rules = result.response.rules as string[];
    expect(rules.some((rule) => rule.startsWith('EARS-E006:'))).toBe(true);
    expect(rules.some((rule) => rule.startsWith('EARS-E008:'))).toBe(true);
    // The command never returns exit 1; only validate does.
    expect(result.exitCode).toBe(0);
  });

  it('carries --strict into the findings pipeline', () => {
    const result = runInstructions({
      mode: 'repair',
      file: 'broken.md',
      profile: 'kiro',
      strict: true,
      json: true,
      cwd: tmpDir,
    });
    expect('findings' in result.response).toBe(true);
  });
});

describe('instructions never emits accept-style language', () => {
  const ACCEPT_LANGUAGE = /\b(approve|accept|merge)\b/i;

  for (const mode of ['author', 'convert', 'repair', 'review'] as const) {
    it(`keeps the serialized ${mode} payload free of approve/accept/merge`, () => {
      const file = mode === 'repair' || mode === 'review' ? 'broken.md' : KIRO_DOC;
      const cwd = mode === 'repair' || mode === 'review' ? tmpDir : FIXTURES;
      const result = runInstructions({ mode, file, profile: 'kiro', json: true, cwd });
      expect(serialize(result.response)).not.toMatch(ACCEPT_LANGUAGE);
    });
  }

  it('review states the assessment is read-only and defers to a human', () => {
    const result = runInstructions({
      mode: 'review',
      file: 'broken.md',
      profile: 'kiro',
      json: true,
      cwd: tmpDir,
    });
    const rules = result.response.rules as string[];
    expect(rules.some((rule) => rule.includes('read-only'))).toBe(true);
    expect(rules.some((rule) => rule.includes('leave that decision to the human'))).toBe(true);
    // Review embeds findings but never edits: the edit policy still names the file
    // editable only for the writing modes; review rules make no edit claim.
    expect(rules.some((rule) => rule.includes('make no change to the host file'))).toBe(true);
  });
});

describe('instructions locator and dialect are derived from profile data', () => {
  it('renders the kiro locator summary from the profile note', () => {
    const result = runInstructions({ mode: 'author', file: KIRO_DOC, profile: 'kiro', json: true });
    expect(result.response.locator).toEqual({
      documentKinds: ['markdown'],
      summary:
        'Bullet and numbered items under #### Acceptance Criteria headings in requirements.md.',
    });
  });

  it('renders a fallback every-line summary for strict', () => {
    const result = runInstructions({
      mode: 'author',
      file: 'strict/valid.ears',
      profile: 'strict',
      json: true,
    });
    expect(result.response.locator).toEqual({
      documentKinds: ['ears', 'text'],
      summary: 'Every non-empty line of ears, text files.',
    });
  });

  it('projects the dialect in the facade key order', () => {
    const result = runInstructions({ mode: 'author', file: KIRO_DOC, profile: 'kiro', json: true });
    expect(Object.keys(result.response.dialect as object)).toEqual([
      'keywordCase',
      'commaAfterLeadingClause',
      'allowLiteralSystemName',
      'allowStoryWrapper',
      'allowFrameMetadata',
      'allowProhibition',
    ]);
    expect(result.response.dialect).toEqual({
      keywordCase: 'case-insensitive',
      commaAfterLeadingClause: 'optional',
      allowLiteralSystemName: ['THE SYSTEM'],
      allowStoryWrapper: true,
      allowFrameMetadata: false,
      allowProhibition: false,
    });
  });
});

describe('instructions next action', () => {
  it('points at validate with the matching profile and --json', () => {
    const result = runInstructions({
      mode: 'repair',
      file: 'broken.md',
      profile: 'kiro',
      json: true,
      cwd: tmpDir,
    });
    expect(result.response.next).toEqual([
      {
        command: 'earsyntax validate broken.md --profile kiro --json',
        reason:
          'Validate the host file after editing and repeat until no error-severity finding remains.',
        forAgent: true,
      },
    ]);
  });
});

describe('instructions file-existence policy by mode', () => {
  it('requires the host file for repair (missing => exit 2)', () => {
    expectUsageError(
      () => runInstructions({ mode: 'repair', file: 'nope.md', profile: 'kiro', json: true }),
      'instructions.missing_file',
    );
  });

  it('requires the host file for review (missing => exit 2)', () => {
    expectUsageError(
      () => runInstructions({ mode: 'review', file: 'nope.md', profile: 'kiro', json: true }),
      'instructions.missing_file',
    );
  });

  it('requires the host file for convert without a source (missing => exit 2)', () => {
    expectUsageError(
      () => runInstructions({ mode: 'convert', file: 'nope.md', profile: 'kiro', json: true }),
      'instructions.missing_file',
    );
  });

  it('allows a not-yet-existing host file for author', () => {
    const result = runInstructions({
      mode: 'author',
      file: 'brand/new.md',
      profile: 'kiro',
      json: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.response.file).toBe('brand/new.md');
  });

  it('allows a not-yet-existing host file for convert with a source', () => {
    const result = runInstructions({
      mode: 'convert',
      file: 'brand/new.md',
      from: KIRO_DOC,
      profile: 'kiro',
      json: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.response.sourceFile).toBe(KIRO_DOC);
  });
});

describe('instructions usage and envelope errors', () => {
  it('exits 2 when the mode is missing', () => {
    expectUsageError(
      () => runInstructions({ file: 'x.md', json: true }),
      'instructions.missing_mode',
    );
  });

  it('exits 2 on an unknown mode', () => {
    expectUsageError(
      () => runInstructions({ mode: 'frobnicate', file: 'x.md', json: true }),
      'instructions.unknown_mode',
    );
  });

  it('exits 2 when --file is absent', () => {
    expectUsageError(
      () => runInstructions({ mode: 'author', json: true }),
      'instructions.missing_file_flag',
    );
  });

  it('exits 2 on an unknown profile', () => {
    expectUsageError(
      () => runInstructions({ mode: 'author', file: 'x.md', profile: 'nope', json: true }),
      'cli.unknown_profile',
    );
  });
});

describe('instructions output purity and pretty rendering', () => {
  it('serializes to valid JSON with no undefined leakage', () => {
    const result = runInstructions({
      mode: 'repair',
      file: 'broken.md',
      profile: 'kiro',
      json: true,
      cwd: tmpDir,
    });
    const text = serialize(result.response);
    expect(text).not.toContain('undefined');
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('renders a human summary in pretty mode and blanks it under --quiet', () => {
    const pretty = runInstructions({ mode: 'author', file: KIRO_DOC, profile: 'kiro' });
    expect(pretty.pretty).toContain('instructions author for kiro/requirements.md (profile kiro)');
    expect(pretty.pretty).toContain('locator:');

    const quiet = runInstructions({ mode: 'author', file: KIRO_DOC, profile: 'kiro', quiet: true });
    expect(quiet.pretty).toBe('');
  });
});
