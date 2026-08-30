import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeLocalStorage } from '../helpers/fake-local-storage.js';
import {
  markGreeted,
  recordBossDefeat,
  recordRunOutcome,
  resetProgress,
  stammtischView,
} from '../../src/app/meta/index.js';
import { loadSave } from '../../src/app/save/storage.js';
import type {
  RegularDefinition,
  StammtischContent,
  UnlockDefinition,
} from '../../src/app/meta/definition.js';
import { bossStatKey } from '../../src/app/meta/definition.js';
import {
  buildStammtischView,
  conditionProgress,
  fillTokens,
  pickLine,
  runFactsFrom,
  withBossDefeat,
  withGreetings,
  withRunOutcome,
  UNLOCK_BOARD,
} from '../../src/app/meta/progress.js';
import { createDefaultSave, type BestRunRecord, type SaveData } from '../../src/app/save/schema.js';

const UNLOCKS: readonly UnlockDefinition[] = [
  {
    id: 'first-boss',
    name: 'Opas Zettl',
    effect: 'A Zettl',
    category: 'lore',
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

const SEPP: RegularDefinition = {
  id: 'sepp',
  name: 'Da Sepp',
  role: 'Nachbar',
  seat: 1,
  grants: 'first-boss',
  greeting: 'Servus, i bin da Sepp.',
  lines: [
    { when: { kind: 'diedOnFloor', floor: 1 }, text: 'Im Keller, nach {sek}.' },
    { when: { kind: 'diedOnFloor', floor: 1 }, text: '{kills} Viecher im Keller.' },
    { when: { kind: 'always' }, text: 'Aso.' },
  ],
  waiting: 'A leara Stui.',
};

const TRAUDL: RegularDefinition = {
  id: 'traudl',
  name: "D'Traudl",
  role: 'Bedienung',
  seat: 2,
  grants: UNLOCK_BOARD,
  greeting: 'I schreib ois o.',
  lines: [{ when: { kind: 'always' }, text: '{stock}, {sek}.' }],
  waiting: 'Do sitzt kane.',
};

const CONTENT: StammtischContent = {
  regulars: [TRAUDL, SEPP],
  unlocks: UNLOCKS,
  characters: [{ id: 'alois', name: 'Alois', note: 'Rucksack', requires: null }],
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

describe('Stammtisch progress (#46)', () => {
  describe('earning a chair', () => {
    it('seats the regular whose boss just went down, and nobody else', () => {
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

    it('never seats the same regular twice, however often the boss is beaten', () => {
      let save = withBossDefeat(createDefaultSave(), 1, CONTENT);
      save = withBossDefeat(save, 1, CONTENT);
      expect(save.unlocks).toEqual(['first-boss']);
      expect(save.statistics[bossStatKey(1)]).toBe(2);
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

  describe('what a regular says', () => {
    it('quotes the run back rather than reading from a generic pool', () => {
      const facts = runFactsFrom(run({ ticksSurvived: 630, kills: 3 }));
      expect(pickLine(SEPP, facts)).toBe('Im Keller, nach 10,5 s.');
    });

    it('varies between equally specific lines with the run’s own seed, deterministically', () => {
      const first = pickLine(SEPP, runFactsFrom(run({ seed: 5, kills: 3 })));
      const second = pickLine(SEPP, runFactsFrom(run({ seed: 4, kills: 3 })));
      expect(first).not.toBe(second);
      expect(pickLine(SEPP, runFactsFrom(run({ seed: 5, kills: 3 })))).toBe(first);
    });

    it('falls back to the catch-all only when nothing sharper matches', () => {
      expect(pickLine(SEPP, runFactsFrom(run({ floor: 2 })))).toBe('Aso.');
    });

    it('has something to say before the first run, with no numbers to invent', () => {
      expect(pickLine(TRAUDL, null)).toBe('—, —.');
      expect(fillTokens('{sek} {kills} {stock} {wort}', null)).toBe('— — — —');
    });
  });

  describe('the table, as the screen sees it', () => {
    function view(save: SaveData) {
      return buildStammtischView(save, CONTENT);
    }

    it('orders the chairs by seat, not by the order the roster happens to be in', () => {
      expect(view(createDefaultSave()).seats.map((seat) => seat.id)).toEqual(['sepp', 'traudl']);
    });

    it('shows an empty chair with its goal, its progress and no name', () => {
      const save = withRunOutcome(createDefaultSave(), run({ kills: 40 }), CONTENT);
      const traudl = view(save).seats[1];
      expect(traudl?.seated).toBe(false);
      expect(traudl?.name).toBeNull();
      expect(traudl?.goal).toBe('100 daschlogn');
      expect(traudl?.progress).toBe('40 / 100');
      expect(traudl?.line).toBe('Do sitzt kane.');
    });

    it('opens on an arriving regular and plays the greeting, once', () => {
      const save = withBossDefeat(createDefaultSave(), 1, CONTENT);
      const arriving = view(save);
      expect(arriving.openOn).toBe(0);
      expect(arriving.seats[0]?.arriving).toBe(true);
      expect(arriving.seats[0]?.line).toBe('Servus, i bin da Sepp.');

      const greeted = view(withGreetings(save, ['sepp']));
      expect(greeted.seats[0]?.arriving).toBe(false);
      expect(greeted.seats[0]?.line).toBe('Aso.');
      // With nobody arriving, the cursor opens on the next thing to work
      // toward rather than back at the start of the table.
      expect(greeted.openOn).toBe(1);
    });

    it('keeps the run board locked until the regular who writes it turns up', () => {
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

  describe('through the save on disk', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('round-trips a filled table: beat a boss, reload, he is still sitting there', () => {
      installFakeLocalStorage();
      resetProgress();
      recordBossDefeat(1);
      recordRunOutcome(run({ kills: 3, floor: 1 }));

      // Everything below reads the save back out of storage rather than
      // reusing the returned value — this is the acceptance criterion about
      // unlock state surviving a save, and an in-memory object would prove
      // nothing about that.
      const reloaded = loadSave();
      expect(reloaded.unlocks).toContain('lore-opas-zettl');
      expect(reloaded.lastRun?.kills).toBe(3);

      const seat = stammtischView(reloaded).seats[0];
      expect(seat?.seated).toBe(true);
      expect(seat?.arriving).toBe(true);

      markGreeted(['sepp']);
      expect(loadSave().greetedRegulars).toEqual(['sepp']);
      expect(stammtischView().seats[0]?.arriving).toBe(false);
    });

    it('empties the table without taking the settings with it', () => {
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
