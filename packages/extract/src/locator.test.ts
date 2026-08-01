/**
 * Tests for the profile-driven host-native locator, exercised through the public
 * {@link extractCandidates} entry.
 *
 * These assert candidate positions (1-based line and col), locator-rule
 * selection per profile, code-fence handling, frame-metadata gating, and
 * story-wrapper skipping. Every position must point at the original document.
 */

import { BUILTIN_PROFILES } from '@earsyntax/core';
import { describe, expect, it } from 'vitest';
import { extractCandidates } from './pipeline.js';

const { strict, 'ears-x': earsX, kiro, speckit, openspec } = BUILTIN_PROFILES;

function candidates(path: string, content: string, profile = strict) {
  return extractCandidates({ files: [{ path, content }], profile }).candidates;
}

describe('every-line locator (strict, ears-x)', () => {
  it('emits one candidate per non-empty, non-comment line with 1-based positions', () => {
    const content = ['# comment', '', 'The system shall stop.', '  The system shall wait.'].join('\n');
    const result = candidates('r.ears', content);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ line: 3, col: 1, text: 'The system shall stop.' });
    // Leading whitespace advances the column to the first text character.
    expect(result[1]).toMatchObject({ line: 4, col: 3, text: 'The system shall wait.' });
    expect(result[0].locatorRuleId).toBe('strict.every-line');
  });

  it('does not lift a REQ- prefix under strict (allowFrameMetadata false)', () => {
    const result = candidates('r.ears', 'REQ-001: The system shall stop.');
    expect(result[0].text).toBe('REQ-001: The system shall stop.');
    expect(result[0].requirementId).toBeUndefined();
  });

  it('lifts a REQ- id under ears-x but keeps the prefix in the text at col 1', () => {
    // The linter strips the frame prefix at parse time under allowFrameMetadata,
    // so the extractor retains the raw line and reports col 1.
    const result = candidates('r.ears', 'REQ-001: The system shall stop.', earsX);
    expect(result[0].requirementId).toBe('REQ-001');
    expect(result[0].text).toBe('REQ-001: The system shall stop.');
    expect(result[0].col).toBe(1);
  });
});

describe('markdown list-item locator (kiro)', () => {
  const doc = [
    '# Feature',
    '',
    '**User Story:** As a user, I want checkout, so that I can pay.',
    '',
    '#### Acceptance Criteria',
    '',
    '1. WHEN a webhook arrives THE SYSTEM SHALL verify it.',
    '2. THE SYSTEM SHALL retry on failure.',
    '',
    '## Notes',
    '',
    '- This bullet is outside acceptance criteria.',
  ].join('\n');

  it('captures only list items under the Acceptance Criteria heading', () => {
    const result = candidates('requirements.md', doc, kiro);
    expect(result.map((c) => c.text)).toEqual([
      'WHEN a webhook arrives THE SYSTEM SHALL verify it.',
      'THE SYSTEM SHALL retry on failure.',
    ]);
  });

  it('reports the ordered-item text column, past the marker', () => {
    const result = candidates('requirements.md', doc, kiro);
    // '1. ' is three characters, so the text starts at column 4 on line 7.
    expect(result[0]).toMatchObject({ line: 7, col: 4 });
    expect(result[0].locatorRuleId).toBe('kiro.acceptance-criteria-item');
  });

  it('captures indented continuation lines of a list item', () => {
    const doc2 = [
      '#### Acceptance Criteria',
      '',
      '- WHEN a webhook arrives THE SYSTEM SHALL verify it',
      '  and record the outcome.',
    ].join('\n');
    const result = candidates('requirements.md', doc2, kiro);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('WHEN a webhook arrives THE SYSTEM SHALL verify it and record the outcome.');
  });
});

describe('markdown heading-section locator (speckit)', () => {
  it('captures body lines under Requirements and excludes Design prose', () => {
    const doc = [
      '## Requirements',
      '',
      'The service shall verify the signature.',
      '',
      '## Design',
      '',
      'When the cache warms, the design note explains the flow.',
    ].join('\n');
    const result = candidates('spec.md', doc, speckit);
    expect(result.map((c) => c.text)).toEqual(['The service shall verify the signature.']);
    expect(result[0].locatorRuleId).toBe('speckit.requirements-section');
  });

  it('strips a bold FR label, lifts requirementId, and reports col at the sentence', () => {
    const doc = [
      '## Requirements',
      '',
      '- **FR-001**: The system shall invite a teammate by email address.',
    ].join('\n');
    const result = candidates('spec.md', doc, speckit);
    expect(result[0]).toMatchObject({
      line: 3,
      col: 15,
      text: 'The system shall invite a teammate by email address.',
      requirementId: 'FR-001',
    });
  });
});

describe('markdown block locator (openspec)', () => {
  it('captures scenario body lines until the next same-or-higher heading', () => {
    const doc = [
      '### Requirement: Signature check',
      '',
      'The service shall verify the signature.',
      '',
      '#### Scenario: invalid signature',
      '',
      'If the signature is invalid, then the service shall reject the webhook.',
      '',
      '### Requirement: Next',
      '',
      'The service shall log every attempt.',
    ].join('\n');
    const result = candidates('spec.md', doc, openspec);
    expect(result.map((c) => c.text)).toEqual([
      'The service shall verify the signature.',
      'If the signature is invalid, then the service shall reject the webhook.',
      'The service shall log every attempt.',
    ]);
  });

  it('captures only the first EARS-shaped line per block and skips Gherkin steps', () => {
    const doc = [
      '### Requirement: Retention window',
      '',
      'The system shall retain build artifacts for the configured retention window.',
      '',
      '#### Scenario: Artifact within the window',
      '',
      '- **WHEN** an artifact is younger than the retention window',
      '- **THEN** the system retains the artifact and its metadata',
    ].join('\n');
    const result = candidates('spec.md', doc, openspec);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      line: 3,
      text: 'The system shall retain build artifacts for the configured retention window.',
      locatorRuleId: 'openspec.requirement',
    });
  });
});

describe('code fences', () => {
  it('ignores fenced content and tracks marker length so a shorter run does not close', () => {
    const doc = [
      '#### Acceptance Criteria',
      '',
      '````',
      '``` not a closing fence, run is shorter',
      '- THE SYSTEM SHALL not be captured here.',
      '````',
      '',
      '- THE SYSTEM SHALL be captured here.',
    ].join('\n');
    const result = candidates('requirements.md', doc, kiro);
    expect(result.map((c) => c.text)).toEqual(['THE SYSTEM SHALL be captured here.']);
  });
});

describe('document-kind gating', () => {
  it('produces no candidates when the profile does not locate over the kind', () => {
    // strict locates over ears/text, not markdown.
    const result = candidates('spec.md', '- The system shall stop.', strict);
    expect(result).toHaveLength(0);
  });
});
