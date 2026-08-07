/**
 * Host-native validation pipeline, findings-assembly stage (`@earsyntax/core`).
 *
 * The full pipeline is `locate -> extract -> parse -> lint -> findings`. Stages
 * 1 and 2 (locate host document regions and extract candidate requirement text
 * with source positions) live in `@earsyntax/extract`, the layer that may read
 * files and depend on `js-yaml`. This module owns stages 3 and 4, which are pure
 * core logic:
 *
 * 3. parse + lint: feed each candidate's text to the core linter under the
 *    active profile's dialect and an optional catalog.
 * 4. findings: fold the per-candidate {@link LintResult}s into the frozen
 *    {@link Findings} model through {@link toFindings}, applying the profile's
 *    severity overrides and the `--strict` flag, with every diagnostic mapped
 *    back to the candidate's original `file:line:col`.
 *
 * The {@link Candidate} and {@link PipelineNotice} shapes are defined here so the
 * two packages agree on a single type: `@earsyntax/extract` produces them and
 * this module consumes them.
 *
 * Determinism contract: no LLM, no network, no file system, no clock, no random
 * source. The same candidates always produce a deeply equal, stably ordered
 * Findings value.
 */

import {
  toFindings,
  type Findings,
  type FindingsInputFile,
  type FindingsInputItem,
} from './findings.js';
import { lintEarsBatch } from './lint.js';
import type { Profile, ProfileName } from './profiles/index.js';
import type { Catalog, RequirementInput } from './types.js';

/**
 * One requirement candidate located in a host document, with its original
 * source position and the locator rule that selected it.
 *
 * This is the unit `extract` reports and the unit the lint stage consumes. The
 * position (`line`, optional `col`) is 1-based and refers to the ORIGINAL host
 * document, preserved through every stage so a diagnostic points at the text the
 * agent edits. Object keys follow the fixed facade order `file`, `line`, `col?`,
 * `text`, `profile`, `locatorRuleId`, `requirementId?` when serialized by the
 * CLI (see `docs/refactor/host-native-facade.md`).
 */
export interface Candidate {
  /** Source file path, relative to `--cwd` (POSIX), or `-` for stdin. */
  file: string;
  /** 1-based line of the candidate's first character in the host document. */
  line: number;
  /** 1-based column of the candidate text's first character, when known. */
  col?: number;
  /** The candidate requirement text. A markdown bold id label is removed; an ears-x frame prefix is retained (the linter strips it at parse time). */
  text: string;
  /** The active profile's name. */
  profile: ProfileName;
  /** The id of the {@link import('./profiles/index.js').LocatorRule} that selected this candidate. */
  locatorRuleId: string;
  /** The requirement's own id (for example `REQ-001` or `FR-001`), when the locator found one. */
  requirementId?: string;
}

/**
 * A recoverable problem raised while locating or extracting candidates.
 *
 * Extraction never throws: a malformed structured document (bad YAML/JSON, wrong
 * top-level shape) or an unreadable file produces an empty candidate list plus a
 * notice here. Notices are the pipeline's environment/usage channel; they are
 * NOT lint findings and never enter the {@link Findings} model. The CLI projects
 * them onto the facade-level `diagnostics` array (see
 * `docs/refactor/host-native-facade.md`).
 */
export interface PipelineNotice {
  /** A stable dotted code (for example `extract.malformed_yaml`). */
  code: string;
  /** Notice severity. Never `off`; that concept is severity-override only. */
  severity: 'error' | 'warning';
  /** One factual sentence describing the problem. */
  message: string;
  /** The source file the problem relates to, when known. */
  file?: string;
  /** 1-based line the problem relates to, when known. */
  line?: number;
}

/** All candidates located in one source file, in document order. */
export interface CandidateFile {
  /** The source file path, relative to `--cwd` (POSIX), or `-` for stdin. */
  file: string;
  /** The candidates located in the file, in document order. */
  candidates: Candidate[];
}

/** Options that tune {@link candidatesToFindings}. */
export interface LintCandidatesOptions {
  /** Upgrade every surviving `warning` to `error` at the findings layer. */
  strict?: boolean;
  /** Optional catalog of known domain terms, passed to the core linter. */
  catalog?: Catalog;
}

/**
 * Convert located candidates into the canonical {@link Findings} model.
 *
 * Every file group is preserved (even an empty one) so `summary.files` counts
 * every located and read file. Each candidate becomes a {@link RequirementInput}
 * carrying its original `file:line:col`; the batch is linted under the profile's
 * dialect and the optional catalog; the results are folded through
 * {@link toFindings} with the profile's `severity` overrides and `strict`.
 *
 * The profile's `idFormat` is not enforced here: the diagnostic registry carries
 * no id-format code yet, so id-format findings are out of scope for this stage.
 *
 * @param files Candidates grouped by source file, in processed order.
 * @param profile The active profile (supplies dialect and severity overrides).
 * @param options `strict` and an optional catalog.
 * @returns The assembled Findings result.
 */
export function candidatesToFindings(
  files: readonly CandidateFile[],
  profile: Profile,
  options: LintCandidatesOptions = {},
): Findings {
  const input: FindingsInputFile[] = files.map((fileGroup) => {
    const inputs: RequirementInput[] = fileGroup.candidates.map((candidate) =>
      candidateToRequirementInput(fileGroup.file, candidate),
    );
    const results = lintEarsBatch(inputs, options.catalog, { dialect: profile.dialect });
    const items: FindingsInputItem[] = inputs.map((requirement, index) => ({
      input: requirement,
      result: results[index],
    }));
    return { file: fileGroup.file, items };
  });

  return toFindings(input, { overrides: profile.severity, strict: options.strict });
}

/**
 * Build the {@link RequirementInput} for one candidate, carrying its original
 * source position so diagnostics map back to the host document.
 */
function candidateToRequirementInput(file: string, candidate: Candidate): RequirementInput {
  const source: RequirementInput['source'] = { file, line: candidate.line };
  if (candidate.col !== undefined) {
    source.column = candidate.col;
  }
  return {
    ...(candidate.requirementId === undefined ? {} : { id: candidate.requirementId }),
    text: candidate.text,
    source,
  };
}
