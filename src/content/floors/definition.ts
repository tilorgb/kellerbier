/**
 * Per-floor generation targets: how big a floor is, and which room templates
 * it draws from.
 *
 * `floorTag` matches `RoomTemplate.metadata.floorTags` — the generator only
 * considers templates tagged for the floor it is building. Floors 3–7 have no
 * authored templates yet (that's #39–#43); their configs exist so the
 * generator and its tests are already right for seven floors, not one.
 */

import type { RoomGenTuning } from '../../sim/tuning.js';

export interface FloorConfig {
  readonly floor: number;
  readonly name: string;
  readonly floorTag: string;
  /** Inclusive. The generator rolls a target room count in this range, minus one reserved for the secret room. */
  readonly minRooms: number;
  readonly maxRooms: number;
  /** Grid cells from the start room a floor may sprawl before generation stops growing it. */
  readonly gridRadius: number;
  /**
   * One line, in the floor's own voice, for its title card (#154).
   *
   * Grounded in `docs/CONTENT_BIBLE.md` §1's description of the floor rather
   * than invented from nothing — the card is meant to say what the chapter
   * is, and the chapter is already written down. Plain English carrying one
   * seasoned Bavarian word, marked `*like this*` and rendered by
   * `render/ui/text.ts`'s `SeasonedText` — `docs/CONTENT_BIBLE.md` §0's "a
   * word, not a sentence" rule (#221), not a translated German sentence.
   * Data, like everything else on this record: a floor's card needs no
   * engine change, only a row.
   */
  readonly flavour: string;
}

/**
 * Per-floor overrides for procedural room generation (#random-rooms).
 *
 * `sim/tuning.ts`'s `DEFAULT_ROOM_GEN_TUNING` is Floor 1's feel and the live
 * debug-slider target. A floor that wants a different texture — denser woods, a
 * wide-open Wiesn — lists just the fields that differ here, keyed by its
 * `floorTag`; `app/main.ts` merges the override over the live tuning when it
 * generates that floor's rooms. Empty means "same as Floor 1".
 */
export const ROOM_GEN_FLOOR_OVERRIDES: Readonly<Record<string, Partial<RoomGenTuning>>> = {
  // wald: { minCoverTiles: 12, maxCoverTiles: 26, busyChance: 0.2 },
  /**
   * #231: Floor 2's `threatPerFloor` bump (`DEFAULT_ROOM_GEN_TUNING`) moved
   * an ordinary room from 5.42 enemies / 12.99 HP on Floor 1 to 5.64 / 14.50
   * on Floor 2 — +4% bodies, +12% HP, the "quarter of one extra Bierratte"
   * #231 first measured. `maxEnemies` (not the threat budget) turned out to
   * be the actual ceiling both floors were hitting, so raising `threatBase`/
   * `threatPerDistance` alone barely moved the body count — this override
   * lifts the cap too, landing at 6.25 enemies / 16.25 HP: +15%/+25% over
   * Floor 1, a real step up from the rounding-error one but deliberately
   * modest.
   *
   * An earlier pass here went to +55%/+70% on the theory that Floor 2, as
   * the last floor of a two-floor demo, needed to read as the run's real
   * capstone. Playtesting it said otherwise: more/tankier bodies made the
   * floor feel like a final stage rather than an ordinary second one, and
   * "just add enemies" is explicitly not the fix — a two-floor demo can
   * still hold a two-floor's ramp, one step, not a cliff. The room-gen knob
   * stays modest for exactly that reason; the roster's own moveset variety
   * (bierratte's evasive-erratic/aimed-shot/dash loop is the model other
   * Floor 2 enemies should move toward) is where "harder" is meant to keep
   * coming from, not from more bodies per room.
   *
   * `DEFAULT_ROOM_GEN_TUNING` itself is untouched, so Floor 1 — and the
   * tutorial's own feel — doesn't move with it. Elite chance
   * (`DEFAULT_ENEMY_TUNING.eliteChancePerExtraFloor`) is left alone: #231's
   * own acceptance bar for it ("reasonable once #230 lands") is already met
   * at Floor 2's 14%.
   */
  rural: { threatBase: 3.5, threatPerDistance: 1.6, maxEnemies: 7, hazardChance: 0.2 },
};

export const FLOOR_CONFIGS: readonly FloorConfig[] = [
  {
    floor: 1,
    name: 'The Cellar',
    floorTag: 'cellar',
    minRooms: 8,
    maxRooms: 12,
    gridRadius: 5,
    flavour: 'Watch your *Fiaß*.',
  },
  {
    floor: 2,
    name: 'Village & Fields',
    floorTag: 'rural',
    minRooms: 9,
    maxRooms: 13,
    gridRadius: 5,
    flavour: 'Sunny, peaceful, *Blaskapell’n*.',
  },
  {
    floor: 3,
    name: 'The Forest',
    floorTag: 'wald',
    minRooms: 10,
    maxRooms: 14,
    gridRadius: 6,
    flavour: 'Oh, deer!',
  },
  {
    floor: 4,
    name: 'The Alps',
    floorTag: 'alpen',
    minRooms: 10,
    maxRooms: 14,
    gridRadius: 6,
    flavour: 'Thin air and hard *Haxn*.',
  },
  {
    floor: 5,
    name: 'Neuschwanstein Castle',
    floorTag: 'schloss',
    minRooms: 11,
    maxRooms: 15,
    gridRadius: 6,
    flavour: 'Locals describe its beauty as "*basst scho*."',
  },
  {
    floor: 6,
    name: 'The Brewery',
    floorTag: 'brauerei',
    minRooms: 11,
    maxRooms: 15,
    gridRadius: 7,
    flavour: 'Someone put a *Rausch* in my last beer.',
  },
  {
    floor: 7,
    // "Oktoberfest" is a protected mark — the floor stays "Die Wiesn" in
    // every locale, per `docs/CONTENT_BIBLE.md` §0.
    name: 'Die Wiesn',
    floorTag: 'wiesn',
    minRooms: 12,
    maxRooms: 16,
    gridRadius: 7,
    flavour: 'Ole, ole, ole!',
  },
];

/**
 * The highest floor number with a real room pool to draw from, today —
 * `FLOOR_CONFIGS` above already lists floors up to 7 (#37's doc comment),
 * but a floor's config being *present* isn't the same as its room pool
 * being non-empty: floors 3-7 have zero templates tagged for their
 * `floorTag` (`wald`/`alpen`/`schloss`/`brauerei`/`wiesn`), so
 * `generateFloor` would throw the moment it tried to place a start or boss
 * room. Bump this the moment a floor's room templates land (its
 * `floorTag` shows up in at least a start/boss/treasure/shop/secret/
 * supersecret template — see `sim/room/floor-plan.ts`'s
 * `MIN_ROOMS_FOR_ROLES`), not before.
 *
 * Lives here rather than as a local constant in `app/main.ts` (which owns
 * the dev "next floor" loop that reads it) so `tests/playtest/`'s headless
 * bot can import the same number instead of carrying its own copy that
 * could silently drift out of sync.
 */
export const HIGHEST_PLAYABLE_FLOOR = 2;
