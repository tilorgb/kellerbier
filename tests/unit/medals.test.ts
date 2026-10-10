import { describe, expect, it } from 'vitest';
import {
  type ProgressionContent,
  STAT_WIN_FASTEST_TICKS,
  STAT_WIN_NO_BOSS_HITS,
  STAT_WIN_NO_ITEMS,
} from '../../src/app/meta/definition.js';
import { bossAsCharacterStatKey } from '../../src/app/meta/feats.js';
import {
  HIDDEN_MEDAL,
  buildMedalShelf,
  earnedNames,
  grantEarnedUnlocks,
  medalMet,
  withRunWon,
} from '../../src/app/meta/progress.js';
import { migrateSave } from '../../src/app/save/migrations.js';
import { createDefaultSave, sanitizeSave, type SaveData } from '../../src/app/save/schema.js';
import { alois } from '../../src/content/characters/alois.js';
import { resi } from '../../src/content/characters/resi.js';
import { HIGHEST_PLAYABLE_FLOOR } from '../../src/content/floors/definition.js';
import { MEDALS } from '../../src/content/progression/medals.js';
import { DIFFICULTY_TIERS } from '../../src/content/progression/tiers.js';
import { MedalScreen } from '../../src/render/medal-screen.js';
import { installPixelFonts } from '../../src/render/ui/font.js';
import { UiKit } from '../../src/render/ui/kit.js';
import { TICKS_PER_SECOND } from '../../src/sim/time.js';

installPixelFonts();

/**
 * Medals (#506): granted from the save alone by the same re-walk as unlocks,
 * each met exactly when its goal says and not a tick or a hit sooner.
 */

const CONTENT: ProgressionContent = {
  unlocks: [],
  characters: [alois, { ...resi, requires: null }],
  tiers: DIFFICULTY_TIERS,
  medals: MEDALS,
  items: [
    {
      itemId: 'krapfen',
      condition: { kind: 'statAtLeast', stat: 'feat.run.mostPassives', value: 6 },
      goal: '',
    },
  ],
  itemIds: ['bierkrug', 'krapfen'],
};

const WIN = { ticks: 20 * 60 * TICKS_PER_SECOND, bossHits: 3, itemsPickedUp: 4 };

function medal(id: string): (typeof MEDALS)[number] {
  const found = MEDALS.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(id);
  }
  return found;
}

function met(save: SaveData, id: string): boolean {
  return medalMet(save, CONTENT, medal(id).condition);
}

describe('medal conditions, met and missed (#506)', () => {
  it('tier 5: a tier-5 win for one character, or for everyone', () => {
    const tier4 = withRunWon(createDefaultSave(), 'alois', 4, CONTENT, WIN);
    expect(met(tier4, 'tier-5')).toBe(false);
    const alois5 = withRunWon(tier4, 'alois', 5, CONTENT, WIN);
    expect(met(alois5, 'tier-5')).toBe(true);
    expect(met(alois5, 'tier-5-everyone')).toBe(false);
    expect(met(withRunWon(alois5, 'resi', 5, CONTENT, WIN), 'tier-5-everyone')).toBe(true);
  });

  it('boss marks: every playable floor, for one character or everyone', () => {
    const statistics: Record<string, number> = {};
    for (let floor = 1; floor < HIGHEST_PLAYABLE_FLOOR; floor++) {
      statistics[bossAsCharacterStatKey(floor, 'alois')] = 1;
    }
    const allButLast = { ...createDefaultSave(), statistics };
    expect(met(allButLast, 'boss-marks')).toBe(false);
    statistics[bossAsCharacterStatKey(HIGHEST_PLAYABLE_FLOOR, 'alois')] = 1;
    const all = { ...createDefaultSave(), statistics: { ...statistics } };
    expect(met(all, 'boss-marks')).toBe(true);
    expect(met(all, 'boss-marks-everyone')).toBe(false);
  });

  it('every item unlocked, and every item found', () => {
    expect(met(createDefaultSave(), 'all-items-unlocked')).toBe(false);
    const unlocked = { ...createDefaultSave(), statistics: { 'feat.run.mostPassives': 6 } };
    expect(met(unlocked, 'all-items-unlocked')).toBe(true);
    expect(met({ ...createDefaultSave(), discoveredItems: ['bierkrug'] }, 'full-collection')).toBe(
      false,
    );
    expect(
      met({ ...createDefaultSave(), discoveredItems: ['krapfen', 'bierkrug'] }, 'full-collection'),
    ).toBe(true);
  });

  it('untouched by bosses: a win where no boss landed a hit — one hit is not it', () => {
    const hit = withRunWon(createDefaultSave(), 'alois', 0, CONTENT, { ...WIN, bossHits: 1 });
    expect(met(hit, 'untouched-by-bosses')).toBe(false);
    const clean = withRunWon(hit, 'alois', 0, CONTENT, { ...WIN, bossHits: 0 });
    expect(clean.statistics[STAT_WIN_NO_BOSS_HITS]).toBe(1);
    expect(met(clean, 'untouched-by-bosses')).toBe(true);
  });

  it('quick win: under fifteen minutes, judged on the fastest win on record', () => {
    const slow = withRunWon(createDefaultSave(), 'alois', 0, CONTENT, {
      ...WIN,
      ticks: 15 * 60 * TICKS_PER_SECOND + 1,
    });
    expect(met(slow, 'quick-win')).toBe(false);
    const quick = withRunWon(slow, 'alois', 0, CONTENT, {
      ...WIN,
      ticks: 14 * 60 * TICKS_PER_SECOND,
    });
    expect(quick.statistics[STAT_WIN_FASTEST_TICKS]).toBe(14 * 60 * TICKS_PER_SECOND);
    // A slower win afterwards does not overwrite the record.
    expect(withRunWon(quick, 'alois', 0, CONTENT, WIN).statistics[STAT_WIN_FASTEST_TICKS]).toBe(
      14 * 60 * TICKS_PER_SECOND,
    );
    expect(met(quick, 'quick-win')).toBe(true);
  });

  it('empty-handed: a win with no item picked up — one item is not it', () => {
    const one = withRunWon(createDefaultSave(), 'alois', 0, CONTENT, { ...WIN, itemsPickedUp: 1 });
    expect(met(one, 'empty-handed')).toBe(false);
    const none = withRunWon(one, 'alois', 0, CONTENT, { ...WIN, itemsPickedUp: 0 });
    expect(none.statistics[STAT_WIN_NO_ITEMS]).toBe(1);
    expect(met(none, 'empty-handed')).toBe(true);
  });

  it('a lost run earns nothing — the win facts are only ever recorded on a win', () => {
    const save = grantEarnedUnlocks(createDefaultSave(), CONTENT);
    expect(save.achievements).toEqual([]);
  });
});

describe('granting (#506)', () => {
  it('writes earned medals to achievements, retroactively, and names them', () => {
    const before = { ...createDefaultSave(), statistics: { [STAT_WIN_NO_ITEMS]: 2 } };
    expect(before.achievements).toEqual([]);
    const after = grantEarnedUnlocks(before, CONTENT);
    expect(after.achievements).toEqual(['empty-handed']);
    expect([...earnedNames(after, CONTENT).entries()]).toContainEqual([
      'medal:empty-handed',
      'Medal: Win without picking up a single item',
    ]);
  });

  it('keeps an earned id the roster no longer has', () => {
    const save = { ...createDefaultSave(), achievements: ['a-medal-since-cut'] };
    expect(grantEarnedUnlocks(save, CONTENT).achievements).toEqual(['a-medal-since-cut']);
    expect(sanitizeSave(JSON.parse(JSON.stringify(save))).achievements).toEqual([
      'a-medal-since-cut',
    ]);
  });

  it('survives migration from any earlier save', () => {
    const migrated = sanitizeSave(migrateSave({ schemaVersion: 4, achievements: ['quick-win'] }));
    expect(migrated.achievements).toEqual(['quick-win']);
  });
});

describe('the shelf (#506)', () => {
  it('lists earned medals first, and a hidden one as ??? until it is earned', () => {
    const shelf = buildMedalShelf({ ...createDefaultSave(), achievements: ['quick-win'] }, CONTENT);
    expect(shelf.earned).toBe(1);
    expect(shelf.total).toBe(MEDALS.length);
    expect(shelf.medals[0]).toEqual({
      id: 'quick-win',
      text: 'Win in under 15 minutes',
      earned: true,
    });
    expect(shelf.medals.find((row) => row.id === 'empty-handed')?.text).toBe(HIDDEN_MEDAL);
    const revealed = buildMedalShelf(
      { ...createDefaultSave(), achievements: ['empty-handed'] },
      CONTENT,
    );
    expect(revealed.medals[0]?.text).toBe('Win without picking up a single item');
  });

  it('is a screen with only Back to press', () => {
    let backs = 0;
    const screen = new MedalScreen(
      new UiKit(),
      {
        view: () => buildMedalShelf(createDefaultSave(), CONTENT),
        onBack: () => {
          backs += 1;
        },
      },
      'en',
    );
    screen.resize(640, 360);
    screen.show();
    expect(screen.visible).toBe(true);
    screen.activate();
    expect(backs).toBe(1);
  });
});
