/**
 * `earsyntax version` — version and feature discovery.
 *
 * Never resolves a project, so `root` is absent. With `--features` (or `--json`)
 * the response carries the {@link FEATURES} capability map agents branch on.
 */

import type { CommandContext } from '../context.js';
import { buildResponse, emit } from '../response.js';
import { CLI_VERSION, FEATURES } from '../version.js';

export function versionCommand(context: CommandContext): number {
  const response = buildResponse({ command: 'version', ok: true, next: [] }, { features: FEATURES });

  const pretty = context.args.booleans.has('features')
    ? [
        `earsyntax ${CLI_VERSION}`,
        `  facade contract: ${FEATURES.facade}`,
        `  instructions:    ${FEATURES.instructions.join(', ')}`,
        `  input formats:   ${FEATURES.inputFormats.join(', ')}`,
        `  output formats:  ${FEATURES.outputFormats.join(', ')}`,
        `  sarif:           ${FEATURES.sarif ? 'yes' : 'no'}`,
      ].join('\n')
    : `earsyntax ${CLI_VERSION}`;

  emit(context.emitter, response, pretty);
  return 0;
}