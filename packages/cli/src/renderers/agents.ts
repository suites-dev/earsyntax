/**
 * Agent wrapper renderers for `earsyntax init --agent`.
 *
 * Each agent maps to files in its own convention: Claude slash commands, a
 * Cursor rule, a Copilot prompt, or a managed section inside a shared
 * agent-instructions file (`AGENTS.md` for codex and generic, `GEMINI.md` for
 * gemini). The wrapper body is the thin protocol from {@link loopSteps}; only
 * the surrounding syntax (frontmatter, argument token) differs per agent.
 */

import {
  type Contribution,
  emptyContribution,
  loopSteps,
  PHASES,
  type Phase,
  profileContext,
  type RenderedFile,
} from './protocol.js';

/** The agents `--agent` accepts, in the order the facade lists them. */
export const AGENTS = ['claude', 'codex', 'cursor', 'copilot', 'gemini', 'generic'] as const;
export type Agent = (typeof AGENTS)[number];

/** A one-line description of what each phase's wrapper is for. */
const PHASE_INTRO: Record<Phase, string> = {
  author: 'Author new EARS requirements into a host document.',
  convert: 'Rewrite natural-language requirements already in a host document into EARS.',
  repair: 'Repair the diagnostics earsyntax validate reports in a host document.',
  review: 'Review the EARS requirements in a host document without changing them.',
};

/** The placeholder file token used by every wrapper except Claude commands. */
const FILE_PLACEHOLDER = '<requirements-file>';

/** Render one Claude slash command file for a single phase. */
function claudeCommand(phase: Phase, profile: string, note: string): RenderedFile {
  const body = [
    `---`,
    `description: ${PHASE_INTRO[phase]}`,
    `argument-hint: <requirements-file>`,
    `---`,
    ``,
    `${PHASE_INTRO[phase]} Pass the host document as the argument.`,
    ``,
    ...loopSteps({ phase, file: '$ARGUMENTS', profile }),
    ...(note === '' ? [] : ['', note]),
    ``,
  ].join('\n');
  return { path: `.claude/commands/earsyntax-${phase}.md`, content: body };
}

/** The four-phase wrapper body shared by non-Claude agents (Cursor, Copilot, managed sections). */
function multiPhaseBody(profile: string, note: string): string[] {
  const lines: string[] = [
    'Deterministic EARS authoring and validation loop. Pick the phase that fits',
    'the task, then run this loop against the host document:',
    '',
  ];
  for (const phase of PHASES) {
    lines.push(`${phase}: ${PHASE_INTRO[phase]}`);
  }
  lines.push('', ...loopSteps({ file: FILE_PLACEHOLDER, profile }));
  if (note !== '') {
    lines.push('', note);
  }
  return lines;
}

/** Render the Cursor rule file. */
function cursorRule(profile: string, note: string): RenderedFile {
  const content = [
    `---`,
    `description: EARS authoring and validation loop via earsyntax.`,
    `alwaysApply: false`,
    `---`,
    ``,
    ...multiPhaseBody(profile, note),
    ``,
  ].join('\n');
  return { path: '.cursor/rules/earsyntax.mdc', content };
}

/** Render the Copilot prompt file. */
function copilotPrompt(profile: string, note: string): RenderedFile {
  const content = [
    `---`,
    `mode: agent`,
    `description: EARS authoring and validation loop via earsyntax.`,
    `---`,
    ``,
    ...multiPhaseBody(profile, note),
    ``,
  ].join('\n');
  return { path: '.github/prompts/earsyntax.prompt.md', content };
}

/** The managed-section block shared by codex, generic (AGENTS.md) and gemini (GEMINI.md). */
function agentLoopBlock(profile: string, note: string): string {
  return ['## earsyntax', '', ...multiPhaseBody(profile, note)].join('\n');
}

/**
 * Render one agent's contribution against the configured hosts. `hosts` decides
 * the `--profile` token: one host pins the profile, several make it a
 * placeholder with a selection note.
 */
export function renderAgent(agent: Agent, hosts: readonly string[]): Contribution {
  const { token: profile, note } = profileContext(hosts);
  const contribution = emptyContribution();

  switch (agent) {
    case 'claude':
      contribution.owned = PHASES.map((phase) => claudeCommand(phase, profile, note));
      return contribution;
    case 'cursor':
      contribution.owned = [cursorRule(profile, note)];
      return contribution;
    case 'copilot':
      contribution.owned = [copilotPrompt(profile, note)];
      return contribution;
    case 'codex':
    case 'generic':
      contribution.managed = [
        { file: 'AGENTS.md', id: 'agent-loop', block: agentLoopBlock(profile, note) },
      ];
      return contribution;
    case 'gemini':
      contribution.managed = [
        { file: 'GEMINI.md', id: 'agent-loop', block: agentLoopBlock(profile, note) },
      ];
      return contribution;
  }
}
