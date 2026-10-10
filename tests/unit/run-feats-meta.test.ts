import { describe, expect, it } from 'vitest';
import {
  type ProgressionContent,
  type UnlockCondition,
  STAT_DEEPEST_TIER,
  STAT_MOST_BEERS,
  STAT_MOST_PASSIVES,
  floorHeldTierStatKey,
  itemSetStatKey,
  mostTaggedStatKey,
} from '../../src/app/meta/definition.js';
import { bossAsCharacterStatKey, foldRunBests } from '../../src/app/meta/feats.js';
import {
  EARNED_ITEM_NAME,
  conditionMet,
  conditionProgress,
  earnedNames,
  lockedItemGoal,
  lockedItemIds,
  withBossFight,
  withEverythingUnlocked,
  withRunBests,
} from '../../src/app/meta/progress.js';
import { createDefaultSave, sanitizeSave, type SaveData } from '../../src/app/save/schema.js';
import type { BossFightRecord, RunBests } from '../../src/sim/game/feats.js';
import { PromilleTier } from '../../src/sim/game/promille.js';
import { TICKS_PER_SECOND } from '../../src/sim/time.js';

/**
 * The app's half of run feats (#502): folding `BossFightRecord`s and
 * `RunBests` into the save, and judging `bossFeat`/`statAtLeast` conditions
 * against what was folded. Every feat kind is checked met *and* missed by
 * the narrowest margin — a feat handed out by accident is the bug this
 * whole layer has to not have.
 */

const NONE: ProgressionContent = { unlocks: [], characters: [] };

function fight(overrides: Partial<BossFightRecord> = {}): BossFightRecord {
  return {
    floor: 1,
    character: 'alois',
    hitsTaken: 3,
    ticks: 120 * TICKS_PER_SECOND,
    healthLeft: 4,
    promilleUnlocked: true,
    promille: 1.2,
    promilleTier: PromilleTier.Angeheitert,
    topQuality: 2,
    absentTags: [],
    floorLowestTier: PromilleTier.Nuchtern,
    ...overrides,
  };
}

function after(...fights: BossFightRecord[]): SaveData {
  return fights.reduce((save, record) => withBossFight(save, record, NONE), createDefaultSave());
}

function met(save: SaveData, condition: UnlockCondition): boolean {
  return conditionMet(save, condition);
}

describe('boss feats, met and missed (#502)', () => {
  it('maxHits: no damage is no damage', () => {
    const save = after(fight({ hitsTaken: 1 }));
    expect(met(save, { kind: 'bossFeat', floor: 1, feat: { kind: 'maxHits', hits: 0 } })).toBe(
      false,
    );
    expect(met(save, { kind: 'bossFeat', floor: 1, feat: { kind: 'maxHits', hits: 1 } })).toBe(
      true,
    );
  });

  it('maxHealthLeft: half a heart is half a heart', () => {
    const save = after(fight({ healthLeft: 2 }));
    const condition = (halfHearts: number): UnlockCondition => ({
      kind: 'bossFeat',
      floor: null,
      feat: { kind: 'maxHealthLeft', halfHearts },
    });
    expect(met(save, condition(1))).toBe(false);
    expect(met(save, condition(2))).toBe(true);
  });

  it('maxHealthLeft: a Homebrew fight has no hearts to count, so counts for nothing', () => {
    const save = after(fight({ healthLeft: null }));
    expect(
      met(save, { kind: 'bossFeat', floor: null, feat: { kind: 'maxHealthLeft', halfHearts: 99 } }),
    ).toBe(false);
  });

  it('maxSeconds: measured in ticks, so a tick over is over', () => {
    const save = after(fight({ ticks: 60 * TICKS_PER_SECOND + 1 }));
    const condition = (seconds: number): UnlockCondition => ({
      kind: 'bossFeat',
      floor: 1,
      feat: { kind: 'maxSeconds', seconds },
    });
    expect(met(save, condition(60))).toBe(false);
    expect(met(save, condition(61))).toBe(true);
  });

  it('minPromilleTier: the tier at the kill', () => {
    const save = after(fight({ promilleTier: PromilleTier.Beduselt }));
    const condition = (tier: number): UnlockCondition => ({
      kind: 'bossFeat',
      floor: 1,
      feat: { kind: 'minPromilleTier', tier },
    });
    expect(met(save, condition(PromilleTier.Vollrausch))).toBe(false);
    expect(met(save, condition(PromilleTier.Beduselt))).toBe(true);
  });

  it('maxItemQuality: nothing held counts as below every quality', () => {
    const condition = (quality: number): UnlockCondition => ({
      kind: 'bossFeat',
      floor: 1,
      feat: { kind: 'maxItemQuality', quality },
    });
    expect(met(after(fight({ topQuality: 2 })), condition(1))).toBe(false);
    expect(met(after(fight({ topQuality: 1 })), condition(1))).toBe(true);
    expect(met(after(fight({ topQuality: -1 })), condition(0))).toBe(true);
  });

  it('sober: zero Promille only counts in a run where the meter existed', () => {
    const condition: UnlockCondition = { kind: 'bossFeat', floor: 2, feat: { kind: 'sober' } };
    expect(met(after(fight({ floor: 2, promilleUnlocked: false, promille: 0 })), condition)).toBe(
      false,
    );
    expect(met(after(fight({ floor: 2, promille: 0.01 })), condition)).toBe(false);
    expect(met(after(fight({ floor: 2, promille: 0 })), condition)).toBe(true);
  });

  it('sober, times 2: counted per fight', () => {
    const condition: UnlockCondition = {
      kind: 'bossFeat',
      floor: 2,
      feat: { kind: 'sober' },
      times: 2,
    };
    const once = after(fight({ floor: 2, promille: 0 }));
    expect(conditionProgress(once, condition)).toEqual({ current: 1, goal: 2 });
    expect(met(once, condition)).toBe(false);
    expect(
      met(after(fight({ floor: 2, promille: 0 }), fight({ floor: 2, promille: 0 })), condition),
    ).toBe(true);
  });

  it('asCharacter: credits the character who won it, and nobody else', () => {
    const save = after(fight({ floor: 1, character: 'resi' }));
    const as = (character: string): UnlockCondition => ({
      kind: 'bossFeat',
      floor: 1,
      feat: { kind: 'asCharacter', character },
    });
    expect(met(save, as('resi'))).toBe(true);
    expect(met(save, as('alois'))).toBe(false);
    expect(save.statistics[bossAsCharacterStatKey(1, 'resi')]).toBe(1);
  });

  it('withoutTags: every tag asked for has to be absent, in any order', () => {
    const save = after(fight({ absentTags: ['impure'] }));
    const without = (tags: string[]): UnlockCondition => ({
      kind: 'bossFeat',
      floor: 1,
      feat: { kind: 'withoutTags', tags },
    });
    expect(met(save, without(['impure']))).toBe(true);
    expect(met(save, without(['rosinen']))).toBe(false);
    expect(met(save, without(['rosinen', 'impure']))).toBe(false);

    const pure = after(fight({ absentTags: ['impure', 'rosinen'] }));
    expect(met(pure, without(['rosinen', 'impure']))).toBe(true);
    expect(met(pure, without(['impure', 'rosinen']))).toBe(true);
  });

  it('a floor-specific feat ignores other floors; `floor: null` takes the best of any', () => {
    const save = after(fight({ floor: 1, hitsTaken: 0 }), fight({ floor: 2, hitsTaken: 4 }));
    expect(met(save, { kind: 'bossFeat', floor: 2, feat: { kind: 'maxHits', hits: 0 } })).toBe(
      false,
    );
    expect(met(save, { kind: 'bossFeat', floor: null, feat: { kind: 'maxHits', hits: 0 } })).toBe(
      true,
    );
  });

  it('a threshold is judged against the best fight on record, so it stays met', () => {
    const save = after(fight({ hitsTaken: 0 }), fight({ hitsTaken: 7 }));
    expect(met(save, { kind: 'bossFeat', floor: 1, feat: { kind: 'maxHits', hits: 0 } })).toBe(
      true,
    );
  });

  it('nothing on record meets nothing', () => {
    const save = createDefaultSave();
    for (const condition of [
      { kind: 'maxHits', hits: 99 },
      { kind: 'maxHealthLeft', halfHearts: 99 },
      { kind: 'maxSeconds', seconds: 9999 },
      { kind: 'maxItemQuality', quality: 9 },
      { kind: 'minPromilleTier', tier: 0 },
      { kind: 'sober' },
    ] as const) {
      expect(met(save, { kind: 'bossFeat', floor: null, feat: condition }), condition.kind).toBe(
        false,
      );
    }
  });
});

describe('clearing a floor without dropping below a tier (#502)', () => {
  it('keeps the best low-water mark a run has held across the floor', () => {
    const save = after(
      fight({ floor: 2, floorLowestTier: PromilleTier.Angeheitert }),
      fight({ floor: 2, floorLowestTier: PromilleTier.Nuchtern }),
    );
    const held = (value: number): UnlockCondition => ({
      kind: 'statAtLeast',
      stat: floorHeldTierStatKey(2),
      value,
    });
    expect(met(save, held(PromilleTier.Angeheitert))).toBe(true);
    expect(met(save, held(PromilleTier.Beduselt))).toBe(false);
  });
});

describe('run bests (#502)', () => {
  const bests: RunBests = {
    deepestTier: PromilleTier.Vollrausch,
    beersDrunk: 9,
    mostPassives: 5,
    mostTagged: {},
    completedSets: ['braumeister'],
  };

  it('folds as maxima — a worse run never lowers a best', () => {
    const save = withRunBests(createDefaultSave(), bests, NONE);
    const worse = withRunBests(
      save,
      { deepestTier: 0, beersDrunk: 2, mostPassives: 1, mostTagged: {}, completedSets: [] },
      NONE,
    );
    expect(worse.statistics).toEqual(save.statistics);
    expect(save.statistics[STAT_DEEPEST_TIER]).toBe(PromilleTier.Vollrausch);
    expect(save.statistics[STAT_MOST_BEERS]).toBe(9);
    expect(save.statistics[STAT_MOST_PASSIVES]).toBe(5);
    expect(save.statistics[itemSetStatKey('braumeister')]).toBe(1);
  });

  it('is idempotent, and hands back the same save when nothing improved', () => {
    const once = withRunBests(createDefaultSave(), bests, NONE);
    expect(withRunBests(once, bests, NONE)).toBe(once);
    expect(foldRunBests(once.statistics, bests)).toEqual(once.statistics);
  });

  it('reads through `statAtLeast` as "in one run"', () => {
    const save = withRunBests(createDefaultSave(), bests, NONE);
    expect(met(save, { kind: 'statAtLeast', stat: STAT_MOST_BEERS, value: 10 })).toBe(false);
    expect(met(save, { kind: 'statAtLeast', stat: STAT_MOST_BEERS, value: 9 })).toBe(true);
  });
});

describe('feats earn unlocks (#502)', () => {
  const content: ProgressionContent = {
    unlocks: [
      {
        id: 'test-no-hit',
        name: 'Test No Hit',
        effect: '',
        category: 'items',
        condition: { kind: 'bossFeat', floor: null, feat: { kind: 'maxHits', hits: 0 } },
        goal: 'Beat a boss without taking damage',
      },
      {
        id: 'test-many-passives',
        name: 'Test Passives',
        effect: '',
        category: 'items',
        condition: { kind: 'statAtLeast', stat: STAT_MOST_PASSIVES, value: 6 },
        goal: 'Hold 6 passive items at once',
      },
    ],
    characters: [],
  };

  it('grants on the commit that meets the condition, and names it as newly earned', () => {
    const before = createDefaultSave();
    const save = withBossFight(before, fight({ hitsTaken: 0 }), content);
    expect(save.unlocks).toEqual(['test-no-hit']);
    expect([...earnedNames(save, content).values()]).toEqual(['Test No Hit']);
    expect(earnedNames(before, content).size).toBe(0);
  });

  it('a near miss grants nothing', () => {
    expect(withBossFight(createDefaultSave(), fight({ hitsTaken: 1 }), content).unlocks).toEqual(
      [],
    );
    expect(
      withRunBests(
        createDefaultSave(),
        { deepestTier: 0, beersDrunk: 0, mostPassives: 5, mostTagged: {}, completedSets: [] },
        content,
      ).unlocks,
    ).toEqual([]);
  });

  it('"unlock everything" meets feat conditions too', () => {
    const save = withEverythingUnlocked(createDefaultSave(), content);
    expect([...save.unlocks].sort()).toEqual(['test-many-passives', 'test-no-hit']);
  });
});

describe('save round-trip (#502)', () => {
  it('keeps every feat statistic, negative ones included, through the save sanitiser', () => {
    const save = withRunBests(
      after(fight({ topQuality: -1, absentTags: ['impure', 'rosinen'] })),
      {
        deepestTier: 3,
        beersDrunk: 4,
        mostPassives: 2,
        mostTagged: {},
        completedSets: ['braumeister'],
      },
      NONE,
    );
    const restored = sanitizeSave(JSON.parse(JSON.stringify(save)));
    expect(restored.statistics).toEqual(save.statistics);
  });
});

describe('item unlocks (#503)', () => {
  const content: ProgressionContent = {
    unlocks: [],
    characters: [],
    items: [
      {
        itemId: 'roter-stier',
        condition: { kind: 'bossFeat', floor: 2, feat: { kind: 'maxHits', hits: 0 } },
        goal: 'Beat Der Stier without taking damage in the fight',
      },
      {
        itemId: 'der-rosinenklauber',
        condition: { kind: 'statAtLeast', stat: mostTaggedStatKey('rosinen'), value: 4 },
        goal: 'Hold 4 rosinen items at once',
      },
    ],
  };

  it('locks every item whose goal is unmet, in roster order', () => {
    expect(lockedItemIds(createDefaultSave(), content)).toEqual([
      'roter-stier',
      'der-rosinenklauber',
    ]);
  });

  it('opens an item the moment its feat is met, and a near miss opens nothing', () => {
    const missed = withBossFight(createDefaultSave(), fight({ floor: 2, hitsTaken: 1 }), content);
    expect(lockedItemIds(missed, content)).toContain('roter-stier');
    const met = withBossFight(missed, fight({ floor: 2, hitsTaken: 0 }), content);
    expect(lockedItemIds(met, content)).toEqual(['der-rosinenklauber']);
  });

  it('reads the per-tag run best for "hold N tagged items at once"', () => {
    const three = withRunBests(
      createDefaultSave(),
      {
        deepestTier: 0,
        beersDrunk: 0,
        mostPassives: 3,
        mostTagged: { rosinen: 3 },
        completedSets: [],
      },
      content,
    );
    expect(lockedItemIds(three, content)).toContain('der-rosinenklauber');
    const four = withRunBests(
      three,
      {
        deepestTier: 0,
        beersDrunk: 0,
        mostPassives: 4,
        mostTagged: { rosinen: 4 },
        completedSets: [],
      },
      content,
    );
    expect(lockedItemIds(four, content)).not.toContain('der-rosinenklauber');
  });

  it('gives the Collection the goal while locked, and nothing once earned or off the roster', () => {
    const save = createDefaultSave();
    expect(lockedItemGoal(save, content, 'roter-stier')).toBe(
      'Beat Der Stier without taking damage in the fight',
    );
    expect(lockedItemGoal(save, content, 'bierkrug')).toBeNull();
    const met = withBossFight(save, fight({ floor: 2, hitsTaken: 0 }), content);
    expect(lockedItemGoal(met, content, 'roter-stier')).toBeNull();
  });

  it('announces an earned item without naming it', () => {
    const met = withBossFight(createDefaultSave(), fight({ floor: 2, hitsTaken: 0 }), content);
    expect([...earnedNames(met, content).entries()]).toEqual([
      ['item:roter-stier', EARNED_ITEM_NAME],
    ]);
    expect(EARNED_ITEM_NAME).toBe('???');
  });

  it('"unlock everything" opens every item', () => {
    expect(lockedItemIds(withEverythingUnlocked(createDefaultSave(), content), content)).toEqual(
      [],
    );
  });
});
