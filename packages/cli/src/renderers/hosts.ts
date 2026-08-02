/**
 * Host integration renderers for `earsyntax init --host`.
 *
 * Kiro gets a steering document and a validation hook; Spec Kit gets an
 * extension document (Spec Kit reserves its own `speckit.*` command namespace
 * and exposes no stable third-party slash-command surface, so earsyntax owns a
 * document under `.specify/extensions/` rather than colliding with generated
 * command files); OpenSpec contributes a managed section with its validate
 * commands to `AGENTS.md`. Every host wrapper pins its own `--profile`, since a
 * host file only ever concerns its own documents.
 */

import { type Contribution, emptyContribution, loopSteps, PHASES } from './protocol.js';

/** The hosts `--host` accepts, in the order the facade lists them. */
export const HOSTS = ['kiro', 'speckit', 'openspec'] as const;
export type Host = (typeof HOSTS)[number];

/** The exact validate command each host suggests, used in steering docs and `next`. */
export const HOST_VALIDATE: Record<Host, { glob: string; command: string }> = {
  kiro: {
    glob: '.kiro/specs/**/requirements.md',
    command: 'earsyntax validate ".kiro/specs/**/requirements.md" --profile kiro',
  },
  speckit: {
    glob: 'specs/**/spec.md',
    command: 'earsyntax validate "specs/**/spec.md" --profile speckit',
  },
  openspec: {
    glob: 'openspec/specs/**/*.md',
    command: 'earsyntax validate "openspec/specs/**/*.md" --profile openspec',
  },
};

/** The four-phase steering body a host document carries, with the profile pinned. */
function steeringBody(profile: Host, fileToken: string): string[] {
  const lines: string[] = [
    'Deterministic EARS authoring and validation loop for this host. Pick the',
    'phase that fits the task, then run this loop against the document:',
    '',
  ];
  for (const phase of PHASES) {
    lines.push(`- ${phase}`);
  }
  lines.push('', ...loopSteps({ file: fileToken, profile }));
  return lines;
}

/** Render the Kiro steering document. */
function kiroSteering(): { path: string; content: string } {
  const content = [
    '# earsyntax steering',
    '',
    ...steeringBody('kiro', '<requirements-file>'),
    '',
    `Validate every Kiro requirements document: ${HOST_VALIDATE.kiro.command}`,
    '',
  ].join('\n');
  return { path: '.kiro/steering/earsyntax.md', content };
}

/**
 * Render the Kiro validation hook. Runs earsyntax validate over Kiro
 * requirements documents when they are saved. The schema is Kiro's agent-hook
 * YAML; the command stays deterministic and offline.
 */
function kiroHook(): { path: string; content: string } {
  const content = [
    '# earsyntax validation hook for Kiro.',
    '# Runs deterministic EARS validation when a requirements document is saved.',
    'name: ears-validate',
    'description: Validate EARS requirements with earsyntax.',
    'on:',
    '  fileEdited:',
    '    patterns:',
    `      - "${HOST_VALIDATE.kiro.glob}"`,
    'run: >-',
    `  ${HOST_VALIDATE.kiro.command} --json`,
    '',
  ].join('\n');
  return { path: '.kiro/hooks/ears-validate.yaml', content };
}

/** Render the Spec Kit extension document. */
function speckitExtension(): { path: string; content: string } {
  const content = [
    '# earsyntax extension for Spec Kit',
    '',
    'Spec Kit owns the specification lifecycle and reserves its `speckit.*`',
    'command namespace. earsyntax adds only the deterministic EARS loop below; it',
    'never creates, plans, or accepts specs.',
    '',
    ...steeringBody('speckit', '<spec-file>'),
    '',
    `Validate every Spec Kit spec: ${HOST_VALIDATE.speckit.command}`,
    '',
  ].join('\n');
  return { path: '.specify/extensions/earsyntax.md', content };
}

/** The OpenSpec managed block for AGENTS.md: the validate commands for specs and changes. */
function openspecBlock(): string {
  return [
    '## earsyntax with OpenSpec',
    '',
    'Validate OpenSpec requirements and scenarios with the deterministic EARS',
    'checker. Never approve, accept, or archive a change based on this run.',
    '',
    `Run: ${HOST_VALIDATE.openspec.command} --json`,
    'Run: earsyntax validate "openspec/changes/**/*.md" --profile openspec --json',
  ].join('\n');
}

/** Render one host's contribution. */
export function renderHost(host: Host): Contribution {
  const contribution = emptyContribution();
  switch (host) {
    case 'kiro':
      contribution.owned = [kiroSteering(), kiroHook()];
      return contribution;
    case 'speckit':
      contribution.owned = [speckitExtension()];
      return contribution;
    case 'openspec':
      contribution.managed = [
        { file: 'AGENTS.md', id: 'openspec-validate', block: openspecBlock() },
      ];
      return contribution;
    default:
      return contribution;
  }
}
