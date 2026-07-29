/**
 * `earsyntax list` — list work items, sorted by id.
 *
 * Read-only. `--status <state>` filters by the reported (computed) status, so
 * `--status stale` surfaces items whose source drifted after validation.
 */

import type { CommandContext } from '../context.js';
import type { WorkStatus } from '../facade-types.js';
import { loadConfig, requireRoot } from '../project.js';
import { buildResponse, emit } from '../response.js';
import { listSlugs, readManifest, toWorkSummary, workPaths } from '../workspace.js';

export function listCommand(context: CommandContext): number {
  const root = requireRoot(context.cwd);
  const config = loadConfig(root, context.global.config);
  const filter = context.args.values.get('status') as WorkStatus | undefined;

  const items = listSlugs(root, config)
    .map((slug) => readManifest(workPaths(root, config, slug)))
    .filter((manifest): manifest is NonNullable<typeof manifest> => manifest !== undefined)
    .map((manifest) => toWorkSummary(root, manifest))
    .filter((summary) => filter === undefined || summary.status === filter);

  const response = buildResponse({ command: 'list', ok: true, root, next: [] }, { items });

  const pretty =
    items.length === 0
      ? 'No work items.'
      : items.map((item) => `${item.id}  ${item.status}`).join('\n');

  emit(context.emitter, response, pretty);
  return 0;
}