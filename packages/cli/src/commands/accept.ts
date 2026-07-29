/**
 * `earsyntax accept <slug>` — record that a human accepted the `.ears` file.
 *
 * The human gate. Refuses (exit 3) when the status is not `valid`, when the
 * source is stale, or when the `.ears` output changed since it was validated.
 * On success it writes the `accepted` block and never touches source or output.
 */

import type { CommandContext } from '../context.js';
import type { WorkManifest } from '../facade-types.js';
import { refusalError, usageError } from '../errors.js';
import { loadConfig, requireRoot } from '../project.js';
import { buildResponse, emit } from '../response.js';
import { currentOutputHash, isStale, requireManifest, writeManifest } from '../workspace.js';

export function acceptCommand(context: CommandContext): number {
  const root = requireRoot(context.cwd);
  const config = loadConfig(root, context.global.config);

  const slug = context.args.positionals.at(0);
  if (slug === undefined) {
    throw usageError('accept.missing_slug', 'Provide a work-item slug to accept.');
  }
  const { paths, manifest } = requireManifest(root, config, slug);

  if (manifest.status !== 'valid') {
    throw refusalError(
      'accept.not_valid',
      `Cannot accept "${slug}": status is ${manifest.status}, not valid. Validate it first.`,
    );
  }
  if (isStale(root, manifest)) {
    throw refusalError(
      'accept.stale',
      `Cannot accept "${slug}": the source changed since it was validated. Re-run the loop.`,
    );
  }
  const outputHash = currentOutputHash(root, manifest);
  if (outputHash === undefined) {
    throw refusalError(
      'accept.output_missing',
      `Cannot accept "${slug}": the .ears output is unreadable.`,
    );
  }
  if (manifest.output.hash !== undefined && outputHash !== manifest.output.hash) {
    throw refusalError(
      'accept.output_changed',
      `Cannot accept "${slug}": the .ears file was edited after validation. Re-validate first.`,
    );
  }

  const by = context.args.values.get('by');
  const accepted: WorkManifest['accepted'] = {
    at: new Date().toISOString(),
    ...(by !== undefined ? { by } : {}),
    ...(manifest.source?.hash !== undefined ? { sourceHash: manifest.source.hash } : {}),
    outputHash,
  };

  const updated: WorkManifest = { ...manifest, status: 'accepted', accepted };
  writeManifest(paths, updated);

  const work: Record<string, unknown> = {
    id: manifest.id,
    status: 'accepted',
    mode: manifest.mode,
    source: manifest.source?.path ?? null,
    output: manifest.output.path,
    accepted,
  };

  const response = buildResponse({ command: 'accept', ok: true, root, next: [] }, { work });
  const pretty = `Accepted "${slug}"${by ? ` by ${by}` : ''}.`;
  emit(context.emitter, response, pretty);
  return 0;
}
