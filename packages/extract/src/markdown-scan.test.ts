/**
 * Tests for the shared Markdown scanning primitive: fence tracking by marker
 * character and length. These lock the Codex-review fixes in place.
 */

import { describe, expect, it } from 'vitest';
import { classifyFences, FenceTracker } from './markdown-scan.js';

describe('FenceTracker', () => {
  it('closes a backtick fence only on a matching-or-longer backtick run', () => {
    const tracker = new FenceTracker();
    expect(tracker.feed('````')).toBe('open');
    // A shorter run does not close a longer fence: still inside, not closed.
    expect(tracker.feed('```')).toBe('inside');
    expect(tracker.feed('text')).toBe('inside');
    expect(tracker.feed('````')).toBe('close');
    // Once closed, an ordinary line is no longer inside the fence.
    expect(tracker.feed('text')).toBe('outside');
  });

  it('does not close a tilde fence with a backtick run', () => {
    const states = classifyFences(['~~~', 'code line', '```', 'still code', '~~~', 'outside']);
    expect(states).toEqual(['open', 'inside', 'inside', 'inside', 'close', 'outside']);
  });
});
