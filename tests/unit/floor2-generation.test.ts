import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import { validateRoomTemplate } from '../../src/sim/room/template.js';
import { generateFloor, validateFloorPlan } from '../../src/sim/room/floor-plan.js';
import { generateRoom, roomGenSeed } from '../../src/sim/room/generate-room.js';
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

  it('gives Floor 2 its own flavour through the room generator, not a rural template pool', () => {
    // Floor 2's own roster (Bauer, Kuh, Gockel, Gartenzwerg, Blaskapellist,
    // Traktor) and its hazard (the hop trellis) used to need a big pool of
    // `rural`-tagged templates. Since #random-rooms the generator supplies
    // both: an ordinary Floor 2 room is procedural.
    const ruralRoster = new Set([
      'gockel',
      'bierratte',
      'bauer',
      'gartenzwerg',
      'kuh',
      'blaskapellist',
      'boellerschmeisser',
      'traktor',
    ]);
    const seenEnemies = new Set<string>();
    let seenTrellis = false;
    for (let seed = 0; seed < 120; seed++) {
      const room = generateRoom({
        roomId: `r${String(seed)}`,
        floor: 2,
        floorTag: 'rural',
        doors: ['north', 'south'],
        distanceFromStart: 3,
        rng: new Rng(roomGenSeed(99, 2, `r${String(seed)}`, seed)),
      });
      for (const group of room.spawnGroups) {
        for (const choice of group.choices) {
          seenEnemies.add(choice.enemyId);
        }
      }
      if (room.hazards.some((hazard) => hazard.type === 'trellis')) {
        seenTrellis = true;
      }
    }
    for (const id of seenEnemies) {
      expect(ruralRoster.has(id)).toBe(true);
    }
    expect(seenEnemies.size).toBeGreaterThan(3);
    expect(seenTrellis).toBe(true);
  });
});
