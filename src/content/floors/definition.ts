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
   * Transcribed from `docs/CONTENT_BIBLE.md` §1's description of the floor
   * rather than invented here — the card is meant to say what the chapter is,
   * and the chapter is already written down. Data, like everything else on
   * this record: a floor's card needs no engine change, only a row.
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
    name: 'Der Keller',
    floorTag: 'cellar',
    minRooms: 8,
    maxRooms: 12,
    gridRadius: 5,
    flavour: 'Feucht, kalt, und oa einzige Glühbirn',
  },
  {
    floor: 2,
    name: 'Dorf & Acker',
    floorTag: 'rural',
    minRooms: 9,
    maxRooms: 13,
    gridRadius: 5,
    flavour: 'Dorfplatz, Hopfen — und lauter neue Kistn',
  },
  {
    floor: 3,
    name: 'Der Wald',
    floorTag: 'wald',
    minRooms: 10,
    maxRooms: 14,
    gridRadius: 6,
    flavour: 'Dicht, dunkel, und falsch',
  },
  {
    floor: 4,
    name: 'Die Alpen',
    floorTag: 'alpen',
    minRooms: 10,
    maxRooms: 14,
    gridRadius: 6,
    flavour: 'Fels, Schnee, und a Wind der schiabt',
  },
  {
    floor: 5,
    name: 'Schloss Neuschwanstein',
    floorTag: 'schloss',
    minRooms: 11,
    maxRooms: 15,
    gridRadius: 6,
    flavour: 'A Märchen auf Pump, nie fertig worn',
  },
  {
    floor: 6,
    name: 'Die Brauerei',
    floorTag: 'brauerei',
    minRooms: 11,
    maxRooms: 15,
    gridRadius: 7,
    flavour: 'Stahl, Warnlicht, und Quotn an der Wand',
  },
  {
    floor: 7,
    name: 'Die Wiesn',
    floorTag: 'wiesn',
    minRooms: 12,
    maxRooms: 16,
    gridRadius: 7,
    flavour: 'Ois auf oamal, und ois zvui',
  },
];
