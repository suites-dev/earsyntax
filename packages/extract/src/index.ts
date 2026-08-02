/**
 * `@earsyntax/extract` public API surface.
 *
 * The host-native pipeline (locate + extract stages, composed with core's
 * findings assembly) is the only extraction surface this package exposes.
 * Every extractor is a pure function of its input string; nothing here touches
 * the disk.
 *
 * This package never lints or parses EARS semantics and has no dependency on
 * the core parser internals; it imports types only.
 */

export type { ExtractError, ExtractResult } from './types.js';

// --- Host-native pipeline (Agent W2). Locate + extract stages plus the full
// pipeline composed with @earsyntax/core's findings assembly. ---
export { extractCandidates, runPipeline, inferKind } from './pipeline.js';
export type {
  DocumentKind,
  PipelineFile,
  ExtractCandidatesInput,
  ExtractCandidatesResult,
  RunPipelineInput,
  RunPipelineResult,
} from './pipeline.js';
// Re-exported from @earsyntax/core so callers get the candidate/notice shapes
// without a separate core import.
export type { Candidate, PipelineNotice } from '@earsyntax/core';
