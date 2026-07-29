/**
 * `earsyntax status [<slug>]` — report one work item's state and next steps.
 *
 * Read-only. With no slug it resolves the single work item when there is
 * exactly one. `status` reports computed staleness on top of the stored status.
 */

import type { CommandContext } from '../context.js';
import { usageError } from '../errors.js';
import { loadConfig, requireRoot } from '../project.js';
import { buildResponse, emit } from '../response.js';
import { nextForStatus } from '../next-actions.js';
import { isStale, listSlugs, reportedStatus, requireManifest } from '../workspace.js';

function resolveSlug(context: CommandContext, root: string, config: ReturnType<typeof loadConfig>): string {
  const explicit = context.args.positionals.at(0);
  if (explicit !== undefined) {
    return explicit;
  }
  const slugs = listSlugs(root, config);
  const only = slugs.at(0);
  if (slugs.length === 1 && only !== undefined) {
    return only;
  }
  if (slugs.length === 0) {
    throw usageError('status.no_work', 'No work items found. Run `earsyntax new` first.');
  }
  throw usageError('status.ambiguous', `Specify a work item: ${slugs.join(', ')}.`);
}

export function statusCommand(context: CommandContext): number {
  const root = requireRoot(context.cwd);
  const config = loadConfig(root, context.global.config);
  const slug = resolveSlug(context, root, config);
  const { manifest } = requireManifest(root, config, slug);

  const status = reportedStatus(root, manifest);
  const work: Record<string, unknown> = {
    id: manifest.id,
    status,
    mode: manifest.mode,
    source: manifest.source?.path ?? null,
    output: manifest.output.path,
    sourceHash: manifest.source?.hash ?? null,
    outputHash: manifest.output.hash ?? null,
    acceptedHash: manifest.accepted?.outputHash ?? null,
    stale: isStale(root, manifest),
  };

  const response = buildResponse(
    { command: 'status', ok: true, root, next: nextForStatus(manifest.id, status, manifest.source?.path) },
    { work },
  );

  const pretty = [
    `${manifest.id}: ${status} (${manifest.mode})`,
    manifest.source?.path ? `  source: ${manifest.source.path}` : '  source: (none)',
    `  output: ${manifest.output.path}`,
  ].join('\n');

  emit(context.emitter, response, pretty);
  return 0;
}