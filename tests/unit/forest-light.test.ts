import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import {
  CANOPY_BAND_ODDS,
  CANOPY_LIT_SHARE,
  canopyLayout,
  forestLightSeed,
  GAPS_PER_CELL,
  MAX_SHAFTS,
} from '../../src/render/world/canopy.js';
import {
  LANTERN_INSET,
  LANTERNS_PER_CELL,
  MAX_WALL_LANTERNS,
  wallLanternLayout,
} from '../../src/render/world/wall-lanterns.js';
import { DOOR_SPAN, RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  compileRoomTemplate,
  doorCentre,
  validateRoomTemplate,
} from '../../src/sim/room/template.js';

/**
 * Floor 3's light (#424), as far as it can be judged without a GPU: where the
 * canopy opens and where the lanterns hang are pure functions of a seed and
 * the room. How it *looks* is judged in the room, by eye.
 */

const WIDTH = 320;
const DEPTH = 180;

describe('where the canopy opens', () => {
  it('gives a single-cell room four or five openings, a band among them about one room in four', () => {
    let bands = 0;
    const rooms = 400;
    for (let seed = 0; seed < rooms; seed++) {
      const layout = canopyLayout(
        forestLightSeed(`room-${String(seed)}`, 3),
        WIDTH,
        DEPTH,
        'ordinary',
      );
      const openings = layout.gaps.length + (layout.band === null ? 0 : 1);
      expect(openings, `seed ${String(seed)}`).toBeGreaterThanOrEqual(GAPS_PER_CELL);
      expect(openings, `seed ${String(seed)}`).toBeLessThanOrEqual(GAPS_PER_CELL + 1);
      bands += layout.band === null ? 0 : 1;
    }
    expect(bands / rooms).toBeGreaterThan(0.6 / CANOPY_BAND_ODDS);
    expect(bands / rooms).toBeLessThan(1.5 / CANOPY_BAND_ODDS);
  });

  it('keeps every gap inside the room and the gaps apart', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { gaps } = canopyLayout(seed * 7919, WIDTH, DEPTH, 'ordinary');
      for (const gap of gaps) {
        expect(gap.x).toBeGreaterThan(0);
        expect(gap.x).toBeLessThan(WIDTH);
        expect(gap.z).toBeGreaterThan(0);
        expect(gap.z).toBeLessThan(DEPTH);
      }
    }
  });

  it('opens gaps whose ellipses cover roughly the lit share of the room', () => {
    let share = 0;
    let rooms = 0;
    for (let seed = 0; seed < 300; seed++) {
      const layout = canopyLayout(seed * 104729, WIDTH, DEPTH, 'ordinary');
      if (layout.band !== null) {
        continue;
      }
      const area = layout.gaps.reduce(
        (sum, gap) => sum + Math.PI * gap.radiusX * gap.radiusZ * 0.7,
        0,
      );
      share += area / (WIDTH * DEPTH);
      rooms += 1;
    }
    expect(share / rooms).toBeGreaterThan(CANOPY_LIT_SHARE * 0.8);
    expect(share / rooms).toBeLessThan(CANOPY_LIT_SHARE * 1.2);
  });

  it('scales the number of gaps with the room, within the shaft pool', () => {
    for (let seed = 0; seed < 100; seed++) {
      const big = canopyLayout(seed, WIDTH * 2, DEPTH * 2, 'ordinary');
      const openings = big.gaps.length + (big.band === null ? 0 : 1);
      expect(openings).toBeGreaterThanOrEqual(GAPS_PER_CELL * 4);
      expect(big.gaps.length + 3).toBeLessThanOrEqual(MAX_SHAFTS);
    }
  });

  it('is the same for the same room, and different for a different one', () => {
    const seed = forestLightSeed('wald-grove', 3, WIDTH, DEPTH);
    expect(canopyLayout(seed, WIDTH, DEPTH, 'ordinary')).toEqual(
      canopyLayout(forestLightSeed('wald-grove', 3, WIDTH, DEPTH), WIDTH, DEPTH, 'ordinary'),
    );
    expect(forestLightSeed('wald-hollow', 3, WIDTH, DEPTH)).not.toBe(seed);
  });

  it('stages the boss room in one big clearing in the middle', () => {
    const layout = canopyLayout(99, WIDTH, DEPTH, 'boss');
    expect(layout.band).toBeNull();
    expect(layout.gaps).toHaveLength(1);
    expect(layout.gaps[0]?.x).toBe(WIDTH / 2);
    expect(layout.gaps[0]?.z).toBe(DEPTH / 2);
    expect(layout.gaps[0]?.radiusX).toBeGreaterThan(WIDTH / 4);
  });

  it('does not open at all over a lantern room', () => {
    expect(canopyLayout(99, WIDTH, DEPTH, 'closed')).toEqual({ gaps: [], band: null });
  });
});

describe('where the lanterns hang', () => {
  // Single-cell rooms: a bigger one compiles against a floor-plan placement
  // this test has no need to build, and hangs its lanterns by the same rule.
  const wald = ROOM_TEMPLATES.filter((room, index) => {
    const { metadata } = validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS);
    return metadata.floorTags.includes('wald') && metadata.shape === '1x1';
  }).map((room) => compileRoomTemplate(room, 3, 'wald room', ENEMY_DEFINITIONS));

  it('hangs four or five, on the walls, in every wald room and for every seed tried', () => {
    expect(wald.length).toBeGreaterThan(0);
    for (const compiled of wald) {
      const room = compiled.geometry;
      for (let seed = 0; seed < 40; seed++) {
        const lanterns = wallLanternLayout(seed * 2654435761, room, compiled.doors);
        const where = `${compiled.source.id} seed ${String(seed)}`;
        expect(lanterns.length, where).toBeGreaterThanOrEqual(LANTERNS_PER_CELL);
        expect(lanterns.length, where).toBeLessThanOrEqual(LANTERNS_PER_CELL + 1);
        for (const lantern of lanterns) {
          const onWall =
            Math.abs(lantern.z - (room.minY + LANTERN_INSET)) < 1e-6 ||
            Math.abs(lantern.z - (room.maxY - LANTERN_INSET)) < 1e-6 ||
            Math.abs(lantern.x - (room.minX + LANTERN_INSET)) < 1e-6 ||
            Math.abs(lantern.x - (room.maxX - LANTERN_INSET)) < 1e-6;
          expect(onWall, where).toBe(true);
          for (const door of compiled.doors) {
            if (door.direction !== lantern.wall) {
              continue;
            }
            const centre = doorCentre(room, door);
            const along =
              door.direction === 'north' || door.direction === 'south'
                ? Math.abs(centre.x - lantern.x)
                : Math.abs(centre.y - lantern.z);
            expect(along, where).toBeGreaterThan((door.span ?? DOOR_SPAN) / 2);
          }
        }
      }
    }
  });

  it('hangs proportionally more in a bigger room, so it is no darker than a small one', () => {
    // A double-wide room and a four-cell one, doors aside.
    for (const [cellsX, cellsY] of [
      [2, 1],
      [2, 2],
    ] as const) {
      const room = new RoomGeometry(0, 0, WIDTH * cellsX, DEPTH * cellsY);
      for (let seed = 0; seed < 40; seed++) {
        const lanterns = wallLanternLayout(seed * 2654435761, room, []);
        const cells = cellsX * cellsY;
        const where = `${String(cellsX)}x${String(cellsY)} seed ${String(seed)}`;
        expect(lanterns.length, where).toBeGreaterThanOrEqual(
          Math.min(MAX_WALL_LANTERNS, cells * LANTERNS_PER_CELL - 1),
        );
        expect(lanterns.length, where).toBeLessThanOrEqual(MAX_WALL_LANTERNS);
      }
    }
  });

  it('hangs them in the same places for the same seed', () => {
    const compiled = wald[0];
    expect(compiled).toBeDefined();
    if (compiled === undefined) {
      return;
    }
    expect(wallLanternLayout(11, compiled.geometry, compiled.doors)).toEqual(
      wallLanternLayout(11, compiled.geometry, compiled.doors),
    );
  });

  it('uses every wall across seeds, the south one included', () => {
    const compiled = wald[0];
    if (compiled === undefined) {
      return;
    }
    const walls = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      for (const lantern of wallLanternLayout(seed, compiled.geometry, compiled.doors)) {
        walls.add(lantern.wall);
      }
    }
    expect([...walls].sort()).toEqual(['east', 'north', 'south', 'west']);
  });
});
