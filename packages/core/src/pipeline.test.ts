/**
 * Tests for the host-native findings-assembly stage (`candidatesToFindings`).
 *
 * These cover the parse + lint + findings half of the pipeline: candidate
 * positions map through to diagnostics, every file group is counted, profile
 * severity overrides drop diagnostics, and `strict` upgrades warnings.
 */

import { describe, expect, it } from 'vitest';
import { candidatesToFindings, type Candidate, type CandidateFile } from './pipeline.js';
import { BUILTIN_PROFILES, type Profile } from './profiles/index.js';

const STRICT = BUILTIN_PROFILES.strict;

function candidate(over: Partial<Candidate> & Pick<Candidate, 'text' | 'line'>): Candidate {
  return {
    file: 'requirements.ears',
    col: 1,
    profile: 'strict',
    locatorRuleId: 'strict.every-line',
    ...over,
  };
}

describe('candidatesToFindings', () => {
  it('counts every file group, even one with no candidates', () => {
    const files: CandidateFile[] = [
      { file: 'a.ears', candidates: [candidate({ text: 'The system shall stop.', line: 1 })] },
      { file: 'b.ears', candidates: [] },
    ];
    const findings = candidatesToFindings(files, STRICT);
    expect(findings.summary.files).toBe(2);
    expect(findings.summary.requirements).toBe(1);
  });

  it('maps candidate line and col through to the diagnostic', () => {
    const files: CandidateFile[] = [
      {
        file: 'spec.ears',
        candidates: [
          candidate({ text: 'This is not a requirement at all.', line: 12, col: 7, file: 'spec.ears' }),
        ],
      },
    ];
    const findings = candidatesToFindings(files, STRICT);
    expect(findings.ok).toBe(false);
    expect(findings.diagnostics).toHaveLength(1);
    const [diag] = findings.diagnostics;
    expect(diag.id).toBe('EARS-E010');
    expect(diag.file).toBe('spec.ears');
    expect(diag.line).toBe(12);
    expect(diag.col).toBe(7);
  });

  it('omits col when the candidate carries none', () => {
    const files: CandidateFile[] = [
      {
        file: 'spec.ears',
        candidates: [{ file: 'spec.ears', line: 3, text: 'Nonsense line.', locatorRuleId: 'r', profile: 'strict' }],
      },
    ];
    const findings = candidatesToFindings(files, STRICT);
    expect(findings.diagnostics[0].col).toBeUndefined();
  });

  it('reports a clean requirement as valid with no diagnostics', () => {
    const files: CandidateFile[] = [
      { file: 'a.ears', candidates: [candidate({ text: 'The billing service shall verify the signature.', line: 1 })] },
    ];
    const findings = candidatesToFindings(files, STRICT);
    expect(findings.ok).toBe(true);
    expect(findings.summary.valid).toBe(1);
    expect(findings.diagnostics).toHaveLength(0);
  });

  it('drops a diagnostic the profile turns off', () => {
    const vague = candidate({ text: 'The system shall respond appropriately.', line: 1 });
    const base = candidatesToFindings([{ file: 'a.ears', candidates: [vague] }], STRICT);
    expect(base.diagnostics.map((d) => d.id)).toEqual(['EARS-W016']);

    const silenced: Profile = { ...STRICT, severity: { 'EARS-W016': 'off' } };
    const off = candidatesToFindings([{ file: 'a.ears', candidates: [vague] }], silenced);
    expect(off.diagnostics).toHaveLength(0);
    expect(off.ok).toBe(true);
  });

  it('upgrades warnings to errors under strict', () => {
    const vague = candidate({ text: 'The system shall respond appropriately.', line: 1 });
    const findings = candidatesToFindings([{ file: 'a.ears', candidates: [vague] }], STRICT, {
      strict: true,
    });
    expect(findings.diagnostics[0].severity).toBe('error');
    expect(findings.ok).toBe(false);
    expect(findings.summary.errors).toBe(1);
  });

  it('carries the requirement id onto the diagnostic', () => {
    const files: CandidateFile[] = [
      {
        file: 'a.ears',
        candidates: [candidate({ requirementId: 'REQ-007', text: 'Bad requirement text.', line: 2 })],
      },
    ];
    const findings = candidatesToFindings(files, STRICT);
    expect(findings.diagnostics[0].requirementId).toBe('REQ-007');
  });
});
