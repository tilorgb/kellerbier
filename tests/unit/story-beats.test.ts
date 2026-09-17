import { describe, expect, it } from 'vitest';
import { createDefaultSave } from '../../src/app/save/schema.js';
import {
  STORY_BEAT_CHAPTER_TWO,
  STORY_BEAT_OPENING,
  hasSeenStoryBeat,
  withStoryBeatSeen,
} from '../../src/app/story/beats.js';

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

  /**
   * The two beats the game actually has, as `app/main.ts` drives them: the
   * opening before a save's first run, and chapter two's card on the first
   * arrival on floor 2. A save that has seen the opening — every save past
   * its first run — must still be owed chapter two, or the card would never
   * fire for anybody who started playing before it landed.
   */
  it('still owes an established save the chapter-two card', () => {
    const seen = withStoryBeatSeen(createDefaultSave(), STORY_BEAT_OPENING);
    expect(hasSeenStoryBeat(seen, STORY_BEAT_CHAPTER_TWO)).toBe(false);

    const both = withStoryBeatSeen(seen, STORY_BEAT_CHAPTER_TWO);
    expect(hasSeenStoryBeat(both, STORY_BEAT_OPENING)).toBe(true);
    expect(hasSeenStoryBeat(both, STORY_BEAT_CHAPTER_TWO)).toBe(true);
  });

  it('gives the two beats distinct ids', () => {
    expect(STORY_BEAT_OPENING).not.toBe(STORY_BEAT_CHAPTER_TWO);
  });
});
