import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import { validateRoomTemplate } from '../../src/sim/room/template.js';
import { generateFloor, validateFloorPlan } from '../../src/sim/room/floor-plan.js';
import { Rng } from '../../src/sim/rng/rng.js';

/**
 * Floor 2 (#37) end to end: `tests/content/rooms.test.ts` already validates
 * every template in isolation, but a floor is generated from a *pool* of
 * them, and nothing else exercises `generateFloor` against Floor 2's own
 * `FloorConfig` (`floorTag: 'rural'`) the way a real run would.
 */
describe('Floor 2 (Dorf & Acker) generation', () => {
  const config = FLOOR_CONFIGS.find((entry) => entry.floor === 2);
  const templates = ROOM_TEMPLATES.map((room, index) =>
    validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
  );

  it('has a config', () => {
    expect(config).toBeDefined();
  });

  it('generates a valid floor plan from a spread of seeds', () => {
    if (config === undefined) throw new Error('missing Floor 2 config');
    for (let seed = 1; seed <= 20; seed++) {
      const plan = generateFloor(new Rng(seed), config, templates);
      expect(validateFloorPlan(plan, templates)).toEqual([]);
      expect(plan.rooms.length).toBeGreaterThanOrEqual(config.minRooms - 1);
    }
  });

  it("has more than one 'rural'-only room template to draw from", () => {
    // Not pinned to an exact count for the same reason
    // `tests/content/rooms.test.ts`'s own room-count assertion isn't: new
    // content should not have to touch this to keep passing. The real
    // assertion is "more than the bare minimum a shared cellar/rural
    // template alone would give the floor" — Floor 2 has its own roster
    // (Bauer, Kuh, Gockel, Gartenzwerg, Blaskapellist, Traktor) and its own
    // hazard (the hop trellis), and a room pool with nothing tagged `rural`
    // alone could never place any of them.
    const ruralOnly = templates.filter(
      (template) =>
        template.metadata.floorTags.includes('rural') &&
        !template.metadata.floorTags.includes('cellar'),
    );
    expect(ruralOnly.length).toBeGreaterThanOrEqual(10);
  });
});
