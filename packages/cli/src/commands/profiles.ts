/**
 * `earsyntax profiles` — list the built-in profiles.
 *
 * The five built-ins are rendered straight from {@link summarizeProfiles} in
 * `@earsyntax/core`, which derives each profile's locator summary, relaxations,
 * additions, and severity overrides from the profile data objects. There is no
 * hand-written per-profile prose in this module: both the JSON payload and the
 * pretty text are projections of the same `ProfileDiff[]`, so nothing here can
 * drift from the profile data. `strict` is the baseline, so it carries empty
 * `relaxes`, `adds`, and `severityOverrides`.
 *
 * The `profiles` key of the `--json` envelope is exactly the `ProfileDiff[]`
 * array in the frozen order `strict`, `ears-x`, `kiro`, `speckit`, `openspec`.
 * The command resolves no repo and never fails: exit `0`.
 */

import { type ProfileDiff, summarizeProfiles } from '@earsyntax/core';
import type { CommandContext, CommandResult } from '../context.js';
import { buildResponse } from '../response.js';

/** Render one profile diff as a compact pretty block, labels apart from data. */
function prettyProfile(diff: ProfileDiff): string {
  const lines = [diff.name, `  locates: ${diff.locates}`];
  if (diff.relaxes.length > 0) {
    lines.push(`  relaxes: ${diff.relaxes.join(', ')}`);
  }
  if (diff.adds.length > 0) {
    lines.push(`  adds: ${diff.adds.join(', ')}`);
  }
  const overrides = Object.entries(diff.severityOverrides);
  if (overrides.length > 0) {
    lines.push(`  severity: ${overrides.map(([id, level]) => `${id}=${level}`).join(', ')}`);
  }
  if (diff.relaxes.length === 0 && diff.adds.length === 0 && overrides.length === 0) {
    lines.push('  no differences from strict.');
  }
  return lines.join('\n');
}

/**
 * The `profiles` command handler. Lists the built-in profiles from profile data
 * and returns the {@link CommandResult}; the dispatcher performs the single
 * write. Takes no positionals or flags beyond the universal set, resolves no
 * repo, and always exits `0`.
 */
export function profilesCommand(_context: CommandContext): CommandResult {
  const profiles = summarizeProfiles();
  const response = buildResponse({ command: 'profiles', ok: true, next: [] }, { profiles });
  const pretty = profiles.map(prettyProfile).join('\n\n');
  return { response, pretty, exitCode: 0 };
}
