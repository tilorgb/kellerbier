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
  /**
   * The floor's real name — Bavarian/German, per `docs/CONTENT_BIBLE.md` §0
   * and §1's own floor headers, and unchanged across every locale, the same
   * rule an item's `name` follows. Not translated: a `t()` lookup would need
   * a value import this file cannot make (`content-is-data`), and the rule
   * is "stays Bavarian in every locale" anyway, so there is nothing to look
   * up. Floor 7 stays "Die Wiesn" for the trademark reason given on its own
   * entry below; floors 1-6 previously held an English gloss of this same
   * name here (`docs/DECISIONS.md`-adjacent debt from before this issue) —
   * fixed as part of #52, since a floor name is exactly the class of string
   * the naming rule already covered and the title card was showing untranslated
   * English instead.
   */
  readonly name: string;
  readonly floorTag: string;
  /** Inclusive. The generator rolls a target room count in this range, minus one reserved for the secret room. */
  readonly minRooms: number;
  readonly maxRooms: number;
  /** Grid cells from the start room a floor may sprawl before generation stops growing it. */
  readonly gridRadius: number;
  /**
   * Minimum room-graph distance (doors walked) the boss room must sit at from
   * the start room, enforced by `sim/room/floor-plan.ts`'s `tryGenerateFloor`
   * as a generation retry (#271) — room count alone does not bound how far a
   * player actually has to walk to reach the boss, since `buildSkeleton`
   * grows a compact blob whose diameter rises with roughly √rooms rather than
   * with room count itself.
   */
  readonly minBossDistance: number;
  /**
   * Chance, per generation attempt, that this floor rolls its XL variant
   * (#271) — see `FloorPlan.extraLarge`. Rolled from the floor's own RNG
   * stream inside `generateFloor`, so it is exactly as reproducible as the
   * rest of the layout.
   */
  readonly xlChance: number;
  /**
   * Multiplier applied to `minRooms`/`maxRooms` (directly) and
   * `minBossDistance` (by its square root — see
   * `effectiveGenerationTargets`'s own doc comment) when a floor rolls XL.
   */
  readonly xlRoomMultiplier: number;
  /**
   * A localisation key (`floors.<floorTag>.flavour`), not literal text — see
   * `sim/item/definition.ts`'s identical note on `ItemDefinition.description`.
   * One line, in the floor's own voice, for its title card (#154).
   *
   * Grounded in `docs/CONTENT_BIBLE.md` §1's description of the floor rather
   * than invented from nothing — the card is meant to say what the chapter
   * is, and the chapter is already written down. Each locale's line carries
   * one seasoned Bavarian word, marked `*like this*` and rendered by
   * `render/ui/text.ts`'s `SeasonedText` — `docs/CONTENT_BIBLE.md` §0's "a
   * word, not a sentence" rule (#221) applies per locale, not only to English.
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
   *
   * #272: `threatPerDistance` dropped from this override — the fractional-
   * depth retune landed both floors' per-door ramp on the same underlying
   * number (`DEFAULT_ROOM_GEN_TUNING.threatPerDistance`, 7), so Floor 2 now
   * inherits it rather than restating an identical value. Re-measured
   * against 500 real Floor 2 layouts: 5.78 bodies / 14.96 HP per ordinary
   * room, within a couple of percent of this override's own #231 landing
   * point (6.25/16.25 was the two-floor-demo table's own earlier number;
   * the ordinary-room mean this override actually produces, before and
   * after #272, is ~5.7-5.8 bodies) — the ramp shape changed, the floor's
   * feel didn't.
   */
  rural: { threatBase: 3.5, maxEnemies: 7, hazardChance: 0.2 },
};

export const FLOOR_CONFIGS: readonly FloorConfig[] = [
  {
    floor: 1,
    // `docs/CONTENT_BIBLE.md` §1: "Floor 1 — Der Keller".
    name: 'Der Keller',
    floorTag: 'cellar',
    minRooms: 11,
    maxRooms: 14,
    gridRadius: 5,
    minBossDistance: 5,
    // #271: 0 until the save has beaten a boss at least once — a first-time
    // player's tutorial floor should never be the unlucky XL roll. The gate
    // lives at the call site (`app/main.ts`'s `startRun`, via
    // `app/meta/progress.ts`'s `hasBeatenABoss`), not here: this is the
    // steady-state chance once that condition is met.
    xlChance: 0.15,
    xlRoomMultiplier: 1.7,
    flavour: 'floors.cellar.flavour',
  },
  {
    floor: 2,
    // `docs/CONTENT_BIBLE.md` §1: "Floor 2 — Dorf & Acker".
    name: 'Dorf & Acker',
    floorTag: 'rural',
    minRooms: 13,
    maxRooms: 17,
    gridRadius: 5,
    minBossDistance: 5,
    xlChance: 0.25,
    xlRoomMultiplier: 1.7,
    flavour: 'floors.rural.flavour',
  },
  {
    floor: 3,
    // `docs/CONTENT_BIBLE.md` §1: "Floor 3 — Der Wald".
    name: 'Der Wald',
    floorTag: 'wald',
    minRooms: 12,
    maxRooms: 16,
    gridRadius: 6,
    minBossDistance: 5,
    xlChance: 0.25,
    xlRoomMultiplier: 1.7,
    flavour: 'floors.wald.flavour',
  },
  {
    floor: 4,
    // `docs/CONTENT_BIBLE.md` §1: "Floor 4 — Die Alpen".
    name: 'Die Alpen',
    floorTag: 'alpen',
    minRooms: 12,
    maxRooms: 16,
    gridRadius: 6,
    minBossDistance: 5,
    xlChance: 0.25,
    xlRoomMultiplier: 1.7,
    flavour: 'floors.alpen.flavour',
  },
  {
    floor: 5,
    // `docs/CONTENT_BIBLE.md` §1: "Floor 5 — Schloss Neuschwanstein".
    name: 'Schloss Neuschwanstein',
    floorTag: 'schloss',
    minRooms: 13,
    maxRooms: 17,
    gridRadius: 6,
    minBossDistance: 6,
    xlChance: 0.25,
    xlRoomMultiplier: 1.7,
    flavour: 'floors.schloss.flavour',
  },
  {
    floor: 6,
    // `docs/CONTENT_BIBLE.md` §1: "Floor 6 — Die Brauerei".
    name: 'Die Brauerei',
    floorTag: 'brauerei',
    minRooms: 13,
    maxRooms: 17,
    gridRadius: 7,
    minBossDistance: 6,
    xlChance: 0.25,
    xlRoomMultiplier: 1.7,
    flavour: 'floors.brauerei.flavour',
  },
  {
    floor: 7,
    // "Oktoberfest" is a protected mark — the floor stays "Die Wiesn" in
    // every locale, per `docs/CONTENT_BIBLE.md` §0.
    name: 'Die Wiesn',
    floorTag: 'wiesn',
    minRooms: 14,
    maxRooms: 18,
    gridRadius: 7,
    minBossDistance: 6,
    xlChance: 0.25,
    xlRoomMultiplier: 1.7,
    flavour: 'floors.wiesn.flavour',
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
