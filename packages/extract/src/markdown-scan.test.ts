/**
 * Tests for the shared Markdown scanning primitives: fence tracking by marker
 * character and length, and pipe-row splitting that respects escaped pipes and
 * inline code spans. These lock the Codex-review fixes in place.
 */

import { describe, expect, it } from 'vitest';
import { classifyFences, FenceTracker, splitTableRow } from './markdown-scan.js';

describe('FenceTracker', () => {
  it('closes a backtick fence only on a matching-or-longer backtick run', () => {
    const tracker = new FenceTracker();
    expect(tracker.feed('````')).toBe('open');
    // A shorter run does not close a longer fence.
    expect(tracker.feed('```')).toBe('inside');
    expect(tracker.isOpen).toBe(true);
    expect(tracker.feed('````')).toBe('close');
    expect(tracker.isOpen).toBe(false);
  });

  it('does not close a tilde fence with a backtick run', () => {
    const states = classifyFences(['~~~', 'code line', '```', 'still code', '~~~', 'outside']);
    expect(states).toEqual(['open', 'inside', 'inside', 'inside', 'close', 'outside']);
  });
});

describe('splitTableRow', () => {
  it('drops leading and trailing pipes and trims cells', () => {
    expect(splitTableRow('| ID | Requirement |')).toEqual(['ID', 'Requirement']);
  });

  it('accepts rows without a leading pipe (GFM)', () => {
    expect(splitTableRow('ID | Requirement')).toEqual(['ID', 'Requirement']);
  });

  it('does not split on an escaped pipe', () => {
    expect(splitTableRow('| a \\| b | c |')).toEqual(['a \\| b', 'c']);
  });

  it('does not split on a pipe inside an inline code span', () => {
    expect(splitTableRow('| `a | b` | c |')).toEqual(['`a | b`', 'c']);
  });
});
