import { describe, expect, it } from 'vitest';
import { STAMMTISCH } from '../../src/content/stammtisch/index.js';
import { fillTokens, pickLine, runFactsFrom } from '../../src/app/meta/progress.js';
import { createDefaultSave } from '../../src/app/save/schema.js';
import { withBossDefeat, withRunOutcome } from '../../src/app/meta/progress.js';

/** The tokens `fillTokens` knows how to replace. A line carrying anything else prints it raw. */
const KNOWN_TOKENS = ['{sek}', '{kills}', '{stock}', '{wort}'];

describe('Stammtisch content (#46)', () => {
  const { regulars, unlocks, characters } = STAMMTISCH;

  it('gives every regular an unlock that actually exists', () => {
    const ids = new Set(unlocks.map((unlock) => unlock.id));
    for (const regular of regulars) {
      expect(ids, `${regular.name} brings ${regular.grants}`).toContain(regular.grants);
    }
  });

  it('has one regular per unlock — an unlock nobody carries could never be earned', () => {
    const carried = regulars.map((regular) => regular.grants);
    expect(new Set(carried).size).toBe(carried.length);
    expect(new Set(carried)).toEqual(new Set(unlocks.map((unlock) => unlock.id)));
  });

  it('seats every regular in a place of their own', () => {
    const seats = regulars.map((regular) => regular.seat);
    expect(new Set(seats).size).toBe(seats.length);
    expect(new Set(regulars.map((regular) => regular.id)).size).toBe(regulars.length);
  });

  it('states every goal in words, so a locked chair is never a mystery', () => {
    for (const unlock of unlocks) {
      expect(unlock.goal.length, unlock.id).toBeGreaterThan(0);
      expect(unlock.effect.length, unlock.id).toBeGreaterThan(0);
      expect(unlock.name.length, unlock.id).toBeGreaterThan(0);
    }
  });

  it('leaves nobody speechless: every regular has a line for a run they have nothing specific to say about', () => {
    for (const regular of regulars) {
      expect(
        regular.lines.some((line) => line.when.kind === 'always'),
        regular.name,
      ).toBe(true);
      expect(regular.waiting.length, regular.name).toBeGreaterThan(0);
      expect(regular.greeting.length, regular.name).toBeGreaterThan(0);
    }
  });

  it('uses only tokens the formatter knows — an unknown one would print as braces', () => {
    for (const regular of regulars) {
      for (const line of regular.lines) {
        for (const token of line.text.match(/\{[a-z]+\}/g) ?? []) {
          expect(KNOWN_TOKENS, `${regular.name}: ${line.text}`).toContain(token);
        }
      }
    }
  });

  it('says something with a number in it about a real run, for every regular', () => {
    // #46's acceptance criterion, checked against the authored roster rather
    // than against a fixture: a regular whose every line is generic is a
    // regular who is not doing the job the table exists for.
    const facts = runFactsFrom({
      seed: 3,
      floor: 1,
      ticksSurvived: 660,
      kills: 4,
      deathWord: 'Hi',
      recordedAt: 1,
    });
    for (const regular of regulars) {
      const spoken = regular.lines.map((line) => fillTokens(line.text, facts));
      expect(
        spoken.some((line) => /\d/.test(line)),
        regular.name,
      ).toBe(true);
      expect(pickLine(regular, facts).length).toBeGreaterThan(0);
    }
  });

  it('starts everyone off with exactly one character and an empty table', () => {
    const save = createDefaultSave();
    expect(characters.filter((character) => character.requires === null)).toHaveLength(1);
    expect(save.unlocks).toEqual([]);
  });

  it('fills a chair for each of the two bosses the game actually has', () => {
    // The floors that exist are 1 and 2 (`app/main.ts`'s
    // HIGHEST_PLAYABLE_FLOOR); both have a chair, and beating both fills
    // exactly those two.
    let save = withBossDefeat(createDefaultSave(), 1, STAMMTISCH);
    save = withBossDefeat(save, 2, STAMMTISCH);
    expect(save.unlocks).toEqual(['lore-opas-zettl', 'promille']);
  });

  it('fills the rest of the table off totals a session actually reaches', () => {
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
        STAMMTISCH,
      );
    }
    // Five runs of forty-five kills is an evening, not a grind — both
    // totals-based chairs are filled by then.
    expect(save.unlocks).toEqual(['stammtisch-tafel', 'stammtisch-zufoi']);
  });
});
