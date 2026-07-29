/**
 * `earsyntax show <slug> [--artifact <name>]` — resolve artifact paths or print
 * artifact content. Read-only.
 *
 * Without `--artifact`, returns resolved paths for every artifact. With one,
 * returns `{ path, exists, content }`, where content is the UTF-8 text when the
 * file exists and null otherwise, so an agent needs no second read.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { CommandContext } from '../context.js';
import { usageError } from '../errors.js';
import { loadConfig, requireRoot, toRelative } from '../project.js';
import { buildResponse, emit } from '../response.js';
import { reportedStatus, requireManifest } from '../workspace.js';

const ARTIFACTS = ['requirements', 'questions', 'traceability', 'validation', 'manifest'] as const;
type ArtifactName = (typeof ARTIFACTS)[number];

export function showCommand(context: CommandContext): number {
  const root = requireRoot(context.cwd);
  const config = loadConfig(root, context.global.config);

  const slug = context.args.positionals.at(0);
  if (slug === undefined) {
    throw usageError('show.missing_slug', 'Provide a work-item slug.');
  }
  const { paths, manifest } = requireManifest(root, config, slug);

  const absFor: Record<ArtifactName, string> = {
    requirements: paths.requirements,
    questions: paths.questions,
    traceability: paths.traceability,
    validation: paths.validationJson,
    manifest: paths.manifest,
  };

  const artifactFlag = context.args.values.get('artifact');
  if (artifactFlag !== undefined) {
    if (!(ARTIFACTS as readonly string[]).includes(artifactFlag)) {
      throw usageError(
        'show.unknown_artifact',
        `Unknown artifact "${artifactFlag}". Expected one of: ${ARTIFACTS.join(', ')}.`,
      );
    }
    const abs = absFor[artifactFlag as ArtifactName];
    const exists = existsSync(abs);
    let content: string | null = null;
    if (exists) {
      try {
        content = readFileSync(abs, 'utf8');
      } catch {
        content = null;
      }
    }
    const artifact = { path: toRelative(root, abs), exists, content };
    const response = buildResponse({ command: 'show', ok: true, root, next: [] }, { artifact });
    emit(context.emitter, response, content ?? `${toRelative(root, abs)} (missing)`);
    return 0;
  }

  const work = {
    id: manifest.id,
    status: reportedStatus(root, manifest),
    source: manifest.source?.path ?? null,
    output: manifest.output.path,
    requirements: toRelative(root, paths.requirements),
    questions: toRelative(root, paths.questions),
    traceability: toRelative(root, paths.traceability),
    validation: toRelative(root, paths.validationJson),
    manifest: toRelative(root, paths.manifest),
  };
  const response = buildResponse({ command: 'show', ok: true, root, next: [] }, { work });
  const pretty = Object.entries(work)
    .map(([key, value]) => `  ${key}: ${String(value)}`)
    .join('\n');
  emit(context.emitter, response, pretty);
  return 0;
}
