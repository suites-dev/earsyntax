/**
 * End-to-end facade tests.
 *
 * Each test drives `run(argv, { cwd })` against a temp project directory and
 * captures stdout, exercising the full loop: init -> new -> instructions ->
 * agent-simulated write -> validate -> status -> accept, plus staleness,
 * refusals, and exit codes. JSON responses are compared structurally to the
 * golden fixtures in `fixtures/facade/` (values that vary by run are ignored).
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { run } from './cli.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const DEMO = resolve(REPO_ROOT, 'fixtures', 'demo');
const DEMO_REQUIREMENTS = resolve(DEMO, 'requirements.ears');
const DEMO_VALID_ONLY = resolve(DEMO, 'valid-only.ears');
const DEMO_CATALOG = resolve(DEMO, 'catalog.json');

interface RunResult {
  code: number;
  out: string;
  json: () => Record<string, unknown>;
}

function makeRunner(cwd: string) {
  return (...argv: string[]): RunResult => {
    let out = '';
    const code = run(argv, { cwd, stdout: (s) => (out += s) });
    return { code, out, json: () => JSON.parse(out) as Record<string, unknown> };
  };
}

function tempProject(): string {
  // Directories are left in the OS temp dir; the OS reclaims them.
  return mkdtempSync(join(tmpdir(), 'earsyntax-cli-'));
}

const SOURCE_MD = [
  '# Checkout webhooks',
  '',
  'When a payment webhook is received, the billing service must verify the HMAC signature.',
  'If the HMAC signature is invalid, the webhook must be rejected.',
  '',
].join('\n');

describe('version', () => {
  it('reports features as JSON', () => {
    const r = makeRunner(tempProject());
    const res = r('version', '--features', '--json');
    expect(res.code).toBe(0);
    const body = res.json();
    expect(body.command).toBe('version');
    expect(body.ok).toBe(true);
    expect(body.next).toEqual([]);
    const features = body.features as Record<string, unknown>;
    expect(features.facade).toBe(1);
    expect(features.instructions).toEqual(['author', 'convert', 'repair', 'review']);
    expect(features.sarif).toBe(false);
  });
});

describe('init', () => {
  it('writes the workspace and refuses to overwrite without --force', () => {
    const cwd = tempProject();
    const r = makeRunner(cwd);

    const first = r('init', '--json');
    expect(first.code).toBe(0);
    const body = first.json();
    expect(body.ok).toBe(true);
    expect(body.written).toEqual(['.earsyntax/config.json', '.earsyntax/work/.gitkeep']);
    expect(typeof body.root).toBe('string');

    const again = r('init', '--json');
    expect(again.code).toBe(3);
    const failure = again.json();
    expect(failure.ok).toBe(false);
    const diags = failure.diagnostics as { code: string }[];
    expect(diags[0]?.code).toBe('init.exists');

    const forced = r('init', '--force', '--json');
    expect(forced.code).toBe(0);
  });

  it('writes tool wrappers for --tools claude', () => {
    const cwd = tempProject();
    const r = makeRunner(cwd);
    const res = r('init', '--tools', 'claude', '--json');
    expect(res.code).toBe(0);
    const body = res.json();
    expect(body.tools).toEqual(['claude']);
    const written = body.written as string[];
    expect(written).toContain('.claude/commands/earsyntax-author.md');
    expect(written).toContain('.claude/commands/earsyntax-convert.md');
    expect(written).toContain('.claude/commands/earsyntax-repair.md');
  });

  it('rejects an unknown tool with exit 2', () => {
    const r = makeRunner(tempProject());
    const res = r('init', '--tools', 'bogus', '--json');
    expect(res.code).toBe(2);
    expect((res.json().diagnostics as { code: string }[])[0]?.code).toBe('init.bad_tools');
  });
});

describe('convert loop (happy path)', () => {
  it('runs new -> instructions -> write -> validate -> status -> accept', () => {
    const cwd = tempProject();
    const r = makeRunner(cwd);
    writeFileSync(join(cwd, 'source.md'), SOURCE_MD);

    r('init', '--json');

    const createdRes = r(
      'new',
      'checkout-webhooks',
      '--source',
      'source.md',
      '--mode',
      'convert',
      '--json',
    );
    expect(createdRes.code).toBe(0);
    const newBody = createdRes.json();
    const work = newBody.work as Record<string, unknown>;
    expect(work.id).toBe('checkout-webhooks');
    expect(work.mode).toBe('convert');
    expect(work.status).toBe('scaffolded');
    expect(String(work.sourceHash)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(newBody.written).toContain('.earsyntax/work/checkout-webhooks/manifest.json');

    const instr = r('instructions', 'convert', '--work', 'checkout-webhooks', '--json');
    expect(instr.code).toBe(0);
    const instrBody = instr.json();
    expect(instrBody.command).toBe('instructions convert');
    expect(instrBody.mode).toBe('convert');
    expect((instrBody.rules as string[]).length).toBeGreaterThan(0);
    const format = instrBody.format as Record<string, unknown>;
    expect((format.allowedPatterns as string[]).length).toBe(5);
    expect((format.metadataPrefixes as string[]).length).toBe(3);
    const source = instrBody.source as Record<string, unknown>;
    expect(source.path).toBe('source.md');
    expect(Array.isArray(source.excerpts)).toBe(true);
    const next = instrBody.next as { command: string }[];
    expect(next[0]?.command).toContain('earsyntax validate');

    // Agent writes valid .ears content into the reserved output path.
    const outPath = join(cwd, '.earsyntax', 'work', 'checkout-webhooks', 'requirements.ears');
    writeFileSync(outPath, readFileSync(DEMO_VALID_ONLY, 'utf8'));

    const validated = r(
      'validate',
      '.earsyntax/work/checkout-webhooks/requirements.ears',
      '--source',
      'source.md',
      '--work',
      'checkout-webhooks',
      '--json',
    );
    expect(validated.code).toBe(0);
    const vBody = validated.json();
    expect(vBody.ok).toBe(true);
    const summary = vBody.summary as Record<string, number>;
    expect(summary.errors).toBe(0);
    expect((vBody.work as Record<string, unknown>).status).toBe('valid');
    expect(vBody.stale).toBe(false);

    const status = r('status', 'checkout-webhooks', '--json');
    expect(status.code).toBe(0);
    expect((status.json().work as Record<string, unknown>).status).toBe('valid');

    const accepted = r('accept', 'checkout-webhooks', '--by', 'omer', '--json');
    expect(accepted.code).toBe(0);
    const aWork = accepted.json().work as Record<string, unknown>;
    expect(aWork.status).toBe('accepted');
    const acceptedBlock = aWork.accepted as Record<string, unknown>;
    expect(acceptedBlock.by).toBe('omer');
    expect(String(acceptedBlock.outputHash)).toMatch(/^sha256:/);
  });
});

describe('invalid content and repair', () => {
  it('validate exits 1 and repair surfaces diagnostics; accept refuses invalid', () => {
    const cwd = tempProject();
    const r = makeRunner(cwd);
    writeFileSync(join(cwd, 'source.md'), SOURCE_MD);
    r('init', '--json');
    r('new', 'checkout-webhooks', '--source', 'source.md', '--mode', 'convert', '--json');

    const outPath = join(cwd, '.earsyntax', 'work', 'checkout-webhooks', 'requirements.ears');
    writeFileSync(outPath, readFileSync(DEMO_REQUIREMENTS, 'utf8'));

    const validated = r(
      'validate',
      '.earsyntax/work/checkout-webhooks/requirements.ears',
      '--work',
      'checkout-webhooks',
      '--json',
    );
    expect(validated.code).toBe(1);
    const vBody = validated.json();
    expect(vBody.ok).toBe(false);
    expect((vBody.summary as Record<string, number>).errors).toBeGreaterThan(0);
    expect((vBody.work as Record<string, unknown>).status).toBe('invalid');

    const repair = r('instructions', 'repair', '--work', 'checkout-webhooks', '--json');
    expect(repair.code).toBe(0);
    const diagnostics = repair.json().diagnostics as { code: string }[];
    expect(diagnostics.length).toBeGreaterThan(0);

    const accept = r('accept', 'checkout-webhooks', '--json');
    expect(accept.code).toBe(3);
    expect((accept.json().diagnostics as { code: string }[])[0]?.code).toBe('accept.not_valid');
  });
});

describe('validate standalone files', () => {
  it('exits 1 on the demo requirements with invalid lines', () => {
    const r = makeRunner(tempProject());
    const res = r('validate', DEMO_REQUIREMENTS, '--json');
    expect(res.code).toBe(1);
    expect((res.json().summary as Record<string, number>).errors).toBeGreaterThan(0);
  });

  it('exits 0 on the valid-only demo', () => {
    const r = makeRunner(tempProject());
    const res = r('validate', DEMO_VALID_ONLY, '--json');
    expect(res.code).toBe(0);
    expect((res.json().summary as Record<string, number>).errors).toBe(0);
  });

  it('exits 2 on a missing file', () => {
    const r = makeRunner(tempProject());
    const res = r('validate', 'does-not-exist.ears', '--json');
    expect(res.code).toBe(2);
    expect((res.json().diagnostics as { code: string }[])[0]?.code).toBe('validate.missing_file');
  });

  it('accepts a catalog', () => {
    const r = makeRunner(tempProject());
    const res = r('validate', DEMO_VALID_ONLY, '--catalog', DEMO_CATALOG, '--json');
    expect(res.code).toBe(0);
    const body = res.json();
    expect((body.summary as Record<string, number>).errors).toBe(0);
    expect(Array.isArray(body.results)).toBe(true);
  });

  it('flags duplicate IDs as a facade error', () => {
    const cwd = tempProject();
    const dupPath = join(cwd, 'dup.ears');
    writeFileSync(
      dupPath,
      [
        'REQ-001: The billing service shall verify the HMAC signature of every incoming webhook.',
        'REQ-001: The billing service shall retry failed webhook deliveries up to five times.',
      ].join('\n'),
    );
    const r = makeRunner(cwd);
    const res = r('validate', 'dup.ears', '--json');
    expect(res.code).toBe(1);
    const diags = res.json().diagnostics as { code: string }[];
    expect(diags.some((d) => d.code === 'facade.duplicate_id')).toBe(true);
  });
});

describe('staleness', () => {
  it('reports stale after the source changes and accept refuses it', () => {
    const cwd = tempProject();
    const r = makeRunner(cwd);
    const sourcePath = join(cwd, 'source.md');
    writeFileSync(sourcePath, SOURCE_MD);
    r('init', '--json');
    r('new', 'checkout-webhooks', '--source', 'source.md', '--mode', 'convert', '--json');

    const outPath = join(cwd, '.earsyntax', 'work', 'checkout-webhooks', 'requirements.ears');
    writeFileSync(outPath, readFileSync(DEMO_VALID_ONLY, 'utf8'));

    const first = r(
      'validate',
      '.earsyntax/work/checkout-webhooks/requirements.ears',
      '--source',
      'source.md',
      '--work',
      'checkout-webhooks',
      '--json',
    );
    expect(first.code).toBe(0);
    expect(first.json().stale).toBe(false);

    // The source drifts.
    writeFileSync(sourcePath, `${SOURCE_MD}\nWhile the provider is unavailable, queue events.\n`);

    const second = r(
      'validate',
      '.earsyntax/work/checkout-webhooks/requirements.ears',
      '--source',
      'source.md',
      '--work',
      'checkout-webhooks',
      '--json',
    );
    expect(second.code).toBe(0);
    expect(second.json().stale).toBe(true);

    const status = r('status', 'checkout-webhooks', '--json');
    expect((status.json().work as Record<string, unknown>).status).toBe('stale');

    const accept = r('accept', 'checkout-webhooks', '--json');
    expect(accept.code).toBe(3);
    expect((accept.json().diagnostics as { code: string }[])[0]?.code).toBe('accept.stale');
  });
});

describe('metadata-prefix requirements', () => {
  it('validates a work item whose .ears uses the [source: path:line] form', () => {
    const cwd = tempProject();
    const r = makeRunner(cwd);
    writeFileSync(join(cwd, 'source.md'), SOURCE_MD);
    r('init', '--json');
    r('new', 'checkout-webhooks', '--source', 'source.md', '--mode', 'convert', '--json');

    // The agent writes requirements using the documented metadata prefix,
    // including the range form. The declared ref, not the physical line,
    // becomes the reported source line.
    const outPath = join(cwd, '.earsyntax', 'work', 'checkout-webhooks', 'requirements.ears');
    writeFileSync(
      outPath,
      [
        'REQ-001 [source: source.md:7]: When a payment webhook is received, the billing service shall verify the HMAC signature.',
        'REQ-002 [source: source.md:10-11]: If the HMAC signature is invalid, then the billing service shall reject the webhook.',
        '',
      ].join('\n'),
    );

    const res = r(
      'validate',
      '.earsyntax/work/checkout-webhooks/requirements.ears',
      '--source',
      'source.md',
      '--work',
      'checkout-webhooks',
      '--json',
    );
    expect(res.code).toBe(0);
    const body = res.json();
    expect((body.summary as Record<string, number>).errors).toBe(0);
    expect((body.work as Record<string, unknown>).status).toBe('valid');
    const results = body.results as { id?: string; line?: number; valid: boolean }[];
    expect(results[0]?.id).toBe('REQ-001');
    expect(results[0]?.line).toBe(7);
    expect(results[0]?.valid).toBe(true);
    expect(results[1]?.id).toBe('REQ-002');
    expect(results[1]?.line).toBe(10);
    expect(results[1]?.valid).toBe(true);
  });
});

describe('new refusals', () => {
  it('refuses a duplicate slug without --force', () => {
    const cwd = tempProject();
    const r = makeRunner(cwd);
    writeFileSync(join(cwd, 'source.md'), SOURCE_MD);
    r('init', '--json');
    expect(r('new', 'dup-item', '--source', 'source.md', '--json').code).toBe(0);
    const again = r('new', 'dup-item', '--source', 'source.md', '--json');
    expect(again.code).toBe(3);
    expect((again.json().diagnostics as { code: string }[])[0]?.code).toBe('new.exists');
  });
});
