/**
 * Builds the `next` action list for a work item from its reported status.
 *
 * The loop is walkable: an agent follows `next[].command` without hard-coding
 * the sequence. `forAgent` marks actions safe to run automatically; `blocking`
 * marks the human gate (acceptance).
 */

import type { NextAction, WorkStatus } from './facade-types.js';

/** Next actions for a work item, keyed by its reported status. */
export function nextForStatus(id: string, status: WorkStatus, source?: string): NextAction[] {
  const sourceFlag = source ? ` --source ${source}` : '';
  const validateCmd = `earsyntax validate .earsyntax/work/${id}/requirements.ears${sourceFlag} --json`;

  switch (status) {
    case 'missing':
      return [];
    case 'scaffolded':
      return [
        {
          command: `earsyntax instructions ${source ? 'convert' : 'author'} --work ${id} --json`,
          reason: 'Give the coding agent the rules for writing the .ears file.',
          forAgent: true,
        },
      ];
    case 'drafted':
    case 'invalid':
      return [
        {
          command: `earsyntax instructions repair --work ${id} --json`,
          reason: 'Get targeted repair rules for the reported diagnostics.',
          forAgent: true,
        },
        { command: validateCmd, reason: 'Re-validate after applying the repairs.', forAgent: true },
      ];
    case 'valid':
      return [
        {
          command: `earsyntax instructions review --work ${id} --json`,
          reason: 'Prepare the human review summary.',
          forAgent: true,
        },
        {
          command: `earsyntax accept ${id}`,
          reason: 'Record acceptance after human approval.',
          blocking: true,
        },
      ];
    case 'accepted':
      return [];
    case 'stale':
      return [
        {
          command: `earsyntax instructions convert --work ${id} --json`,
          reason: 'The source changed; re-run the loop against the new source.',
          forAgent: true,
        },
      ];
  }
}