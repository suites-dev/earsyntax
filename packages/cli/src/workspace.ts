/**
 * Work-item file operations: locating, reading, and writing the manifest and
 * its sibling artifacts, plus computed status and staleness.
 *
 * Staleness is computed, never stored: a `valid` or `accepted` item is reported
 * `stale` when the current source content hashes differently from the hash
 * recorded when the item last reached `valid`/`accepted`.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { usageError } from './errors.js';
import { hashContent } from './hash.js';
import { type EarsyntaxConfig, resolveInput, toRelative } from './project.js';
import type { SourceKind, WorkManifest, WorkStatus, WorkSummary } from './facade-types.js';

/** Absolute paths for a work item's directory and artifacts. */
export interface WorkPaths {
  dir: string;
  manifest: string;
  requirements: string;
  questions: string;
  traceability: string;
  validationJson: string;
  validationMarkdown: string;
}

/** Compute the absolute artifact paths for a work item slug. */
export function workPaths(root: string, config: EarsyntaxConfig, slug: string): WorkPaths {
  const dir = resolve(root, config.workDir, slug);
  return {
    dir,
    manifest: resolve(dir, 'manifest.json'),
    requirements: resolve(dir, 'requirements.ears'),
    questions: resolve(dir, 'questions.md'),
    traceability: resolve(dir, 'traceability.json'),
    validationJson: resolve(dir, 'validation.json'),
    validationMarkdown: resolve(dir, 'validation.md'),
  };
}

/** Read and parse a manifest, or return undefined when the item does not exist. */
export function readManifest(paths: WorkPaths): WorkManifest | undefined {
  if (!existsSync(paths.manifest)) {
    return undefined;
  }
  const raw = readFileSync(paths.manifest, 'utf8');
  return JSON.parse(raw) as WorkManifest;
}

/** Resolve a work item's paths and manifest, throwing a usage error when unknown. */
export function requireManifest(
  root: string,
  config: EarsyntaxConfig,
  slug: string,
): { paths: WorkPaths; manifest: WorkManifest } {
  const paths = workPaths(root, config, slug);
  const manifest = readManifest(paths);
  if (manifest === undefined) {
    throw usageError('work.unknown', `Unknown work item "${slug}".`);
  }
  return { paths, manifest };
}

/** Persist a manifest, bumping `updatedAt`. */
export function writeManifest(paths: WorkPaths, manifest: WorkManifest): void {
  const next = { ...manifest, updatedAt: new Date().toISOString() };
  writeFileSync(paths.manifest, `${JSON.stringify(next, null, 2)}\n`);
}

/** List every work-item slug under the configured work directory, sorted. */
export function listSlugs(root: string, config: EarsyntaxConfig): string[] {
  const base = resolve(root, config.workDir);
  if (!existsSync(base)) {
    return [];
  }
  return readdirSync(base)
    .filter((name) => {
      const entry = resolve(base, name);
      return statSync(entry).isDirectory() && existsSync(resolve(entry, 'manifest.json'));
    })
    .sort((a, b) => a.localeCompare(b));
}

/** Classify a source file by extension for the manifest `source.kind`. */
export function sourceKind(path: string): SourceKind {
  const lower = path.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'markdown';
  }
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return 'yaml';
  }
  if (lower.endsWith('.json')) {
    return 'json';
  }
  return 'text';
}

/**
 * The hash of the current source content on disk, or undefined when the source
 * is absent or unreadable. `sourceInput` is the manifest-stored path resolved
 * against the root.
 */
export function currentSourceHash(
  root: string,
  sourcePath: string | undefined,
): string | undefined {
  if (sourcePath === undefined) {
    return undefined;
  }
  const abs = resolveInput(root, sourcePath);
  try {
    return hashContent(readFileSync(abs, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Whether a work item is stale: its recorded source hash differs from the
 * source content on disk now. Only `valid` and `accepted` items can be stale.
 */
export function isStale(root: string, manifest: WorkManifest): boolean {
  if (manifest.status !== 'valid' && manifest.status !== 'accepted') {
    return false;
  }
  const recorded =
    manifest.status === 'accepted' ? manifest.accepted?.sourceHash : manifest.source?.hash;
  if (recorded === undefined) {
    return false;
  }
  const current = currentSourceHash(root, manifest.source?.path);
  if (current === undefined) {
    return false;
  }
  return current !== recorded;
}

/** The status to report to callers, applying computed staleness on top of the stored status. */
export function reportedStatus(root: string, manifest: WorkManifest): WorkStatus {
  return isStale(root, manifest) ? 'stale' : manifest.status;
}

/** Build the compact {@link WorkSummary} used by instructions, list, and show. */
export function toWorkSummary(root: string, manifest: WorkManifest): WorkSummary {
  return {
    id: manifest.id,
    status: reportedStatus(root, manifest),
    ...(manifest.source?.path !== undefined ? { source: manifest.source.path } : {}),
    output: manifest.output.path,
    questions: manifest.artifacts.questions,
    traceability: manifest.artifacts.traceability,
  };
}

/** The absolute output `.ears` path for a manifest, resolved against the root. */
export function outputAbs(root: string, manifest: WorkManifest): string {
  return resolveInput(root, manifest.output.path);
}

/** The hash of the current `.ears` output on disk, or undefined when absent. */
export function currentOutputHash(root: string, manifest: WorkManifest): string | undefined {
  const abs = outputAbs(root, manifest);
  try {
    return hashContent(readFileSync(abs, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Whether the `.ears` output has content (drives scaffolded -> drafted). */
export function outputHasContent(root: string, manifest: WorkManifest): boolean {
  const abs = outputAbs(root, manifest);
  try {
    return readFileSync(abs, 'utf8').trim() !== '';
  } catch {
    return false;
  }
}

/** Render a manifest's path fields relative to the root for JSON output. */
export function relPaths(root: string, paths: WorkPaths): Record<string, string> {
  return {
    manifest: toRelative(root, paths.manifest),
    requirements: toRelative(root, paths.requirements),
    questions: toRelative(root, paths.questions),
    traceability: toRelative(root, paths.traceability),
    validationJson: toRelative(root, paths.validationJson),
    validationMarkdown: toRelative(root, paths.validationMarkdown),
  };
}
