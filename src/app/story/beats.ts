import type { SaveData } from '../save/schema.js';
import { updateSave } from '../save/storage.js';

/**
 * One-time story beats (#58): each id names a card the player should be
 * shown exactly once, ever, across every future run. `'opening'` is the
 * only one that exists yet — the Sunday-lunch card `app/main.ts`'s
 * `startRun` shows before a save's very first run. The chapter-two ending
 * is a later beat in the same store, not a separate flag.
 *
 * Kept as pure functions over a `SaveData` (`hasSeenStoryBeat`/
 * `withStoryBeatSeen`), the same split `app/meta/progress.ts` uses, so the
 * one place that actually calls `localStorage` is `markStoryBeatSeen` below.
 */

export const STORY_BEAT_OPENING = 'opening';

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
