import { describe, expect, it } from 'vitest';
import { PROGRESSION } from '../../src/content/progression/index.js';
import { createDefaultSave } from '../../src/app/save/schema.js';
import { withBossDefeat, withRunOutcome } from '../../src/app/meta/progress.js';
import type { UnlockDefinition } from '../../src/app/meta/definition.js';

describe('progression content', () => {
  const { unlocks, characters } = PROGRESSION;

  it('states every goal in words, so a locked unlock is never a mystery', () => {
    for (const unlock of unlocks) {
      expect(unlock.goal.length, unlock.id).toBeGreaterThan(0);
      expect(unlock.effect.length, unlock.id).toBeGreaterThan(0);
      expect(unlock.name.length, unlock.id).toBeGreaterThan(0);
    }
  });

  it('gives every unlock a unique id', () => {
    const ids = unlocks.map((unlock: UnlockDefinition) => unlock.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('starts everyone off with exactly one character and nothing unlocked', () => {
    const save = createDefaultSave();
    expect(characters.filter((character) => character.requires === null)).toHaveLength(1);
    expect(save.unlocks).toEqual([]);
  });

  it("grants Promille on floor 1's boss, inside the shipping run (#236)", () => {
    // The floors that exist are 1 and 2 (`app/main.ts`'s
    // HIGHEST_PLAYABLE_FLOOR), so floor 2's boss is the *last* boss of the
    // shipping game — the gate that used to sit there handed the mechanic
    // over after the only playthrough most players will take. Floor 1's boss
    // is the gate now, and this is the test that says so.
    const save = withBossDefeat(createDefaultSave(), 1, PROGRESSION);
    expect(save.unlocks).toEqual(['promille']);
  });

  it('does not grant Promille for a floor the gate is not on', () => {
    expect(withBossDefeat(createDefaultSave(), 2, PROGRESSION).unlocks).toEqual([]);
  });

  it('grants the run board off a kill total a session actually reaches', () => {
    let save = createDefaultSave();
    for (let index = 0; index < 5; index++) {
      save = withRunOutcome(
        save,
        {
          seed: index,
          floor: 1,
          ticksSurvived: 3600,
          kills: 45,
          deathWord: null,
          recordedAt: index,
        },
        PROGRESSION,
      );
    }
    // Five runs of forty-five kills is an evening, not a grind — the board's
    // 200-kill total is crossed by then.
    expect(save.unlocks).toEqual(['run-board']);
  });
});
