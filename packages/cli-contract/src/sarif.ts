/**
 * SARIF 2.1.0 projection of the canonical Findings model.
 *
 * SARIF (Static Analysis Results Interchange Format) is the OASIS standard that
 * code-scanning tools (GitHub code scanning, editors, CI dashboards) consume.
 * This module is a pure PROJECTION of a {@link Findings} value: it lints,
 * parses, and re-derives nothing. One SARIF `result` is emitted per finding, and
 * the run declares one rule per distinct diagnostic id present in the findings.
 * Rule metadata (title, meaning, help anchor, default severity) is read from the
 * diagnostic registry in `@earsyntax/core`, the single source of truth.
 *
 * Because SARIF is downstream of Findings, `--strict` and profile overrides are
 * already baked into each `Diagnostic.severity` before projection; the SARIF
 * `result.level` is the EFFECTIVE severity with no additional logic, while the
 * rule's `defaultConfiguration.level` records the registry DEFAULT severity.
 *
 * Determinism contract: no I/O, no clock, no randomness, no timestamps. Rules
 * are ordered by id (code-unit); results preserve the findings' stable order. The
 * same {@link Findings} value always produces a byte-identical log.
 *
 * Schema reference (the canonical SARIF 2.1.0 LOG schema, whose own `$id` is the
 * URL below): the vendored copy lives at
 * `packages/cli-contract/test/sarif-schema-2.1.0.json`.
 */

import { type FindingsDiagnostic, type Findings, getDiagnosticEntry } from '@earsyntax/core';

/**
 * The canonical SARIF 2.1.0 LOG schema URL.
 *
 * This is the schema's own declared `$id`. The legacy emitter pointed `$schema`
 * at a GitHub blob HTML page of the SARIF EXTERNAL PROPERTY FILE schema (a
 * different, wrong schema); this is the log schema every SARIF consumer expects.
 */
export const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';

/** The SARIF version string this projection targets. */
export const SARIF_VERSION = '2.1.0' as const;

/** The tool driver name reported in every SARIF run. */
export const SARIF_TOOL_NAME = 'earsyntax';

/**
 * SARIF result levels this projection emits.
 *
 * The Findings model has no `info` severity, so `note` and `none` never appear;
 * only `error` and `warning` are produced.
 */
export type SarifLevel = 'error' | 'warning';

/** A SARIF rule descriptor (`reportingDescriptor`) declared on the tool driver. */
export interface SarifRule {
  /** The rule id, equal to the diagnostic's `EARS-*` id. */
  id: string;
  /** A short, one-line description of the rule (the registry title). */
  shortDescription: { text: string };
  /** A fuller description of the rule (the registry meaning). */
  fullDescription: { text: string };
  /** A stable docs anchor for the rule (`docs/diagnostics.md#ears-e001` style). */
  helpUri: string;
  /** The registry DEFAULT severity, independent of a result's effective level. */
  defaultConfiguration: { level: SarifLevel };
}

/**
 * A SARIF physical location region.
 *
 * `startLine` is always present (a {@link FindingsDiagnostic} always carries a
 * line). `startColumn` is included only when the finding carries column data;
 * no end coordinate exists in the Findings model, so `endColumn` is never set.
 */
export interface SarifRegion {
  /** 1-based start line. Always present. */
  startLine: number;
  /** 1-based start column, when the finding maps to a specific column. */
  startColumn?: number;
}

/** A SARIF physical location. */
export interface SarifPhysicalLocation {
  /** The artifact (source file) the result points at, as a relative URI. */
  artifactLocation: { uri: string };
  /** The region within the artifact. */
  region: SarifRegion;
}

/** A SARIF result location. */
export interface SarifLocation {
  physicalLocation: SarifPhysicalLocation;
}

/** A single SARIF result (one finding). */
export interface SarifResult {
  /** The id of the rule this result violates (the `EARS-*` id). */
  ruleId: string;
  /** The index of the rule in the driver's `rules` array. */
  ruleIndex: number;
  /** The EFFECTIVE severity level. */
  level: SarifLevel;
  /** The human-readable message. */
  message: { text: string };
  /** Where the result was found. Always exactly one location. */
  locations: SarifLocation[];
  /** The requirement's own id, when the extractor found one. */
  properties?: { requirementId: string };
}

/** A SARIF tool driver. */
export interface SarifDriver {
  /** The tool name. Always {@link SARIF_TOOL_NAME}. */
  name: string;
  /** The tool version, when supplied via {@link BuildSarifOptions.toolVersion}. */
  version?: string;
  /** The rules this run can report, one per distinct id, sorted by id. */
  rules: SarifRule[];
}

/** A single SARIF run. */
export interface SarifRun {
  /** The tool that produced the run. */
  tool: { driver: SarifDriver };
  /** The results the run produced, in findings order. */
  results: SarifResult[];
}

/** A complete SARIF log. */
export interface SarifLog {
  /** The SARIF LOG schema URL. Always {@link SARIF_SCHEMA}. */
  $schema: string;
  /** The SARIF version. Always {@link SARIF_VERSION}. */
  version: typeof SARIF_VERSION;
  /** The runs in this log. This projection always emits exactly one. */
  runs: SarifRun[];
}

/** Options that tune {@link buildSarifLog}. */
export interface BuildSarifOptions {
  /** When set, recorded as `tool.driver.version`. Omitted otherwise. */
  toolVersion?: string;
}

/**
 * Map a Findings effective severity to its SARIF level.
 *
 * The mapping is total and identity-like: `error` to `error`, `warning` to
 * `warning`. The Findings model has no third severity, so no `note`/`none`
 * branch is reachable.
 */
function toSarifLevel(severity: FindingsDiagnostic['severity']): SarifLevel {
  return severity === 'error' ? 'error' : 'warning';
}

/**
 * Normalize a Findings `file` into a relative, forward-slash, URI-encoded path.
 *
 * SARIF `artifactLocation.uri` must not carry a raw absolute or Windows path.
 * This drops a leading slash or a `C:` drive segment (making the path relative),
 * collapses `\` and `/` separators to `/`, discards `.` segments, and URI-encodes
 * each remaining segment. The stdin sentinel `-` passes through as the single
 * segment `-`.
 *
 * @param file The `Diagnostic.file` value (relative POSIX path, `-`, or, when the
 *   caller passed one, an absolute or Windows path).
 * @returns A relative, forward-slash, percent-encoded URI reference.
 */
function toArtifactUri(file: string): string {
  const segments = file
    .split(/[/\\]/)
    .filter((segment) => segment.length > 0 && segment !== '.' && !/^[A-Za-z]:$/.test(segment));
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

/** Build the physical-location region for one finding. */
function toRegion(diagnostic: FindingsDiagnostic): SarifRegion {
  const region = {} as SarifRegion;
  region.startLine = diagnostic.line;
  if (diagnostic.col !== undefined) {
    region.startColumn = diagnostic.col;
  }
  return region;
}

/** The docs anchor a rule's `helpUri` points at: `docs/diagnostics.md#ears-e001`. */
function helpUriForId(id: string): string {
  return `docs/diagnostics.md#${id.toLowerCase()}`;
}

/** Build one rule descriptor for a distinct diagnostic id, reading registry metadata. */
function buildRule(id: string): SarifRule {
  const entry = getDiagnosticEntry(id);
  // Keys constructed in a fixed order for byte-stable output. An id with no
  // registry entry (which should not occur for a resolved id) falls back to the
  // id itself and to its band prefix for the default level.
  const rule = {} as SarifRule;
  rule.id = id;
  rule.shortDescription = { text: entry ? entry.title : id };
  rule.fullDescription = { text: entry ? entry.meaning : id };
  rule.helpUri = helpUriForId(id);
  rule.defaultConfiguration = {
    level: entry ? entry.defaultSeverity : id.startsWith('EARS-E') ? 'error' : 'warning',
  };
  return rule;
}

/** Build one result for a finding, given the rule index for its id. */
function buildResult(diagnostic: FindingsDiagnostic, ruleIndex: number): SarifResult {
  // Keys constructed in a fixed order for byte-stable output.
  const result = {} as SarifResult;
  result.ruleId = diagnostic.id;
  result.ruleIndex = ruleIndex;
  result.level = toSarifLevel(diagnostic.severity);
  result.message = { text: diagnostic.message };
  result.locations = [
    {
      physicalLocation: {
        artifactLocation: { uri: toArtifactUri(diagnostic.file) },
        region: toRegion(diagnostic),
      },
    },
  ];
  if (diagnostic.requirementId !== undefined) {
    result.properties = { requirementId: diagnostic.requirementId };
  }
  return result;
}

/**
 * Project a {@link Findings} value to a SARIF 2.1.0 log.
 *
 * The single run declares one rule per DISTINCT diagnostic id present in the
 * findings (sorted by id, code-unit order) rather than the full registry, so the
 * log stays lean and its `rules` array carries only what its results reference.
 * Each result is emitted in the findings' stable order and references its rule by
 * `ruleId` and `ruleIndex`. `result.level` is the finding's effective severity;
 * the rule's `defaultConfiguration.level` is the registry default. The
 * requirement id, when present, is carried on `result.properties.requirementId`.
 *
 * @param findings The canonical findings to project.
 * @param options Optional tuning; `toolVersion` is recorded on the driver.
 * @returns A SARIF log ready to serialize with `JSON.stringify`.
 */
export function buildSarifLog(findings: Findings, options: BuildSarifOptions = {}): SarifLog {
  const distinctIds = [...new Set(findings.diagnostics.map((diagnostic) => diagnostic.id))].sort(
    (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  );
  const ruleIndexById = new Map(distinctIds.map((id, index): [string, number] => [id, index]));
  const rules = distinctIds.map(buildRule);

  const results = findings.diagnostics.map((diagnostic) => {
    const ruleIndex = ruleIndexById.get(diagnostic.id);
    if (ruleIndex === undefined) {
      // Unreachable: distinctIds is derived from these same diagnostics.
      throw new Error(`No SARIF rule index for diagnostic id "${diagnostic.id}".`);
    }
    return buildResult(diagnostic, ruleIndex);
  });

  const driver = {} as SarifDriver;
  driver.name = SARIF_TOOL_NAME;
  if (options.toolVersion !== undefined) {
    driver.version = options.toolVersion;
  }
  driver.rules = rules;

  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [{ tool: { driver }, results }],
  };
}

/**
 * Serialize a SARIF log to a stable, 2-space-indented JSON string.
 *
 * A thin wrapper over `JSON.stringify`: the log's keys are already constructed in
 * a fixed order, so the same {@link Findings} always yields a byte-identical
 * string. No trailing newline is appended; the output layer owns final framing.
 *
 * @param log The SARIF log to serialize.
 * @returns The canonical JSON string.
 */
export function serializeSarifLog(log: SarifLog): string {
  return JSON.stringify(log, null, 2);
}
