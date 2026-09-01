import { describe, expect, it } from 'vitest';
import { AUTHORED_CHARACTERS, CHARACTERS } from '../../src/content/characters/index.js';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { bossStatKey, STAT_KILLS, STAT_RUNS } from '../../src/app/meta/definition.js';
import { CHARACTER_RULE_IDS, NEUTRAL_TRAITS } from '../../src/sim/character/definition.js';
import { PROJECTILE_TAG_BY_NAME } from '../../src/sim/projectile/tags.js';
import { STAT_IDS } from '../../src/sim/stats/definition.js';
import { PLAYER_HEALTH } from '../../src/sim/game/sim.js';
import { alois } from '../../src/content/characters/alois.js';

/**
 * The highest floor a player can actually reach in the shipped build
 * (`app/main.ts`'s `HIGHEST_PLAYABLE_FLOOR`, and the reason it is repeated
 * here rather than imported: `main.ts` boots a renderer on import).
 *
 * Repeated *and asserted against* — the point of the reachability test below
 * is that a character gated on floor 5 is a character nobody can play, which
 * is exactly the "the gate itself was not updated" failure `CLAUDE.md` calls
 * out. When floor 3 ships, this number and that constant move together.
 */
const HIGHEST_PLAYABLE_FLOOR = 2;

describe('character roster (#47)', () => {
  it('gives every character a distinct id, and traits that agree about it', () => {
    const ids = AUTHORED_CHARACTERS.map((character) => character.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const character of AUTHORED_CHARACTERS) {
      expect(character.traits.id, character.name).toBe(character.id);
      expect(character.traits.name, character.id).toBe(character.name);
      expect(character.note.length, character.id).toBeGreaterThan(0);
    }
  });

  it('starts everyone with items that exist', () => {
    const items = new Set(ITEM_DEFINITIONS.map((item) => item.id));
    for (const character of AUTHORED_CHARACTERS) {
      for (const id of character.traits.items) {
        expect(items, `${character.name} starts with ${id}`).toContain(id);
      }
    }
  });

  it('names only projectile tags, stats and rules the engine has', () => {
    for (const character of AUTHORED_CHARACTERS) {
      for (const tag of character.traits.shotTags) {
        expect(Object.keys(PROJECTILE_TAG_BY_NAME), character.id).toContain(tag);
      }
      for (const rule of character.traits.rules) {
        expect(CHARACTER_RULE_IDS, character.id).toContain(rule);
      }
      for (const modifier of character.traits.stats) {
        expect(STAT_IDS, character.id).toContain(modifier.stat);
        expect(Number.isFinite(modifier.value), `${character.id} ${modifier.stat}`).toBe(true);
        // A multiplier of zero is a stat deleted, not a stat tuned — and a
        // negative one is a stat the caps would have to rescue every tick.
        expect(modifier.value, `${character.id} ${modifier.stat}`).toBeGreaterThan(0);
      }
    }
  });

  it('is playable: nobody is so fragile or so slow that the run is not a run', () => {
    for (const character of AUTHORED_CHARACTERS) {
      expect(character.traits.maxHealth, character.id).toBeGreaterThanOrEqual(3);
      expect(character.traits.maxHealth, character.id).toBeLessThanOrEqual(10);
      const speed = character.traits.stats.find(
        (modifier) => modifier.stat === 'gschwindigkeit' && modifier.op === 'multiply',
      );
      expect(speed?.value ?? 1, character.id).toBeGreaterThanOrEqual(0.6);
    }
  });

  /**
   * The one that would have caught floor 2's freeze, in this feature's own
   * shape: a character whose unlock condition names content that does not
   * exist is a locked row with no way to open it, however correct its stat
   * block is. `docs/GAME_DESIGN.md` §3 wants Resi at floor 3 and Ludwig off
   * his own boss fight; until those floors ship, every condition here has to
   * be one a player of the *current* build can actually meet.
   */
  it('gates every character on something the shipped game can actually produce', () => {
    const countable = new Set([STAT_KILLS, STAT_RUNS]);
    for (let floor = 1; floor <= HIGHEST_PLAYABLE_FLOOR; floor++) {
      countable.add(bossStatKey(floor));
    }
    for (const character of AUTHORED_CHARACTERS) {
      const requires = character.requires;
      if (requires === null) {
        continue;
      }
      expect(character.goal.length, `${character.id} states its goal`).toBeGreaterThan(0);
      if (requires.kind === 'bossDefeated') {
        expect(requires.floor, character.id).toBeLessThanOrEqual(HIGHEST_PLAYABLE_FLOOR);
      } else {
        expect(countable, `${character.id} counts ${requires.stat}`).toContain(requires.stat);
        expect(requires.value, character.id).toBeGreaterThan(0);
      }
    }
  });

  it('offers exactly one character with no condition at all, and it is Alois', () => {
    const free = AUTHORED_CHARACTERS.filter((character) => character.requires === null);
    expect(free.map((character) => character.id)).toEqual(['alois']);
    expect(free[0]?.goal).toBe('');
  });

  it("keeps Alois's traits identical to the engine's own idea of no character", () => {
    expect(alois.traits).toEqual(NEUTRAL_TRAITS);
    expect(NEUTRAL_TRAITS.maxHealth).toBe(PLAYER_HEALTH);
  });

  it("spells König Ludwig's stand-in condition as the boss statistic it means", () => {
    const ludwig = AUTHORED_CHARACTERS.find((character) => character.id === 'ludwig');
    expect(ludwig?.requires).toEqual({ kind: 'statAtLeast', stat: bossStatKey(2), value: 3 });
  });

  it('gives every rule the engine knows about to somebody — an unread rule is dead code', () => {
    const used = new Set(AUTHORED_CHARACTERS.flatMap((character) => character.traits.rules));
    expect([...used].sort()).toEqual([...CHARACTER_RULE_IDS].sort());
  });

  /**
   * The offered roster (#205) — cut down to Alois alone until the other five
   * `AUTHORED_CHARACTERS` each get their own balance pass. This is the one
   * assertion in this file about what `CHARACTERS` actually is rather than
   * about authored-content quality; the rest deliberately test
   * `AUTHORED_CHARACTERS` so a benched character stays honest while it waits.
   */
  it('currently offers only Alois, until the rest come back one at a time (#205)', () => {
    expect(CHARACTERS.map((character) => character.id)).toEqual(['alois']);
  });
});
