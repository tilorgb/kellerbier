import { STAMMTISCH } from '../../content/stammtisch/index.js';
import { dailyDateKey } from '../daily.js';
import type { BestRunRecord, DailyRunRecord, SaveData } from '../save/schema.js';
import { loadSave, updateSave } from '../save/storage.js';
import {
  type StammtischView,
  buildStammtischView,
  characterById,
  cycleCharacter,
  withBossDefeat,
  withDailyRunOutcome,
  withGreetings,
  selectedCharacterTraits,
  withEverythingUnlocked,
  withRunOutcome,
  withSelectedCharacter,
} from './progress.js';
import { type CharacterTraits, NEUTRAL_TRAITS } from '../../sim/character/definition.js';

/**
 * The Stammtisch's write side (#46): the three moments the hub's state
 * changes, each one commit against the save.
 *
 * Kept apart from `progress.ts` so that every rule in this feature is a pure
 * function of a save and a roster, and only this file knows `localStorage`
 * exists. `app/main.ts` calls these; nothing else does.
 */

/** A boss went down on `floor`. Committed immediately — see `withBossDefeat`. */
export function recordBossDefeat(floor: number): SaveData {
  return updateSave((save) => withBossDefeat(save, floor, STAMMTISCH));
}

/** A run ended. Rolls the totals, keeps the summary the regulars comment on, grants what that earned. */
export function recordRunOutcome(record: BestRunRecord): SaveData {
  return updateSave((save) => withRunOutcome(save, record, STAMMTISCH));
}

/**
 * Remembers who the next run starts as (#47), and hands back the id that
 * actually stuck — a locked or unknown id changes nothing, so the caller can
 * read the result rather than assuming its write landed.
 */
export function selectCharacter(id: string): string {
  return updateSave((save) => withSelectedCharacter(save, id, STAMMTISCH)).selectedCharacter;
}

/** Moves the roster cursor to the next unlocked character and stores it. */
export function selectNextCharacter(delta: number): string {
  return selectCharacter(cycleCharacter(loadSave(), STAMMTISCH, delta));
}

/**
 * How the character `id` names plays, whether or not it is still unlocked —
 * what a resumed run is rebuilt with (`ActiveRunSave.character`). An id the
 * roster no longer has falls back to Alois rather than failing: a log that
 * cannot name its character still has to replay into a run.
 */
export function characterTraitsById(id: string): CharacterTraits {
  return characterById(STAMMTISCH, id)?.traits ?? NEUTRAL_TRAITS;
}

/** How the currently selected character plays — handed to `GameSim` at run start. */
export function selectedCharacter(save: SaveData = loadSave()): CharacterTraits {
  return selectedCharacterTraits(save, STAMMTISCH);
}

/** A daily run ended — recorded into `dailyRunHistory` too, if today's attempt hasn't been spent yet. */
export function recordDailyRunOutcome(record: DailyRunRecord): SaveData {
  return updateSave((save) => withDailyRunOutcome(save, record));
}

/** The player has seen these regulars arrive; from here they are ordinary seats. */
export function markGreeted(ids: readonly string[]): SaveData {
  return updateSave((save) => withGreetings(save, ids));
}

/** Everything the hub screen draws, from the save on disk (or the one handed in, for a test). */
export function stammtischView(save: SaveData = loadSave()): StammtischView {
  return buildStammtischView(save, STAMMTISCH, dailyDateKey());
}

export { STAMMTISCH } from '../../content/stammtisch/index.js';
export type { DailyStatus, RunFacts, SeatView, StammtischView } from './progress.js';
export {
  characterById,
  characterUnlocked,
  lastRunLine,
  runFactsFrom,
  selectedCharacterId,
  UNLOCK_BOARD,
  UNLOCK_PROMILLE,
  UNLOCK_SEED,
} from './progress.js';
export type { CharacterView } from './progress.js';

/**
 * Meets every condition the roster asks for at once (#47) — the whole table
 * seated, every character selectable.
 *
 * The mirror of `resetProgress`, and there for the same reason: playing five
 * characters to see whether their rules read right otherwise costs four
 * hundred kills and ten finished runs before the first one can be tried.
 */
export function unlockEverything(): SaveData {
  return updateSave((save) => withEverythingUnlocked(save, STAMMTISCH));
}

/**
 * Wipes the meta progress and nothing else — the table empties, the settings
 * and the run in progress stay.
 *
 * Exists for the `__kellerbier` debug handle: the only other way to see the
 * table fill from empty is to beat both bosses again, which makes "does an
 * arrival read right" a twenty-minute question every time it is asked.
 */
export function resetProgress(): SaveData {
  return updateSave((save) => ({
    ...save,
    unlocks: [],
    achievements: [],
    statistics: {},
    bestRuns: [],
    lastRun: null,
    greetedRegulars: [],
  }));
}
