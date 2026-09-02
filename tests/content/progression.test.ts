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

  it('grants Promille for the boss the game actually has beyond floor 1', () => {
    // The floors that exist are 1 and 2 (`app/main.ts`'s
    // HIGHEST_PLAYABLE_FLOOR); beating floor 2's boss is what grants
    // Promille.
    const save = withBossDefeat(createDefaultSave(), 2, PROGRESSION);
    expect(save.unlocks).toEqual(['promille']);
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
