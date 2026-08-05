import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { execute, type ExecuteOptions, type FacadeResponse } from '@earsyntax/cli';
import { DIAGNOSTIC_REGISTRY, type DiagnosticRegistryEntry } from '@earsyntax/core';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const TEMP_DIRS: string[] = [];

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

const FORBIDDEN_WORKSPACE_WORDS = ['new', 'list', 'status', 'show', 'accept', 'check'];
const FORBIDDEN_WORKSPACE_FLAGS = ['--tools', '--work'];

function fixture(path: string): string {
  return join(REPO_ROOT, path);
}

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  TEMP_DIRS.push(dir);
  return dir;
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

interface JsonRun {
  exitCode: number;
  stdout: string;
  json: FacadeResponse;
}

function runJson(args: string[], options: ExecuteOptions = {}): JsonRun {
  const jsonArgs = args.includes('--json') ? args : [...args, '--json'];
  const result = execute(jsonArgs, options);
  expect(result.json).toBeDefined();
  return { exitCode: result.exitCode, stdout: result.stdout, json: result.json! };
}

function objectAt(value: unknown): Record<string, unknown> {
  expect(typeof value).toBe('object');
  expect(value).not.toBeNull();
  return value as Record<string, unknown>;
}

function arrayAt(value: unknown): unknown[] {
  expect(Array.isArray(value)).toBe(true);
  return value as unknown[];
}

function findingsSummary(json: FacadeResponse): Record<string, unknown> {
  return objectAt(objectAt(json.findings).summary);
}

function candidates(json: FacadeResponse): Record<string, unknown>[] {
  return arrayAt(json.candidates).map(objectAt);
}

afterAll(() => {
  for (const dir of TEMP_DIRS) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('business case: run-this-first validation', () => {
  it('validates a single stdin requirement in an empty directory without creating a workspace', () => {
    const cwd = tempDir('earsyntax-e2e-empty-');
    const result = execute(['validate', '-', '--profile', 'strict'], {
      cwd,
      stdin: 'The billing service shall verify the HMAC signature.\n',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1/1 valid across 1 file(s), 0 error(s), 0 warning(s)');
    expect(readdirSync(cwd)).toEqual([]);
  });
});

describe('business case: plain EARS validation for CI', () => {
  it('returns a clean JSON findings envelope for valid strict input', () => {
    const { exitCode, json } = runJson([
      'validate',
      fixture('fixtures/profiles/strict/valid.ears'),
      '--profile',
      'strict',
    ]);

    expect(exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(findingsSummary(json).errors).toBe(0);
  });

  it('returns exit 1 and a repair next action for invalid strict input', () => {
    const { exitCode, json } = runJson([
      'validate',
      fixture('fixtures/profiles/strict/invalid.ears'),
      '--profile',
      'strict',
    ]);

    expect(exitCode).toBe(1);
    expect(json.ok).toBe(false);
    expect(Number(findingsSummary(json).errors)).toBeGreaterThan(0);
    expect(arrayAt(json.next).at(0)).toMatchObject({
      forAgent: true,
      reason: 'Get repair rules for the reported diagnostics.',
    });
  });
});

describe('business case: strict warning gate', () => {
  it('allows warning-only requirements by default and fails them under validate --strict', () => {
    const cwd = tempDir('earsyntax-e2e-warning-');
    writeFile(join(cwd, 'warning.ears'), 'The system shall respond appropriately.\n');

    const normal = runJson(['validate', 'warning.ears', '--profile', 'strict'], { cwd });
    expect(normal.exitCode).toBe(0);
    expect(findingsSummary(normal.json).warnings).toBe(1);

    const strict = runJson(['validate', 'warning.ears', '--profile', 'strict', '--strict'], {
      cwd,
    });
    expect(strict.exitCode).toBe(1);
    expect(findingsSummary(strict.json).errors).toBe(1);
  });
});

describe('business case: choose the right profile for the input', () => {
  it.each([
    ['strict', 'fixtures/profiles/strict/valid.ears'],
    ['ears-x', 'fixtures/profiles/ears-x/prohibition.ears'],
    ['ears-x', 'fixtures/profiles/ears-x/frame-metadata.ears'],
    ['kiro', 'fixtures/profiles/kiro/requirements.md'],
    ['speckit', 'fixtures/profiles/speckit/spec.md'],
    ['openspec', 'fixtures/profiles/openspec/spec.md'],
  ])('validates %s fixture %s cleanly', (profile, path) => {
    const { exitCode, json } = runJson(['validate', fixture(path), '--profile', profile]);
    expect(exitCode).toBe(0);
    expect(json.ok).toBe(true);
  });

  it('keeps strict Markdown-blind for files but lints stdin as plain input', () => {
    const kiroMarkdown = fixture('fixtures/profiles/kiro/requirements.md');

    const markdownFile = runJson(['validate', kiroMarkdown, '--profile', 'strict']);
    expect(markdownFile.exitCode).toBe(0);
    expect(findingsSummary(markdownFile.json).requirements).toBe(0);

    const stdinText = runJson(['validate', '-', '--profile', 'strict'], {
      stdin: readFileSync(kiroMarkdown, 'utf8'),
    });
    expect(stdinText.exitCode).toBe(1);
    expect(Number(findingsSummary(stdinText.json).errors)).toBeGreaterThan(0);
  });
});

describe('business case: extraction explains validation scope', () => {
  it('rejects duplicate stdin inputs deterministically', () => {
    const { exitCode, json } = runJson(['extract', '-', '-', '--profile', 'strict'], {
      stdin: 'The system shall respond.\n',
    });

    expect(exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(objectAt(arrayAt(json.diagnostics).at(0)).code).toBe('extract.duplicate_stdin');
  });

  it('shows Kiro acceptance-criteria candidates', () => {
    const { exitCode, json } = runJson([
      'extract',
      fixture('fixtures/profiles/kiro/requirements.md'),
      '--profile',
      'kiro',
    ]);

    expect(exitCode).toBe(0);
    expect(candidates(json)).toHaveLength(9);
    expect(candidates(json).at(0)).toMatchObject({
      profile: 'kiro',
      locatorRuleId: 'kiro.acceptance-criteria-item',
    });
  });

  it('strips Spec Kit FR labels into requirement ids', () => {
    const { exitCode, json } = runJson([
      'extract',
      fixture('fixtures/profiles/speckit/spec.md'),
      '--profile',
      'speckit',
    ]);

    expect(exitCode).toBe(0);
    expect(candidates(json).at(0)).toMatchObject({
      requirementId: 'FR-001',
      text: 'The system shall allow a workspace owner to invite a teammate by email address.',
    });
  });

  it('extracts OpenSpec requirement statements and skips ordinary Gherkin steps', () => {
    const { exitCode, json } = runJson([
      'extract',
      fixture('fixtures/profiles/openspec/spec.md'),
      '--profile',
      'openspec',
    ]);

    const texts = candidates(json).map((candidate) => String(candidate.text));
    expect(exitCode).toBe(0);
    expect(texts).toHaveLength(5);
    expect(texts.some((text) => text.startsWith('**WHEN**'))).toBe(false);
    expect(texts.every((text) => /\bshall\b/i.test(text))).toBe(true);
  });
});

describe('business case: SARIF for code scanning', () => {
  it('emits raw SARIF and keeps the findings-driven exit code', () => {
    const result = execute([
      'validate',
      fixture('fixtures/profiles/strict/invalid.ears'),
      '--profile',
      'strict',
      '--sarif',
    ]);
    const sarif = JSON.parse(result.stdout) as Record<string, unknown>;

    expect(result.exitCode).toBe(1);
    expect(result.json).toBeUndefined();
    expect(sarif.version).toBe('2.1.0');
    expect(arrayAt(sarif.runs)).toHaveLength(1);
  });
});

describe('business case: agent instructions loop', () => {
  it('returns author and convert rules with explicit editable and read-only file roles', () => {
    const cwd = tempDir('earsyntax-e2e-instructions-');
    const source = join(cwd, 'docs', 'checkout-intent.md');
    writeFile(source, 'Checkout must verify payment webhooks before creating paid orders.\n');

    const target = '.kiro/specs/checkout/requirements.md';
    for (const mode of ['author', 'convert']) {
      const { exitCode, json } = runJson(
        [
          'instructions',
          mode,
          '--file',
          target,
          '--from',
          'docs/checkout-intent.md',
          '--profile',
          'kiro',
        ],
        { cwd },
      );

      expect(exitCode).toBe(0);
      expect(json.ok).toBe(true);
      expect(json.sourceFile).toBe('docs/checkout-intent.md');
      expect(json.sourcePolicy).toBe('read-only');
      expect(objectAt(json.editPolicy).editableFile).toBe(target);
      expect(json.outputPolicy).toBe('edit-in-place');
      expect(readFileSync(source, 'utf8')).toContain('Checkout must verify');
    }
  });

  it('recomputes findings from --file for repair and review', () => {
    const cwd = tempDir('earsyntax-e2e-repair-');
    const target = join(cwd, '.kiro', 'specs', 'checkout', 'requirements.md');
    writeFile(
      target,
      [
        '# Requirements Document',
        '',
        '#### Acceptance Criteria',
        '',
        '1. WHEN a shopper submits payment details THE SYSTEM creates a paid order.',
        '',
      ].join('\n'),
    );

    const repair = runJson(
      [
        'instructions',
        'repair',
        '--file',
        '.kiro/specs/checkout/requirements.md',
        '--profile',
        'kiro',
      ],
      { cwd },
    );
    expect(repair.exitCode).toBe(0);
    expect(Number(findingsSummary(repair.json).errors)).toBeGreaterThan(0);
    expect(arrayAt(repair.json.rules).join('\n')).toContain('EARS-E007');

    const review = runJson(
      [
        'instructions',
        'review',
        '--file',
        '.kiro/specs/checkout/requirements.md',
        '--profile',
        'kiro',
      ],
      { cwd },
    );
    expect(review.exitCode).toBe(0);
    expect(Number(findingsSummary(review.json).errors)).toBeGreaterThan(0);
    expect(arrayAt(review.json.rules).join('\n')).toContain('read-only');
  });
});

describe('business case: doctor and init host-native integrations', () => {
  it('detects hosts and agents and recommends runnable commands', () => {
    const { exitCode, json } = runJson(['doctor', '--cwd', fixture('fixtures/host-repos/multi')]);

    const detected = objectAt(json.detected);
    const hosts = arrayAt(detected.hosts).map((entry) => String(objectAt(entry).host));
    const agents = arrayAt(detected.agents).map((entry) => String(objectAt(entry).agent));

    expect(exitCode).toBe(0);
    expect(hosts).toEqual(['kiro', 'speckit', 'openspec']);
    expect(agents).toEqual(['claude', 'codex', 'cursor', 'copilot', 'gemini']);
    expect(arrayAt(json.next).map((entry) => String(objectAt(entry).command))).toContain(
      'earsyntax init --agent claude,codex,cursor,copilot,gemini --host kiro,speckit,openspec',
    );
  });

  it('renders integration files idempotently without creating .earsyntax or editing specs', () => {
    const cwd = tempDir('earsyntax-e2e-init-');
    const spec = join(cwd, '.kiro', 'specs', 'checkout', 'requirements.md');
    writeFile(
      spec,
      [
        '# Requirements Document',
        '',
        '#### Acceptance Criteria',
        '',
        '1. THE SYSTEM SHALL preserve this requirement.',
        '',
      ].join('\n'),
    );

    const first = runJson(
      ['init', '--agent', 'claude,codex,cursor,copilot,gemini', '--host', 'kiro,speckit,openspec'],
      { cwd },
    );
    const second = runJson(
      ['init', '--agent', 'claude,codex,cursor,copilot,gemini', '--host', 'kiro,speckit,openspec'],
      { cwd },
    );

    expect(first.exitCode).toBe(0);
    expect(arrayAt(first.json.written)).toEqual([
      '.claude/commands/earsyntax-author.md',
      '.claude/commands/earsyntax-convert.md',
      '.claude/commands/earsyntax-repair.md',
      '.claude/commands/earsyntax-review.md',
      '.cursor/rules/earsyntax.mdc',
      '.github/prompts/earsyntax.prompt.md',
      '.kiro/hooks/ears-validate.yaml',
      '.kiro/steering/earsyntax.md',
      '.specify/extensions/earsyntax.md',
      'AGENTS.md',
      'GEMINI.md',
    ]);
    expect(second.exitCode).toBe(0);
    expect(second.json.written).toEqual([]);
    expect(arrayAt(second.json.skipped)).toHaveLength(arrayAt(first.json.written).length);
    expect(existsSync(join(cwd, '.earsyntax'))).toBe(false);
    expect(readFileSync(spec, 'utf8')).toContain('preserve this requirement');
  });
});

describe('business case: capability and diagnostic discovery', () => {
  it('reports the closed facade surface and omits removed workspace commands', () => {
    const features = runJson(['version', '--features']);
    expect(objectAt(features.json.features).commands).toEqual(FACADE_COMMANDS);
    expect(objectAt(features.json.features).profiles).toEqual([
      'strict',
      'ears-x',
      'kiro',
      'speckit',
      'openspec',
    ]);

    const profiles = runJson(['profiles']);
    expect(arrayAt(profiles.json.profiles)).toHaveLength(5);

    const help = execute(['--help']);
    expect(help.exitCode).toBe(0);
    for (const word of FORBIDDEN_WORKSPACE_WORDS) {
      expect(new RegExp(`\\b${word}\\b`).test(help.stdout)).toBe(false);
    }
    for (const flag of FORBIDDEN_WORKSPACE_FLAGS) {
      expect(help.stdout).not.toContain(flag);
    }
  });

  it('does not throw when --json appears on a pretty-output shortcut path', () => {
    expect(() => execute(['--help', '--json'])).not.toThrow();

    const help = execute(['--help', '--json']);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain('earsyntax <command> [options]');
    expect(help.json).toBeUndefined();
  });

  it('explains every current diagnostic id and deprecated alias through the public facade', () => {
    const entries: readonly DiagnosticRegistryEntry[] = DIAGNOSTIC_REGISTRY;
    for (const entry of entries) {
      const current = runJson(['explain', entry.id]);
      expect(current.exitCode).toBe(0);
      expect(current.json.id).toBe(entry.id);

      const alias = runJson(['explain', entry.oldCode]);
      expect(alias.exitCode).toBe(0);
      expect(alias.json.id).toBe(entry.id);
      expect(alias.json.alias).toBe(true);
      expect(String(alias.json.deprecationNote)).toContain('deprecated alias');
    }
  });

  it('returns exit 2 with suggestions for an unknown diagnostic id', () => {
    const { exitCode, json } = runJson(['explain', 'EARS-E999']);
    expect(exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(String(objectAt(arrayAt(json.diagnostics).at(0)).message)).toContain('Did you mean');
  });
});
