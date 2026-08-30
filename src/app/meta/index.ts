import { STAMMTISCH } from '../../content/stammtisch/index.js';
import { dailyDateKey } from '../daily.js';
import type { BestRunRecord, DailyRunRecord, SaveData } from '../save/schema.js';
import { loadSave, updateSave } from '../save/storage.js';
import {
  type StammtischView,
  buildStammtischView,
  withBossDefeat,
  withDailyRunOutcome,
  withGreetings,
  withRunOutcome,
} from './progress.js';

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
  lastRunLine,
  runFactsFrom,
  UNLOCK_BOARD,
  UNLOCK_PROMILLE,
  UNLOCK_SEED,
} from './progress.js';

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
