/**
 * Per-floor generation targets: how big a floor is, and which room templates
 * it draws from.
 *
 * `floorTag` matches `RoomTemplate.metadata.floorTags` — the generator only
 * considers templates tagged for the floor it is building. Floors 3–7 have no
 * authored templates yet (that's #39–#43); their configs exist so the
 * generator and its tests are already right for seven floors, not one.
 */
export interface FloorConfig {
  readonly floor: number;
  readonly name: string;
  readonly floorTag: string;
  /** Inclusive. The generator rolls a target room count in this range, minus one reserved for the secret room. */
  readonly minRooms: number;
  readonly maxRooms: number;
  /** Grid cells from the start room a floor may sprawl before generation stops growing it. */
  readonly gridRadius: number;
}

export const FLOOR_CONFIGS: readonly FloorConfig[] = [
  { floor: 1, name: 'Der Keller', floorTag: 'cellar', minRooms: 8, maxRooms: 12, gridRadius: 5 },
  { floor: 2, name: 'Dorf & Acker', floorTag: 'rural', minRooms: 9, maxRooms: 13, gridRadius: 5 },
  { floor: 3, name: 'Der Wald', floorTag: 'wald', minRooms: 10, maxRooms: 14, gridRadius: 6 },
  { floor: 4, name: 'Die Alpen', floorTag: 'alpen', minRooms: 10, maxRooms: 14, gridRadius: 6 },
  {
    floor: 5,
    name: 'Schloss Neuschwanstein',
    floorTag: 'schloss',
    minRooms: 11,
    maxRooms: 15,
    gridRadius: 6,
  },
  {
    floor: 6,
    name: 'Die Brauerei',
    floorTag: 'brauerei',
    minRooms: 11,
    maxRooms: 15,
    gridRadius: 7,
  },
  { floor: 7, name: 'Die Wiesn', floorTag: 'wiesn', minRooms: 12, maxRooms: 16, gridRadius: 7 },
];
