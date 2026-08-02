/**
 * Tests for the host-native pipeline entry: {@link runPipeline},
 * {@link extractCandidates}, kind inference, and the notice channel for
 * malformed structured input.
 */

import { BUILTIN_PROFILES } from '@earsyntax/core';
import { describe, expect, it } from 'vitest';
import { extractCandidates, inferKind, runPipeline } from './pipeline.js';

const strict = BUILTIN_PROFILES.strict;

describe('runPipeline', () => {
  it('validates a clean requirement from stdin content (path "-")', () => {
    const { findings, notices } = runPipeline({
      files: [
        {
          path: '-',
          content:
            'When a payment webhook arrives, the billing service shall verify the signature.',
        },
      ],
      profile: strict,
    });
    expect(notices).toHaveLength(0);
    expect(findings.ok).toBe(true);
    expect(findings.summary).toMatchObject({ files: 1, requirements: 1, valid: 1, errors: 0 });
  });

  it('returns an error finding for a malformed requirement', () => {
    const { findings } = runPipeline({
      files: [{ path: 'r.ears', content: 'This is not a requirement at all.' }],
      profile: strict,
    });
    expect(findings.ok).toBe(false);
    expect(findings.diagnostics[0]).toMatchObject({ id: 'EARS-E010', file: 'r.ears', line: 1 });
  });

  it('counts a file with no candidates and never throws on malformed YAML', () => {
    const { findings, notices } = runPipeline({
      files: [{ path: 'bad.yaml', content: 'requirements:\n  - text: "unterminated' }],
      profile: strict,
    });
    expect(findings.summary.files).toBe(1);
    expect(findings.summary.requirements).toBe(0);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      code: 'extract.malformed_yaml',
      severity: 'error',
      file: 'bad.yaml',
    });
  });
});

describe('extractCandidates', () => {
  it('extracts structured YAML requirements with a synthetic locator rule id', () => {
    const content = ['requirements:', '  - id: REQ-001', '    text: The system shall stop.'].join(
      '\n',
    );
    const { candidates } = extractCandidates({
      files: [{ path: 'r.yaml', content }],
      profile: strict,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      file: 'r.yaml',
      requirementId: 'REQ-001',
      text: 'The system shall stop.',
      locatorRuleId: 'structured.yaml',
      profile: 'strict',
    });
    expect(candidates[0].line).toBeGreaterThan(0);
  });

  it('strips a leading BOM before parsing JSON', () => {
    const json = '﻿{"requirements":[{"id":"REQ-001","text":"The system shall stop."}]}';
    const { candidates, notices } = extractCandidates({
      files: [{ path: 'r.json', content: json }],
      profile: strict,
    });
    expect(notices).toHaveLength(0);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].requirementId).toBe('REQ-001');
  });

  it('flattens candidates across multiple files in order', () => {
    const { candidates } = extractCandidates({
      files: [
        { path: 'a.ears', content: 'The system shall stop.' },
        { path: 'b.ears', content: 'The system shall wait.' },
      ],
      profile: strict,
    });
    expect(candidates.map((c) => c.file)).toEqual(['a.ears', 'b.ears']);
  });
});

describe('inferKind', () => {
  it('maps extensions to kinds and defaults to text', () => {
    expect(inferKind('r.ears')).toBe('ears');
    expect(inferKind('r.md')).toBe('markdown');
    expect(inferKind('r.markdown')).toBe('markdown');
    expect(inferKind('r.yaml')).toBe('yaml');
    expect(inferKind('r.yml')).toBe('yaml');
    expect(inferKind('r.json')).toBe('json');
    expect(inferKind('-')).toBe('text');
    expect(inferKind('notes.txt')).toBe('text');
  });
});
