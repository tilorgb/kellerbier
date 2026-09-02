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
    flavour: 'Sunny square, hop fields — and too many new *Kistn*.',
  },
  {
    floor: 3,
    name: 'The Forest',
    floorTag: 'wald',
    minRooms: 10,
    maxRooms: 14,
    gridRadius: 6,
    flavour: 'Thick, dark woods. The *Waldschrat* is watching.',
  },
  {
    floor: 4,
    name: 'The Alps',
    floorTag: 'alpen',
    minRooms: 10,
    maxRooms: 14,
    gridRadius: 6,
    flavour: 'Rock, snow, and a wind that *schiabt*.',
  },
  {
    floor: 5,
    name: 'Neuschwanstein Castle',
    floorTag: 'schloss',
    minRooms: 11,
    maxRooms: 15,
    gridRadius: 6,
    flavour: 'A fairy tale on credit — never *fertig*.',
  },
  {
    floor: 6,
    name: 'The Brewery',
    floorTag: 'brauerei',
    minRooms: 11,
    maxRooms: 15,
    gridRadius: 7,
    flavour: 'Steel, hazard light, and *Quotn* on every wall.',
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
    flavour: 'Beer tents, brass bands, and *ois zvui*.',
  },
];
