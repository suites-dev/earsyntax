/**
 * Profile-driven host-native locator for `@earsyntax/extract`. Not part of the
 * public API surface directly; consumed by `./pipeline.ts`.
 *
 * Given a document's content, its kind, and the active profile, this module
 * produces the requirement {@link Candidate}s the profile's locator selects,
 * each carrying its original 1-based `line` and `col` in the source document.
 *
 * Three text-family kinds are handled here:
 *
 * - `ears` and `text`: the trivial every-line rule. Every non-empty, non-comment
 *   line is a candidate.
 * - `markdown`: the `heading-section`, `list-item`, and `block` locator rules,
 *   with fenced code honored per `locator.codeFences` and non-requirement
 *   sections removed by the profile's `exclude` rules.
 *
 * Structured kinds (`yaml`, `json`) are located by `./pipeline.ts` from parsed
 * data, not here. User-story wrapper lines are skipped when the dialect sets
 * `allowStoryWrapper`; frame-metadata prefixes (`REQ-001:`, `[source: ...]`) are
 * lifted only when the dialect sets `allowFrameMetadata`.
 *
 * Determinism: pure string processing. No clock, file system, or network.
 */

import { isStoryWrapperLine, type Candidate, type LocatorRule, type Profile } from '@earsyntax/core';
import { splitId } from './internal.js';
import { classifyFences } from './markdown-scan.js';

/** The text-family document kinds this locator handles. */
export type TextKind = 'ears' | 'text' | 'markdown';

const BULLET = /^(\s*)([-*+])(\s+)(.+)$/;
const NUMBERED = /^(\s*)(\d+)([.)])(\s+)(.+)$/;
const HEADING = /^(#{1,6})\s+(.*\S)\s*$/;

/**
 * Locate requirement candidates in a text-family document under a profile.
 *
 * @param content Raw (already BOM-stripped) document content.
 * @param kind The document kind (`ears`, `text`, or `markdown`).
 * @param profile The active profile.
 * @param file The source file path recorded on each candidate.
 * @returns The located candidates, in document order.
 */
export function locateTextFamily(
  content: string,
  kind: TextKind,
  profile: Profile,
  file: string,
): Candidate[] {
  const lines = content.split('\n');
  if (kind === 'markdown') {
    return locateMarkdown(lines, profile, file);
  }
  return locateEveryLine(lines, profile, file);
}

/**
 * Every-line locator for `.ears` and plain text: one candidate per non-empty,
 * non-comment line. Lines whose first non-whitespace character is `#` are
 * comments and are skipped.
 */
function locateEveryLine(lines: string[], profile: Profile, file: string): Candidate[] {
  const ruleId = profile.locator.include[0]?.id ?? `${profile.name}.every-line`;
  const allowFrameMetadata = profile.dialect.allowFrameMetadata;
  const allowStoryWrapper = profile.dialect.allowStoryWrapper;
  const candidates: Candidate[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const candidate = buildCandidate(raw, 0, i + 1, ruleId, profile, file, allowFrameMetadata);
    if (candidate === undefined) {
      continue;
    }
    if (allowStoryWrapper && isStoryWrapperLine(candidate.text)) {
      continue;
    }
    candidates.push(candidate);
  }
  return candidates;
}

interface MarkdownModel {
  lines: string[];
  fenceStates: string[];
  /** Per-line ancestor heading texts (trimmed), outermost first. */
  headingStacks: string[][];
  /** Per-line heading level, or 0 when the line is not a heading. */
  headingLevels: number[];
}

/** Build the per-line heading context and fence classification once. */
function buildMarkdownModel(lines: string[]): MarkdownModel {
  const fenceStates = classifyFences(lines);
  const headingStacks: string[][] = [];
  const headingLevels: number[] = [];
  const stack: { level: number; text: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const isHeading = fenceStates[i] === 'outside' ? HEADING.exec(lines[i]) : null;
    if (isHeading) {
      const level = isHeading[1].length;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      // The heading line's own context is its ancestors, before it is pushed.
      headingStacks.push(stack.map((h) => h.text));
      headingLevels.push(level);
      stack.push({ level, text: isHeading[2].trim() });
    } else {
      headingStacks.push(stack.map((h) => h.text));
      headingLevels.push(0);
    }
  }
  return { lines, fenceStates, headingStacks, headingLevels };
}

/** Markdown locator: run each include rule, then remove excluded regions. */
function locateMarkdown(lines: string[], profile: Profile, file: string): Candidate[] {
  const model = buildMarkdownModel(lines);
  const includeCode = profile.locator.codeFences === 'include';
  const excluded = excludedLineSet(model, profile);

  const byLine = new Map<number, Candidate>();
  for (const rule of profile.locator.include) {
    for (const candidate of applyIncludeRule(rule, model, profile, file, includeCode)) {
      const key = candidate.line;
      if (excluded.has(key) || byLine.has(key)) {
        continue;
      }
      byLine.set(key, candidate);
    }
  }

  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

/** The union of line indices (0-based) removed by the profile's exclude rules. */
function excludedLineSet(model: MarkdownModel, profile: Profile): Set<number> {
  const excluded = new Set<number>();
  for (const rule of profile.locator.exclude) {
    if (rule.kind === 'heading-section' && rule.headingPattern !== undefined) {
      const re = compile(rule.headingPattern);
      for (let i = 0; i < model.lines.length; i++) {
        if (model.headingStacks[i].some((text) => re.test(text))) {
          excluded.add(i + 1);
        }
      }
    }
  }
  return excluded;
}

/** Run one include rule, yielding candidates (keyed later by line). */
function applyIncludeRule(
  rule: LocatorRule,
  model: MarkdownModel,
  profile: Profile,
  file: string,
  includeCode: boolean,
): Candidate[] {
  switch (rule.kind) {
    case 'heading-section':
      return headingSectionCandidates(rule, model, profile, file, includeCode);
    case 'list-item':
      return listItemCandidates(rule, model, profile, file, includeCode);
    case 'block':
      return blockCandidates(rule, model, profile, file, includeCode);
    case 'every-line':
      // An every-line rule inside a markdown profile: treat each eligible line as
      // a candidate. Not used by the built-ins but supported for completeness.
      return bodyLineCandidates(
        model,
        profile,
        file,
        includeCode,
        rule.id,
        () => true,
      );
    default:
      return [];
  }
}

/** Candidates from body lines under headings matching `headingPattern`. */
function headingSectionCandidates(
  rule: LocatorRule,
  model: MarkdownModel,
  profile: Profile,
  file: string,
  includeCode: boolean,
): Candidate[] {
  if (rule.headingPattern === undefined) {
    return [];
  }
  const re = compile(rule.headingPattern);
  return bodyLineCandidates(model, profile, file, includeCode, rule.id, (i) =>
    model.headingLevels[i] === 0 && model.headingStacks[i].some((text) => re.test(text)),
  );
}

/** Candidates from `blockPrefix` blocks: body lines until the next same/higher heading. */
function blockCandidates(
  rule: LocatorRule,
  model: MarkdownModel,
  profile: Profile,
  file: string,
  includeCode: boolean,
): Candidate[] {
  if (rule.blockPrefix === undefined) {
    return [];
  }
  const prefix = rule.blockPrefix.trim();
  const prefixLevel = leadingHashes(prefix);
  const inBlock = new Array<boolean>(model.lines.length).fill(false);

  let open = false;
  for (let i = 0; i < model.lines.length; i++) {
    if (model.fenceStates[i] === 'outside' && model.lines[i].trim().startsWith(prefix)) {
      open = true;
      continue; // the prefix heading line itself is not a candidate
    }
    if (open && model.headingLevels[i] > 0 && model.headingLevels[i] <= prefixLevel) {
      open = false;
    }
    inBlock[i] = open;
  }

  return bodyLineCandidates(model, profile, file, includeCode, rule.id, (i) => inBlock[i]);
}

/** Candidates from list items, optionally under a heading and filtered by marker. */
function listItemCandidates(
  rule: LocatorRule,
  model: MarkdownModel,
  profile: Profile,
  file: string,
  includeCode: boolean,
): Candidate[] {
  const underRe = rule.underHeading === undefined ? undefined : compile(rule.underHeading);
  const marker = rule.listMarker ?? 'any';
  const allowFrameMetadata = profile.dialect.allowFrameMetadata;
  const allowStoryWrapper = profile.dialect.allowStoryWrapper;
  const candidates: Candidate[] = [];

  let i = 0;
  while (i < model.lines.length) {
    if (!lineEligible(model, i, includeCode)) {
      i++;
      continue;
    }
    const item = matchListItem(model.lines[i], marker);
    if (item === undefined) {
      i++;
      continue;
    }
    if (underRe !== undefined && !model.headingStacks[i].some((text) => underRe.test(text))) {
      i++;
      continue;
    }

    const gathered = gatherContinuations(model, i, item.markerIndent, includeCode);
    const candidate = buildCandidate(
      model.lines[i],
      item.contentStart,
      i + 1,
      rule.id,
      profile,
      file,
      allowFrameMetadata,
      gathered.extra,
    );
    i = gathered.next;
    if (candidate === undefined) {
      continue;
    }
    if (allowStoryWrapper && isStoryWrapperLine(candidate.text)) {
      continue;
    }
    candidates.push(candidate);
  }
  return candidates;
}

/**
 * Shared body-line candidate builder: emit one candidate per eligible line that
 * `predicate` selects, stripping a leading list marker when present.
 */
function bodyLineCandidates(
  model: MarkdownModel,
  profile: Profile,
  file: string,
  includeCode: boolean,
  ruleId: string,
  predicate: (lineIndex: number) => boolean,
): Candidate[] {
  const allowFrameMetadata = profile.dialect.allowFrameMetadata;
  const allowStoryWrapper = profile.dialect.allowStoryWrapper;
  const candidates: Candidate[] = [];

  for (let i = 0; i < model.lines.length; i++) {
    if (!lineEligible(model, i, includeCode) || !predicate(i)) {
      continue;
    }
    const marker = matchListItem(model.lines[i], 'any');
    const contentStart = marker === undefined ? 0 : marker.contentStart;
    const candidate = buildCandidate(
      model.lines[i],
      contentStart,
      i + 1,
      ruleId,
      profile,
      file,
      allowFrameMetadata,
    );
    if (candidate === undefined) {
      continue;
    }
    if (allowStoryWrapper && isStoryWrapperLine(candidate.text)) {
      continue;
    }
    candidates.push(candidate);
  }
  return candidates;
}

/** Whether a markdown line can hold a candidate (not blank, not a heading, fence-aware). */
function lineEligible(model: MarkdownModel, i: number, includeCode: boolean): boolean {
  const state = model.fenceStates[i];
  if (state === 'open' || state === 'close') {
    return false;
  }
  if (state === 'inside' && !includeCode) {
    return false;
  }
  if (model.headingLevels[i] > 0) {
    return false;
  }
  return model.lines[i].trim() !== '';
}

interface ListItemMatch {
  markerIndent: number;
  contentStart: number;
}

/** Match a bullet or numbered list item, honoring the marker filter. */
function matchListItem(raw: string, marker: 'bullet' | 'ordered' | 'any'): ListItemMatch | undefined {
  if (marker !== 'ordered') {
    const bullet = BULLET.exec(raw);
    if (bullet) {
      return { markerIndent: bullet[1].length, contentStart: raw.length - bullet[4].length };
    }
  }
  if (marker !== 'bullet') {
    const numbered = NUMBERED.exec(raw);
    if (numbered) {
      return { markerIndent: numbered[1].length, contentStart: raw.length - numbered[5].length };
    }
  }
  return undefined;
}

/** Gather indented continuation lines that belong to a list item. */
function gatherContinuations(
  model: MarkdownModel,
  start: number,
  markerIndent: number,
  includeCode: boolean,
): { extra: string[]; next: number } {
  const extra: string[] = [];
  let j = start + 1;
  while (j < model.lines.length) {
    const line = model.lines[j];
    if (line.trim() === '' || !lineEligible(model, j, includeCode)) {
      break;
    }
    const indent = line.length - line.trimStart().length;
    if (indent <= markerIndent || matchListItem(line, 'any') !== undefined) {
      break;
    }
    extra.push(line.trim());
    j++;
  }
  return { extra, next: j };
}

/**
 * Build one {@link Candidate}, computing the 1-based column of the text's first
 * character in the raw line and lifting a frame-metadata prefix when allowed.
 *
 * Returns `undefined` when the resulting text is empty (nothing to lint).
 */
function buildCandidate(
  raw: string,
  contentStart: number,
  line: number,
  locatorRuleId: string,
  profile: Profile,
  file: string,
  allowFrameMetadata: boolean,
  continuation: string[] = [],
): Candidate | undefined {
  const region = raw.slice(contentStart);
  const leadingWs = region.length - region.trimStart().length;
  let textStart = contentStart + leadingWs;
  let text = region.trim();
  let id: string | undefined;

  if (allowFrameMetadata) {
    const split = splitId(text);
    if (split.id !== undefined || split.ref !== undefined) {
      // The stripped prefix is the removed leading run; advance the column past
      // it so the reported position points at the requirement text. A declared
      // `[source: ...]` reference is stripped from the text but does not move the
      // physical position (the finding must point where the text actually is).
      textStart += text.length - split.text.length;
      text = split.text;
      id = split.id;
    }
  }

  if (continuation.length > 0) {
    text = [text, ...continuation].join(' ').trim();
  }
  if (text === '') {
    return undefined;
  }

  const candidate: Candidate = {
    file,
    line,
    col: textStart + 1,
    text,
    ...(id === undefined ? {} : { id }),
    locatorRuleId,
    profile: profile.name,
  };
  return candidate;
}

/** Count leading `#` characters on a trimmed heading-like prefix. */
function leadingHashes(prefix: string): number {
  let n = 0;
  while (n < prefix.length && prefix[n] === '#') {
    n++;
  }
  return n;
}

/** Compile a locator regex source, case-insensitive over trimmed heading text. */
function compile(source: string): RegExp {
  return new RegExp(source, 'i');
}
