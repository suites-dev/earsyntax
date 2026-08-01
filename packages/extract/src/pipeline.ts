/**
 * Host-native pipeline entry for `@earsyntax/extract`.
 *
 * This is the locate + extract half of the pipeline (stages 1 and 2), plus a
 * thin composition with the core findings-assembly half:
 *
 * - {@link extractCandidates} locates requirement {@link Candidate}s across a set
 *   of in-memory files under the active profile. This is the data the `extract`
 *   command prints.
 * - {@link runPipeline} runs the whole pipeline: locate + extract here, then
 *   parse + lint + findings via `@earsyntax/core`'s {@link candidatesToFindings}.
 *   This is what the `validate` command runs.
 *
 * Text-family kinds (`ears`, `text`, `markdown`) are located by `./locator.ts`
 * under the profile's locator rules and are gated by `locator.documentKinds`: a
 * file whose kind the profile does not locate over yields no candidates.
 * Structured kinds (`yaml`, `json`) are extracted from parsed data and are
 * profile-agnostic (no built-in profile declares them in `documentKinds`), so
 * they always produce candidates; the active dialect still applies when their
 * text is linted. Structured candidates carry a synthetic `locatorRuleId`
 * (`structured.yaml` / `structured.json`) because no `LocatorRule` selected them.
 *
 * Nothing here throws on malformed input: a bad structured document or an
 * unsupported kind produces zero candidates plus a {@link PipelineNotice}.
 * Notices are the environment/usage channel, never lint findings.
 *
 * Determinism: pure over the provided content strings. Only the caller (the CLI)
 * reads files; this module never touches the disk.
 */

import {
  candidatesToFindings,
  type Candidate,
  type CandidateFile,
  type Catalog,
  type Findings,
  type PipelineNotice,
  type Profile,
} from '@earsyntax/core';
import { extractJson } from './json.js';
import { locateTextFamily } from './locator.js';
import { stripBom } from './normalize.js';
import { extractYaml } from './yaml.js';
import type { ExtractError, ExtractResult } from './types.js';

/** The document kinds the pipeline understands. */
export type DocumentKind = 'ears' | 'text' | 'markdown' | 'yaml' | 'json';

/** One in-memory file fed to the pipeline. */
export interface PipelineFile {
  /** The file path, recorded on every candidate and notice. Use `-` for stdin. */
  path: string;
  /** The file's raw content. */
  content: string;
  /** The document kind; inferred from the path extension when omitted. */
  kind?: DocumentKind;
}

/** Input to {@link extractCandidates}. */
export interface ExtractCandidatesInput {
  /** The files to locate candidates in. */
  files: readonly PipelineFile[];
  /** The active profile. */
  profile: Profile;
}

/** Result of {@link extractCandidates}. */
export interface ExtractCandidatesResult {
  /** Every located candidate, across all files, in file-then-document order. */
  candidates: Candidate[];
  /** Recoverable locate/extract problems. Empty on a clean run. */
  notices: PipelineNotice[];
}

/** Input to {@link runPipeline}. */
export interface RunPipelineInput extends ExtractCandidatesInput {
  /** Upgrade surviving warnings to errors at the findings layer. */
  strict?: boolean;
  /** Optional catalog of known domain terms, passed to the linter. */
  catalog?: Catalog;
}

/**
 * Result of {@link runPipeline}.
 *
 * `findings` is the frozen Findings model. `notices` carries locate/extract
 * problems (malformed structured input, unsupported kinds) that are not lint
 * findings; the CLI maps them onto the facade-level `diagnostics` channel.
 */
export interface RunPipelineResult {
  /** The canonical Findings result. */
  findings: Findings;
  /** Recoverable locate/extract problems. Empty on a clean run. */
  notices: PipelineNotice[];
}

const TEXT_KINDS = new Set<DocumentKind>(['ears', 'text', 'markdown']);

/**
 * Locate requirement candidates across a set of files under a profile.
 *
 * @param input The files and the active profile.
 * @returns The candidates and any recoverable notices.
 */
export function extractCandidates(input: ExtractCandidatesInput): ExtractCandidatesResult {
  const candidates: Candidate[] = [];
  const notices: PipelineNotice[] = [];
  for (const file of input.files) {
    const located = locateFile(file, input.profile);
    candidates.push(...located.candidates);
    notices.push(...located.notices);
  }
  return { candidates, notices };
}

/**
 * Run the full pipeline: locate, extract, parse, lint, and assemble findings.
 *
 * Every input file becomes a Findings file group even when it yields no
 * candidates, so `summary.files` counts every file the pipeline read.
 *
 * @param input The files, profile, and optional `strict`/`catalog`.
 * @returns The Findings result and any recoverable notices.
 */
export function runPipeline(input: RunPipelineInput): RunPipelineResult {
  const files: CandidateFile[] = [];
  const notices: PipelineNotice[] = [];
  for (const file of input.files) {
    const located = locateFile(file, input.profile);
    files.push({ file: file.path, candidates: located.candidates });
    notices.push(...located.notices);
  }
  const findings = candidatesToFindings(files, input.profile, {
    ...(input.strict === undefined ? {} : { strict: input.strict }),
    ...(input.catalog === undefined ? {} : { catalog: input.catalog }),
  });
  return { findings, notices };
}

/** Locate a single file's candidates, dispatching on its kind. */
function locateFile(
  file: PipelineFile,
  profile: Profile,
): { candidates: Candidate[]; notices: PipelineNotice[] } {
  const kind = file.kind ?? inferKind(file.path);
  const content = stripBom(file.content);

  if (kind === 'yaml' || kind === 'json') {
    return structuredCandidates(kind, content, file.path, profile);
  }

  if (TEXT_KINDS.has(kind)) {
    if (!profile.locator.documentKinds.includes(kind)) {
      // The active profile does not locate over this kind: no candidates, and
      // this is not a problem worth a notice (a mixed file set is normal).
      return { candidates: [], notices: [] };
    }
    return { candidates: locateTextFamily(content, kind, profile, file.path), notices: [] };
  }

  return {
    candidates: [],
    notices: [
      {
        code: 'extract.unsupported_kind',
        severity: 'warning',
        message: `Unsupported document kind for '${file.path}'; no requirements were extracted.`,
        file: file.path,
      },
    ],
  };
}

/** Turn a YAML/JSON structured extraction into candidates plus notices. */
function structuredCandidates(
  kind: 'yaml' | 'json',
  content: string,
  path: string,
  profile: Profile,
): { candidates: Candidate[]; notices: PipelineNotice[] } {
  const result: ExtractResult = kind === 'yaml' ? extractYaml(content, path) : extractJson(content, path);
  const locatorRuleId = `structured.${kind}`;
  const candidates: Candidate[] = result.items.map((item) => {
    const candidate: Candidate = {
      file: path,
      line: item.source?.line ?? 1,
      ...(item.source?.column === undefined ? {} : { col: item.source.column }),
      text: item.text,
      ...(item.id === undefined ? {} : { id: item.id }),
      locatorRuleId,
      profile: profile.name,
    };
    return candidate;
  });
  const notices = result.errors.map((error) => structuredNotice(kind, error));
  return { candidates, notices };
}

/** Map an {@link ExtractError} onto a {@link PipelineNotice}. */
function structuredNotice(kind: 'yaml' | 'json', error: ExtractError): PipelineNotice {
  return {
    code: `extract.malformed_${kind}`,
    severity: 'error',
    message: error.message,
    ...(error.file === undefined ? {} : { file: error.file }),
    ...(error.line === undefined ? {} : { line: error.line }),
  };
}

/** Infer a document kind from a file path's extension. Defaults to `text`. */
export function inferKind(path: string): DocumentKind {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot === -1 ? '' : lower.slice(dot);
  switch (ext) {
    case '.ears':
      return 'ears';
    case '.md':
    case '.markdown':
      return 'markdown';
    case '.yaml':
    case '.yml':
      return 'yaml';
    case '.json':
      return 'json';
    default:
      return 'text';
  }
}
