import { describe, expect, it } from 'vitest';
import { createDefaultSave } from '../../src/app/save/schema.js';
import { hasSeenStoryBeat, withStoryBeatSeen } from '../../src/app/story/beats.js';

describe('story beats (#58)', () => {
  it('a fresh save has seen nothing', () => {
    expect(hasSeenStoryBeat(createDefaultSave(), 'opening')).toBe(false);
  });

  it('records a beat as seen', () => {
    const seen = withStoryBeatSeen(createDefaultSave(), 'opening');
    expect(hasSeenStoryBeat(seen, 'opening')).toBe(true);
  });

  it('is idempotent — recording an already-seen beat returns the same save reference', () => {
    const seen = withStoryBeatSeen(createDefaultSave(), 'opening');
    // Same object identity, not just an equal one: `startRun` calls this on
    // every retry once the opening is seen, and a new array every time would
    // mean `seenStoryBeats` growing duplicate entries forever if a caller
    // ever forgot the `hasSeenStoryBeat` guard.
    expect(withStoryBeatSeen(seen, 'opening')).toBe(seen);
  });

  it('keeps beats independent of each other', () => {
    const seen = withStoryBeatSeen(createDefaultSave(), 'opening');
    expect(hasSeenStoryBeat(seen, 'chapter-two-ending')).toBe(false);
  });
});
