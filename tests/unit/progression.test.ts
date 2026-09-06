import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeLocalStorage } from '../helpers/fake-local-storage.js';
import {
  recordBossDefeat,
  recordDailyRunOutcome,
  recordRunOutcome,
  resetProgress,
  runResultsView,
} from '../../src/app/meta/index.js';
import { loadSave } from '../../src/app/save/storage.js';
import type { ProgressionContent, UnlockDefinition } from '../../src/app/meta/definition.js';
import { bossStatKey } from '../../src/app/meta/definition.js';
import {
  buildRunResultsView,
  characterUnlocked,
  conditionProgress,
  cycleCharacter,
  dailyStatus,
  hasBeatenABoss,
  selectedCharacterId,
  selectedCharacterTraits,
  withEverythingUnlocked,
  withSelectedCharacter,
  withBossDefeat,
  withDailyRunOutcome,
  withRunOutcome,
  UNLOCK_BOARD,
} from '../../src/app/meta/progress.js';
import { createDefaultSave, type BestRunRecord, type SaveData } from '../../src/app/save/schema.js';
import { dailySeed } from '../../src/sim/rng/daily.js';
import type { CharacterTraits } from '../../src/sim/character/definition.js';

/** A character's traits with nothing in them — this suite is about the rules around the roster, not the roster. */
function traits(id: string, name: string): CharacterTraits {
  return {
    id,
    name,
    maxHealth: 6,
    startingBiermarken: 0,
    startingBombs: 0,
    startingKeys: 0,
    items: [],
    shotTags: [],
    stats: [],
    rules: [],
  };
}

const UNLOCKS: readonly UnlockDefinition[] = [
  {
    id: 'first-boss',
    name: 'Opas Zettl',
    effect: 'A Zettl',
    category: 'hub',
    condition: { kind: 'bossDefeated', floor: 1 },
    goal: 'Schlog den Kellerboss',
  },
  {
    id: UNLOCK_BOARD,
    name: "D'Tafel",
    effect: 'D’Läufe an der Tafel',
    category: 'hub',
    condition: { kind: 'statAtLeast', stat: 'kills', value: 100 },
    goal: '100 daschlogn',
  },
];

const CONTENT: ProgressionContent = {
  unlocks: UNLOCKS,
  characters: [
    {
      id: 'alois',
      name: 'Alois',
      note: 'Rucksack',
      requires: null,
      goal: '',
      traits: traits('alois', 'Alois'),
    },
    {
      id: 'resi',
      name: 'Resi',
      note: 'Dirndl',
      requires: { kind: 'bossDefeated', floor: 1 },
      goal: 'Schlog den Kellerboss',
      traits: traits('resi', 'Resi'),
    },
    {
      id: 'sennerin',
      name: "D'Sennerin",
      note: 'Kuhglockn',
      requires: { kind: 'statAtLeast', stat: 'kills', value: 100 },
      goal: '100 daschlogn',
      traits: traits('sennerin', "D'Sennerin"),
    },
  ],
};

function run(partial: Partial<BestRunRecord> = {}): BestRunRecord {
  return {
    seed: 4,
    floor: 1,
    ticksSurvived: 600,
    kills: 7,
    deathWord: 'Hi',
    recordedAt: 1,
    ...partial,
  };
}

describe('meta-progression', () => {
  describe('earning an unlock', () => {
    it('grants the unlock whose boss just went down, and nobody else', () => {
      const save = withBossDefeat(createDefaultSave(), 1, CONTENT);
      expect(save.unlocks).toEqual(['first-boss']);
      expect(save.statistics[bossStatKey(1)]).toBe(1);
      expect(save.statistics.deepestFloor).toBe(1);
    });

    it('grants an unlock retroactively once its condition is already met', () => {
      // The whole reason unlocks are re-evaluated on every commit rather than
      // handed out by whoever raised the event: a roster that grows later
      // still pays a player who long ago did the thing it asks for.
      let save = createDefaultSave();
      for (let i = 0; i < 3; i++) {
        save = withRunOutcome(save, run({ kills: 40, recordedAt: i }), {
          ...CONTENT,
          unlocks: [],
        });
      }
      expect(save.unlocks).toEqual([]);
      expect(withRunOutcome(save, run({ kills: 0 }), CONTENT).unlocks).toEqual([UNLOCK_BOARD]);
    });

    it('never grants the same unlock twice, however often the boss is beaten', () => {
      let save = withBossDefeat(createDefaultSave(), 1, CONTENT);
      save = withBossDefeat(save, 1, CONTENT);
      expect(save.unlocks).toEqual(['first-boss']);
      expect(save.statistics[bossStatKey(1)]).toBe(2);
    });
  });

  describe('hasBeatenABoss (#271)', () => {
    it('is false for a fresh save', () => {
      expect(hasBeatenABoss(createDefaultSave())).toBe(false);
    });

    it('is true once any floor boss has gone down', () => {
      expect(hasBeatenABoss(withBossDefeat(createDefaultSave(), 1, CONTENT))).toBe(true);
      expect(hasBeatenABoss(withBossDefeat(createDefaultSave(), 2, CONTENT))).toBe(true);
    });
  });

  describe('a finished run', () => {
    it('rolls the totals, keeps the run itself, and lands it on the best-runs list', () => {
      const record = run({ kills: 9, ticksSurvived: 1200, floor: 2 });
      const save = withRunOutcome(createDefaultSave(), record, CONTENT);
      expect(save.statistics.runs).toBe(1);
      expect(save.statistics.kills).toBe(9);
      expect(save.statistics.ticks).toBe(1200);
      expect(save.statistics.deepestFloor).toBe(2);
      expect(save.lastRun).toEqual(record);
      expect(save.bestRuns).toEqual([record]);
    });

    it('keeps lastRun as the run that just ended, not the best one ever', () => {
      let save = withRunOutcome(
        createDefaultSave(),
        run({ ticksSurvived: 9000, seed: 1 }),
        CONTENT,
      );
      save = withRunOutcome(save, run({ ticksSurvived: 60, seed: 2 }), CONTENT);
      expect(save.lastRun?.seed).toBe(2);
      expect(save.bestRuns[0]?.seed).toBe(1);
    });
  });

  describe('the results screen', () => {
    function view(save: SaveData) {
      return buildRunResultsView(save, CONTENT);
    }

    it('leads with the last run, or says there was none', () => {
      expect(view(createDefaultSave()).lastRun).toBeNull();
      const save = withRunOutcome(createDefaultSave(), run({ kills: 3 }), CONTENT);
      expect(view(save).lastRun?.kills).toBe(3);
    });

    it('shows a locked unlock with its goal and its progress, and nothing it does', () => {
      const save = withRunOutcome(createDefaultSave(), run({ kills: 40 }), CONTENT);
      const board = view(save).unlocks.find((unlock) => unlock.id === UNLOCK_BOARD);
      expect(board?.unlocked).toBe(false);
      expect(board?.goal).toBe('100 daschlogn');
      expect(board?.progress).toBe('40 / 100');
      expect(board?.effect).toBe('');
    });

    it('shows an unlocked unlock with its effect, and no goal left to chase', () => {
      const save = withBossDefeat(createDefaultSave(), 1, CONTENT);
      const first = view(save).unlocks.find((unlock) => unlock.id === 'first-boss');
      expect(first?.unlocked).toBe(true);
      expect(first?.effect).toBe('A Zettl');
      expect(first?.goal).toBe('');
      expect(first?.progress).toBeNull();
    });

    it('keeps the run board locked until its own condition is met', () => {
      const save = withRunOutcome(createDefaultSave(), run({ kills: 40 }), CONTENT);
      expect(view(save).board).toBeNull();
      const withBoard = withRunOutcome(save, run({ kills: 100 }), CONTENT);
      expect(view(withBoard).board).toHaveLength(2);
    });

    it('caps a goal’s progress at the goal instead of overrunning it', () => {
      const save = withRunOutcome(createDefaultSave(), run({ kills: 500 }), CONTENT);
      expect(conditionProgress(save, { kind: 'statAtLeast', stat: 'kills', value: 100 })).toEqual({
        current: 100,
        goal: 100,
      });
    });
  });

  describe('the daily run (#48)', () => {
    it('records the first attempt on a date, and ignores a later one', () => {
      const first = withDailyRunOutcome(createDefaultSave(), {
        date: '2026-08-30',
        seed: 1,
        ticksSurvived: 100,
        kills: 5,
      });
      expect(first.dailyRunHistory).toEqual([
        { date: '2026-08-30', seed: 1, ticksSurvived: 100, kills: 5 },
      ]);

      // A second attempt on the same date — replaying it for fun, say —
      // leaves the recorded one untouched.
      const second = withDailyRunOutcome(first, {
        date: '2026-08-30',
        seed: 1,
        ticksSurvived: 9000,
        kills: 90,
      });
      expect(second.dailyRunHistory).toEqual(first.dailyRunHistory);
    });

    it('records a new date as a second entry', () => {
      const withOne = withDailyRunOutcome(createDefaultSave(), {
        date: '2026-08-30',
        seed: 1,
        ticksSurvived: 100,
        kills: 5,
      });
      const withTwo = withDailyRunOutcome(withOne, {
        date: '2026-08-31',
        seed: 2,
        ticksSurvived: 200,
        kills: 6,
      });
      expect(withTwo.dailyRunHistory.map((entry) => entry.date)).toEqual([
        '2026-08-30',
        '2026-08-31',
      ]);
    });

    it('reports the seed for a date and whether it has been played, from the save alone', () => {
      expect(dailyStatus(createDefaultSave(), '2026-08-30').playedToday).toBeNull();
      const played = withDailyRunOutcome(createDefaultSave(), {
        date: '2026-08-30',
        seed: dailySeed('2026-08-30'),
        ticksSurvived: 100,
        kills: 5,
      });
      const status = dailyStatus(played, '2026-08-30');
      expect(status.seed).toBe(dailySeed('2026-08-30'));
      expect(status.playedToday?.kills).toBe(5);
      // A different date's status is unaffected by yesterday's entry.
      expect(dailyStatus(played, '2026-08-31').playedToday).toBeNull();
    });
  });

  describe('through the save on disk', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('round-trips an earned unlock: beat a boss, reload, it is still there', () => {
      installFakeLocalStorage();
      resetProgress();
      recordBossDefeat(2);
      recordRunOutcome(run({ kills: 3, floor: 1 }));

      // Everything below reads the save back out of storage rather than
      // reusing the returned value — this is the acceptance criterion about
      // unlock state surviving a save, and an in-memory object would prove
      // nothing about that.
      const reloaded = loadSave();
      expect(reloaded.unlocks).toContain('promille');
      expect(reloaded.lastRun?.kills).toBe(3);
      expect(runResultsView(reloaded).unlocks.find((u) => u.id === 'promille')?.unlocked).toBe(
        true,
      );
    });

    it('records a daily run once, and a second attempt the same day is a no-op (#48)', () => {
      installFakeLocalStorage();
      resetProgress();
      recordDailyRunOutcome({ date: '2026-08-30', seed: 1, ticksSurvived: 100, kills: 5 });
      recordDailyRunOutcome({ date: '2026-08-30', seed: 1, ticksSurvived: 9000, kills: 90 });
      expect(loadSave().dailyRunHistory).toEqual([
        { date: '2026-08-30', seed: 1, ticksSurvived: 100, kills: 5 },
      ]);
    });

    it('empties the unlocks without taking the settings with it', () => {
      const storage = installFakeLocalStorage();
      recordBossDefeat(1);
      recordRunOutcome(run());
      const cleared = resetProgress();
      expect(cleared.unlocks).toEqual([]);
      expect(cleared.statistics).toEqual({});
      expect(cleared.lastRun).toBeNull();
      expect(cleared.settings).toEqual(loadSave().settings);
      expect(storage.getItem('kellerbier.save.v1')).not.toBeNull();
    });
  });
});

describe('the run-start roster (#47)', () => {
  const beatenFloor1 = (): SaveData => withBossDefeat(createDefaultSave(), 1, CONTENT);

  it('offers only the free character until something has been beaten', () => {
    const save = createDefaultSave();
    const view = buildRunResultsView(save, CONTENT);
    expect(view.lastRun).toBeNull();
    expect(CONTENT.characters.map((character) => characterUnlocked(save, character))).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('opens a character the moment its own condition is met', () => {
    const save = beatenFloor1();
    const resi = CONTENT.characters.find((character) => character.id === 'resi');
    expect(resi === undefined ? false : characterUnlocked(save, resi)).toBe(true);
  });

  it('refuses to select a character that is still locked', () => {
    const save = createDefaultSave();
    expect(withSelectedCharacter(save, 'resi', CONTENT).selectedCharacter).toBe('alois');
    expect(withSelectedCharacter(save, 'gerti', CONTENT).selectedCharacter).toBe('alois');
    expect(withSelectedCharacter(beatenFloor1(), 'resi', CONTENT).selectedCharacter).toBe('resi');
  });

  it('falls back rather than starting a run as somebody the save can no longer play', () => {
    const chosen = withSelectedCharacter(beatenFloor1(), 'resi', CONTENT);
    expect(selectedCharacterId(chosen, CONTENT)).toBe('resi');
    // The same choice, on a save whose progress has since been wiped.
    const wiped: SaveData = { ...chosen, statistics: {}, unlocks: [] };
    expect(selectedCharacterId(wiped, CONTENT)).toBe('alois');
    expect(selectedCharacterTraits(wiped, CONTENT).id).toBe('alois');
  });

  it('cycles past locked rows, and wraps', () => {
    const save = beatenFloor1();
    expect(cycleCharacter(save, CONTENT, 1)).toBe('resi');
    const onResi = withSelectedCharacter(save, 'resi', CONTENT);
    // Sennerin is still locked, so forward from Resi comes back round to Alois.
    expect(cycleCharacter(onResi, CONTENT, 1)).toBe('alois');
    expect(cycleCharacter(onResi, CONTENT, -1)).toBe('alois');
  });

  it('stays put when nothing else is unlocked to cycle to', () => {
    expect(cycleCharacter(createDefaultSave(), CONTENT, 1)).toBe('alois');
  });

  it('opens everything at once for the debug handle, roster and unlocks alike', () => {
    const save = withEverythingUnlocked(createDefaultSave(), CONTENT);
    expect(CONTENT.characters.every((character) => characterUnlocked(save, character))).toBe(true);
    expect(buildRunResultsView(save, CONTENT).unlocks.every((unlock) => unlock.unlocked)).toBe(
      true,
    );
  });
});
