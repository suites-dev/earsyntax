/**
 * A minimal, valid subset of the SARIF 2.1.0 static analysis report format.
 *
 * SARIF (Static Analysis Results Interchange Format) is the OASIS standard
 * that code-scanning tools (GitHub code scanning, editors, CI dashboards)
 * consume. This module emits only the fields those consumers require: one run,
 * a tool driver named `earsyntax`, a rule per diagnostic code, and one result
 * per diagnostic. It does not attempt full-schema coverage.
 *
 * Schema reference:
 * https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json
 */

import type { Severity } from '@earsyntax/core';
import type { ReportInput } from './input.js';
import { DIAGNOSTIC_CODES, DIAGNOSTIC_DESCRIPTIONS } from './diagnostic-registry.js';

/** The canonical SARIF 2.1.0 JSON schema URL. */
export const SARIF_SCHEMA =
  'https://github.com/oasis-tcs/sarif-spec/blob/main/sarif-2.1/schema/sarif-external-property-file-schema-2.1.0.json';

/** The SARIF version string this builder targets. */
export const SARIF_VERSION = '2.1.0' as const;

/** The tool driver name reported in every SARIF run. */
export const SARIF_TOOL_NAME = 'earsyntax';

/** SARIF result levels this builder emits. */
export type SarifLevel = 'error' | 'warning' | 'note';

/** A SARIF rule descriptor (`reportingDescriptor`). */
export interface SarifRule {
  /** The rule id, equal to the diagnostic code. */
  id: string;
  /** A short, one-line description of the rule. */
  shortDescription: { text: string };
}

/** A SARIF physical location region. Either line-based or offset-based. */
export interface SarifRegion {
  /** 1-based start line, when the source line is known. */
  startLine?: number;
  /** 0-based character offset into the requirement text, when the line is not. */
  charOffset?: number;
  /** Character length from {@link SarifRegion.charOffset}. */
  charLength?: number;
}

/** A SARIF physical location. */
export interface SarifPhysicalLocation {
  /** The artifact (source file) the result points at. */
  artifactLocation: { uri: string };
  /** The region within the artifact, when known. */
  region?: SarifRegion;
}

/** A SARIF result location. */
export interface SarifLocation {
  physicalLocation: SarifPhysicalLocation;
}

/** A single SARIF result (one diagnostic). */
export interface SarifResult {
  /** The id of the rule this result violates. */
  ruleId: string;
  /** The mapped severity level. */
  level: SarifLevel;
  /** The human-readable message. */
  message: { text: string };
  /** Where the result was found. */
  locations: SarifLocation[];
}

/** A SARIF tool driver. */
export interface SarifDriver {
  /** The tool name. Always {@link SARIF_TOOL_NAME}. */
  name: string;
  /** The rules this tool can report. */
  rules: SarifRule[];
}

/** A single SARIF run. */
export interface SarifRun {
  /** The tool that produced the run. */
  tool: { driver: SarifDriver };
  /** The results the run produced. */
  results: SarifResult[];
}

/** A complete SARIF log. */
export interface SarifLog {
  /** The SARIF schema URL. */
  $schema: string;
  /** The SARIF version. Always {@link SARIF_VERSION}. */
  version: typeof SARIF_VERSION;
  /** The runs in this log. This builder always emits exactly one. */
  runs: SarifRun[];
}

/**
 * Map an EARS {@link Severity} to its SARIF level.
 *
 * `error` maps to `error`, `warning` to `warning`, and `info` to `note`
 * (SARIF has no `info` level).
 */
function toSarifLevel(severity: Severity): SarifLevel {
  switch (severity) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'info':
      return 'note';
  }
}

/**
 * Build a minimal SARIF 2.1.0 log from a linting run.
 *
 * The single run declares one rule per registered diagnostic code (sorted) and
 * one result per diagnostic, in file then requirement then diagnostic order.
 * Each result points at its source file; the region is line-based when the
 * source line is known, otherwise character-offset-based from the diagnostic
 * span, and omitted when neither is available.
 *
 * @param input The linted requirements grouped by source file.
 * @returns A SARIF log ready to serialize with `JSON.stringify`.
 */
export function buildSarifLog(input: ReportInput): SarifLog {
  const rules: SarifRule[] = DIAGNOSTIC_CODES.map((code) => ({
    id: code,
    shortDescription: { text: DIAGNOSTIC_DESCRIPTIONS[code] },
  }));

  const results: SarifResult[] = [];
  for (const file of input) {
    for (const item of file.items) {
      const line = item.input.source?.line;
      for (const diagnostic of item.result.diagnostics) {
        const physicalLocation: SarifPhysicalLocation = {
          artifactLocation: { uri: file.path },
        };
        if (line !== undefined) {
          physicalLocation.region = { startLine: line };
        } else if (diagnostic.span !== undefined) {
          physicalLocation.region = {
            charOffset: diagnostic.span.start,
            charLength: diagnostic.span.end - diagnostic.span.start,
          };
        }

        results.push({
          ruleId: diagnostic.code,
          level: toSarifLevel(diagnostic.severity),
          message: { text: diagnostic.message },
          locations: [{ physicalLocation }],
        });
      }
    }
  }

  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [{ tool: { driver: { name: SARIF_TOOL_NAME, rules } }, results }],
  };
}
