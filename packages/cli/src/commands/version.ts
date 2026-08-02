/**
 * `earsyntax version` — version and feature discovery.
 *
 * Never resolves a repo, so `root` is absent. The response always carries the
 * {@link FEATURES} capability map; `--features` only expands the pretty output.
 */

import type { CommandContext, CommandResult } from '../context.js';
import { buildResponse } from '../response.js';
import { CLI_VERSION, FEATURES } from '../version.js';

export function versionCommand(context: CommandContext): CommandResult {
  const response = buildResponse(
    { command: 'version', ok: true, next: [] },
    { features: FEATURES },
  );

  const pretty = context.args.booleans.has('features')
    ? [
        `earsyntax ${CLI_VERSION}`,
        `  facade contract: ${FEATURES.facade}`,
        `  commands:        ${FEATURES.commands.join(', ')}`,
        `  profiles:        ${FEATURES.profiles.join(', ')}`,
        `  instructions:    ${FEATURES.instructions.join(', ')}`,
        `  hosts:           ${FEATURES.hosts.join(', ')}`,
        `  agents:          ${FEATURES.agents.join(', ')}`,
        `  input formats:   ${FEATURES.inputFormats.join(', ')}`,
        `  output formats:  ${FEATURES.outputFormats.join(', ')}`,
        `  sarif:           ${FEATURES.sarif ? 'yes' : 'no'}`,
      ].join('\n')
    : `earsyntax ${CLI_VERSION}`;

  return { response, pretty, exitCode: 0 };
}
