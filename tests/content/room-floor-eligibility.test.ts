import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import type { RoomShape } from '../../src/content/rooms/definition.js';
import { compileRoomTemplate, validateRoomTemplate } from '../../src/sim/room/template.js';

/**
 * A placement with the right cell *count* for each shape, real footprints
 * for the two that have voids (`sim/room/floor-plan.ts`'s own
 * `shapeFootprints`, not reused here since it isn't exported) — not because
 * this test cares about void geometry, but because a wrong count throws for
 * an unrelated reason before ever reaching the check this test is actually
 * about.
 */
const PLACEMENT_BY_SHAPE: Readonly<Record<RoomShape, { cells: { col: number; row: number }[] }>> = {
  '1x1': { cells: [{ col: 0, row: 0 }] },
  '1x2': {
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ],
  },
  '2x2': {
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ],
  },
  L: {
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
    ],
  },
  T: {
    cells: [
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 1, row: 2 },
    ],
  },
};

/**
 * A room template shared across floors (#37: every Floor 1 template is also
 * tagged `rural`) has to actually work on every floor it claims — a
 * `spawnGroups` choice authored `maxFloor: 1` "because only Floor 1 existed
 * yet" quietly breaks the moment a second floor starts drawing from the same
 * template. This is exactly what happened to `cellar-boss.json`'s boss
 * choice once Floor 2 became reachable in `npm run dev` (#37's follow-up):
 * `compileRoomTemplate` throws mid-transition, which — uncaught, inside the
 * door-transition code `app/main.ts`'s `enterNeighbor` runs — reads as the
 * game freezing rather than as an error, since nothing catches it before it
 * stops the frame loop.
 */
describe('every room template compiles on every floor it is tagged for', () => {
  const templates = ROOM_TEMPLATES.map((room, index) =>
    validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
  );

  it('has at least one multi-floor-tagged template to actually exercise this', () => {
    const multiTagged = templates.filter((template) => template.metadata.floorTags.length > 1);
    expect(multiTagged.length).toBeGreaterThan(0);
  });

  for (const template of templates) {
    for (const floorTag of template.metadata.floorTags) {
      const config = FLOOR_CONFIGS.find((candidate) => candidate.floorTag === floorTag);
      if (config === undefined) {
        continue;
      }
      it(`"${template.id}" on floor ${String(config.floor)} (tag "${floorTag}")`, () => {
        const placement = PLACEMENT_BY_SHAPE[template.metadata.shape];
        expect(() =>
          compileRoomTemplate(template, config.floor, template.id, ENEMY_DEFINITIONS, placement),
        ).not.toThrow();
      });
    }
  }
});
