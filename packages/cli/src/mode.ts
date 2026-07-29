/**
 * The instruction modes and small helpers for validating them.
 */

import { usageError } from './errors.js';

/** The four instruction modes `earsyntax instructions <mode>` accepts. */
export type InstructionMode = 'author' | 'convert' | 'repair' | 'review';

const MODES: readonly InstructionMode[] = ['author', 'convert', 'repair', 'review'];

/** Narrow an arbitrary string to an {@link InstructionMode} or throw a usage error. */
export function requireInstructionMode(value: string | undefined): InstructionMode {
  if (value !== undefined && (MODES as readonly string[]).includes(value)) {
    return value as InstructionMode;
  }
  throw usageError(
    'instructions.unknown_mode',
    `Unknown instructions mode "${value ?? ''}". Expected one of: ${MODES.join(', ')}.`,
  );
}