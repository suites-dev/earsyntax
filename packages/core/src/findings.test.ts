import { describe, expect, it } from 'vitest';
import {
  defaultSeverityForId,
  toFindings,
  type FindingsInput,
  type SeverityOverrides,
} from './findings.js';
import { idForCode } from './registry.js';
import type { Diagnostic, LintResult } from './types.js';

function lint(diagnostics: Diagnostic[]): LintResult {
  return { valid: !diagnostics.some((d) => d.severity === 'error'), references: [], diagnostics };
}

const vagueWarning: Diagnostic = {
  code: 'lint.vague_response',
  severity: 'warning',
  message: 'The response contains a vague term.',
  span: { start: 10, end: 20 },
};

const missingShallError: Diagnostic = {
  code: 'ears.missing_shall',
  severity: 'error',
  message: "The requirement does not contain exactly one 'shall' response boundary.",
};

const systemUnresolvedError: Diagnostic = {
  code: 'catalog.system_unresolved',
  severity: 'error',
  message: 'The system name does not match any known system.',
};

describe('idForCode', () => {
  it('maps legacy codes to their migration-table ids', () => {
    expect(idForCode('ears.invalid_if_then_form')).toBe('EARS-E006');
    expect(idForCode('catalog.system_ambiguous')).toBe('EARS-E001');
    expect(idForCode('lint.vague_response')).toBe('EARS-W016');
    expect(idForCode('catalog.event_ambiguous')).toBe('EARS-W001');
  });
});

describe('defaultSeverityForId', () => {
  it('reads the default severity from the id band', () => {
    expect(defaultSeverityForId('EARS-E006')).toBe('error');
    expect(defaultSeverityForId('EARS-W016')).toBe('warning');
  });
});

describe('toFindings summary math', () => {
  it('counts files, requirements, valid, errors, and warnings', () => {
    const input: FindingsInput = [
      {
        file: 'specs/a.ears',
        items: [
          { input: { id: 'REQ-1', text: 'ok', source: { line: 1 } }, result: lint([]) },
          {
            input: { id: 'REQ-2', text: 'bad', source: { line: 4 } },
            result: lint([missingShallError, vagueWarning]),
          },
        ],
      },
      {
        file: 'specs/b.ears',
        items: [{ input: { text: 'warn', source: { line: 2 } }, result: lint([vagueWarning]) }],
      },
    ];

    const findings = toFindings(input);
    expect(findings.summary).toEqual({
      files: 2,
      requirements: 3,
      valid: 2,
      errors: 1,
      warnings: 2,
    });
    expect(findings.ok).toBe(false);
  });

  it('returns an empty, ok result for empty input', () => {
    expect(toFindings([])).toEqual({
      ok: true,
      summary: { files: 0, requirements: 0, valid: 0, errors: 0, warnings: 0 },
      diagnostics: [],
    });
  });

  it('returns an ok result when a file has requirements but no diagnostics', () => {
    const findings = toFindings([
      { file: 'specs/clean.ears', items: [{ input: { text: 'clean' }, result: lint([]) }] },
    ]);
    expect(findings.ok).toBe(true);
    expect(findings.summary).toEqual({
      files: 1,
      requirements: 1,
      valid: 1,
      errors: 0,
      warnings: 0,
    });
    expect(findings.diagnostics).toEqual([]);
  });
});

describe('toFindings diagnostic shape', () => {
  const input: FindingsInput = [
    {
      file: 'specs/checkout.ears',
      items: [
        {
          input: { id: 'REQ-3', text: 'x', source: { line: 12, column: 5 } },
          result: lint([missingShallError]),
        },
      ],
    },
  ];

  it('maps id, severity, file, line, col, message, and requirementId', () => {
    const [diagnostic] = toFindings(input).diagnostics;
    expect(diagnostic).toEqual({
      id: 'EARS-E007',
      severity: 'error',
      file: 'specs/checkout.ears',
      line: 12,
      col: 5,
      message: "The requirement does not contain exactly one 'shall' response boundary.",
      requirementId: 'REQ-3',
    });
  });

  it('orders keys as id, severity, file, line, col, message, requirementId', () => {
    const [diagnostic] = toFindings(input).diagnostics;
    expect(Object.keys(diagnostic as object)).toEqual([
      'id',
      'severity',
      'file',
      'line',
      'col',
      'message',
      'requirementId',
    ]);
  });

  it('defaults line to 1 and omits col when source position is absent', () => {
    const findings = toFindings([
      { file: '-', items: [{ input: { text: 'x' }, result: lint([missingShallError]) }] },
    ]);
    const [diagnostic] = findings.diagnostics;
    expect(diagnostic.line).toBe(1);
    expect(Object.hasOwn(diagnostic as object, 'col')).toBe(false);
    expect(Object.hasOwn(diagnostic as object, 'requirementId')).toBe(false);
    expect(Object.hasOwn(diagnostic as object, 'fix')).toBe(false);
  });
});

describe('toFindings severity resolution', () => {
  const warnInput: FindingsInput = [
    {
      file: 'specs/a.ears',
      items: [{ input: { text: 'x', source: { line: 1 } }, result: lint([vagueWarning]) }],
    },
  ];
  const errorInput: FindingsInput = [
    {
      file: 'specs/a.ears',
      items: [{ input: { text: 'x', source: { line: 1 } }, result: lint([missingShallError]) }],
    },
  ];

  it('uses the id-band default with no overrides and no strict', () => {
    expect(toFindings(warnInput).diagnostics[0]?.severity).toBe('warning');
    expect(toFindings(errorInput).diagnostics[0]?.severity).toBe('error');
  });

  it('upgrades a warning to error under --strict', () => {
    const findings = toFindings(warnInput, { strict: true });
    expect(findings.diagnostics[0]?.severity).toBe('error');
    expect(findings.ok).toBe(false);
    expect(findings.summary).toMatchObject({ errors: 1, warnings: 0, valid: 0 });
  });

  it('leaves an error unchanged under --strict', () => {
    expect(toFindings(errorInput, { strict: true }).diagnostics[0]?.severity).toBe('error');
  });

  it('applies a profile override that downgrades an error to warning', () => {
    const overrides: SeverityOverrides = { 'EARS-E007': 'warning' };
    const findings = toFindings(errorInput, { overrides });
    expect(findings.diagnostics[0]?.severity).toBe('warning');
    expect(findings.ok).toBe(true);
    expect(findings.summary).toMatchObject({ errors: 0, warnings: 1, valid: 1 });
  });

  it('applies a profile override that upgrades a warning to error', () => {
    const overrides: SeverityOverrides = { 'EARS-W016': 'error' };
    expect(toFindings(warnInput, { overrides }).diagnostics[0]?.severity).toBe('error');
  });

  it('drops a diagnostic whose override is off', () => {
    const overrides: SeverityOverrides = { 'EARS-W016': 'off' };
    const findings = toFindings(warnInput, { overrides });
    expect(findings.diagnostics).toEqual([]);
    expect(findings.summary).toMatchObject({ requirements: 1, valid: 1, errors: 0, warnings: 0 });
    expect(findings.ok).toBe(true);
  });

  it('lets an off override win over --strict', () => {
    const overrides: SeverityOverrides = { 'EARS-W016': 'off' };
    const findings = toFindings(warnInput, { overrides, strict: true });
    expect(findings.diagnostics).toEqual([]);
    expect(findings.ok).toBe(true);
  });

  it('applies an override then upgrades the result under --strict', () => {
    // Override an error down to warning, then --strict pulls it back to error.
    const overrides: SeverityOverrides = { 'EARS-E007': 'warning' };
    const findings = toFindings(errorInput, { overrides, strict: true });
    expect(findings.diagnostics[0]?.severity).toBe('error');
    expect(findings.ok).toBe(false);
  });
});

describe('toFindings ordering', () => {
  it('sorts by file, line, col, id, then message', () => {
    const input: FindingsInput = [
      {
        file: 'specs/b.ears',
        items: [{ input: { text: 'x', source: { line: 1 } }, result: lint([missingShallError]) }],
      },
      {
        file: 'specs/a.ears',
        items: [
          {
            input: { text: 'y', source: { line: 9 } },
            result: lint([systemUnresolvedError]),
          },
          {
            input: { text: 'z', source: { line: 2 } },
            result: lint([missingShallError, vagueWarning]),
          },
        ],
      },
    ];

    const findings = toFindings(input);
    expect(findings.diagnostics.map((d) => [d.file, d.line, d.id])).toEqual([
      ['specs/a.ears', 2, 'EARS-E007'],
      ['specs/a.ears', 2, 'EARS-W016'],
      ['specs/a.ears', 9, 'EARS-E002'],
      ['specs/b.ears', 1, 'EARS-E007'],
    ]);
  });

  it('sorts a finding with a col before one without on the same line', () => {
    const withCol: Diagnostic = { ...missingShallError };
    const input: FindingsInput = [
      {
        file: 'specs/a.ears',
        items: [
          { input: { text: 'x', source: { line: 3 } }, result: lint([vagueWarning]) },
          { input: { text: 'y', source: { line: 3, column: 4 } }, result: lint([withCol]) },
        ],
      },
    ];
    const findings = toFindings(input);
    expect(findings.diagnostics.map((d) => [d.id, d.col ?? null])).toEqual([
      ['EARS-E007', 4],
      ['EARS-W016', null],
    ]);
  });
});

describe('toFindings determinism', () => {
  it('produces byte-identical JSON for the same input', () => {
    const input: FindingsInput = [
      {
        file: 'specs/a.ears',
        items: [
          {
            input: { id: 'REQ-1', text: 'x', source: { line: 4, column: 2 } },
            result: lint([missingShallError, vagueWarning]),
          },
        ],
      },
    ];
    expect(JSON.stringify(toFindings(input))).toBe(JSON.stringify(toFindings(input)));
  });
});
