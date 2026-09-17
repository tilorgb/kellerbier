import type { SaveData } from '../save/schema.js';
import { updateSave } from '../save/storage.js';

/**
 * One-time story beats (#58): each id names a card the player should be
 * shown exactly once, ever, across every future run.
 *
 * - `'opening'` — the Sunday-lunch card `app/main.ts`'s `startRun` shows
 *   before a save's very first run.
 * - `'chapter-two'` — the card between the two chapters the game currently
 *   has: Alois coming up out of the cellar into the village, `advanceFloor`'s
 *   first real arrival on floor 2. `GAME_DESIGN.md` §2's "a short illustrated
 *   card between chapters" is this one; the opening is the card *before* the
 *   first chapter, which is a different job.
 *
 * The chapter-two *ending* is not in here: it is `VictoryScreen`'s epilogue,
 * which a player is meant to see every time they win, not once ever.
 *
 * Kept as pure functions over a `SaveData` (`hasSeenStoryBeat`/
 * `withStoryBeatSeen`), the same split `app/meta/progress.ts` uses, so the
 * one place that actually calls `localStorage` is `markStoryBeatSeen` below.
 */

export const STORY_BEAT_OPENING = 'opening';
export const STORY_BEAT_CHAPTER_TWO = 'chapter-two';

export function hasSeenStoryBeat(save: SaveData, id: string): boolean {
  return save.seenStoryBeats.includes(id);
}

/** Idempotent — returns `save` unchanged (same reference) if `id` is already recorded. */
export function withStoryBeatSeen(save: SaveData, id: string): SaveData {
  if (hasSeenStoryBeat(save, id)) {
    return save;
  }
  return { ...save, seenStoryBeats: [...save.seenStoryBeats, id] };
}

/** Commits `id` as seen. Called once, the moment the card is dismissed — see `withStoryBeatSeen`. */
export function markStoryBeatSeen(id: string): SaveData {
  return updateSave((save) => withStoryBeatSeen(save, id));
}
