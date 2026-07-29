import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractFromContent, extractFromFile } from './dispatch.js';

describe('extractFromContent', () => {
  it('routes .ears content to the ears extractor', () => {
    const { items } = extractFromContent(
      'REQ-001: The billing service shall verify signatures.',
      'requirements.ears',
    );
    expect(items).toEqual([
      {
        id: 'REQ-001',
        text: 'The billing service shall verify signatures.',
        source: { file: 'requirements.ears', line: 1 },
      },
    ]);
  });

  it('routes .md and .markdown content to the markdown extractor', () => {
    const bullet = '- REQ-001: The billing service shall verify signatures.';
    expect(extractFromContent(bullet, 'reqs.md').items[0].id).toBe('REQ-001');
    expect(extractFromContent(bullet, 'reqs.markdown').items[0].id).toBe('REQ-001');
  });

  it('routes .yaml and .yml content to the yaml extractor', () => {
    const yaml =
      'requirements:\n  - id: REQ-001\n    text: The billing service shall verify signatures.\n';
    expect(extractFromContent(yaml, 'reqs.yaml').items[0].id).toBe('REQ-001');
    expect(extractFromContent(yaml, 'reqs.yml').items[0].id).toBe('REQ-001');
  });

  it('routes .json content to the json extractor', () => {
    const json =
      '{ "requirements": [ { "id": "REQ-001", "text": "The billing service shall verify signatures." } ] }';
    expect(extractFromContent(json, 'reqs.json').items[0].id).toBe('REQ-001');
  });

  it('reports an error for an unsupported extension', () => {
    const { items, errors } = extractFromContent('anything', 'notes.txt');
    expect(items).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Unsupported file extension');
    expect(errors[0].file).toBe('notes.txt');
  });
});

describe('extractFromFile', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'earsyntax-extract-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads a file from disk and extracts by extension', () => {
    const path = join(dir, 'requirements.ears');
    writeFileSync(path, 'REQ-001: The billing service shall verify signatures.\n', 'utf8');

    const { items, errors } = extractFromFile(path);

    expect(errors).toEqual([]);
    expect(items).toEqual([
      {
        id: 'REQ-001',
        text: 'The billing service shall verify signatures.',
        source: { file: path, line: 1 },
      },
    ]);
  });

  it('reports a read error for a missing file rather than throwing', () => {
    const path = join(dir, 'does-not-exist.ears');

    const { items, errors } = extractFromFile(path);

    expect(items).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Could not read file');
    expect(errors[0].file).toBe(path);
  });
});
