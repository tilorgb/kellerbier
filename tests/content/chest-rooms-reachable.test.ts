import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import type { RoomTemplate } from '../../src/content/rooms/definition.js';
import { generateFloor } from '../../src/sim/room/floor-plan.js';
import { validateRoomTemplate } from '../../src/sim/room/template.js';
import { Rng } from '../../src/sim/rng/rng.js';

/**
 * "Reachable" through the real progression (`CLAUDE.md`), not just loadable:
 * every room #353 added — each secret and supersecret layout, and the two
 * walled-off chest rooms — is actually drawn by the floor generator on the
 * floors it is tagged for, across a sweep of seeds.
 */
const TEMPLATES: readonly RoomTemplate[] = ROOM_TEMPLATES.map((room, index) =>
  validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
);

const CHEST_ROOMS: readonly (readonly [string, number])[] = [
  ['cellar-secret', 1],
  ['cellar-secret-stash', 1],
  ['cellar-secret-junk', 1],
  ['cellar-secret-vault', 1],
  ['cellar-supersecret', 1],
  ['cellar-supersecret-hoard', 1],
  ['cellar-supersecret-treasury', 1],
  ['cellar-supersecret-relic', 1],
  ['cellar-chest-alcove', 1],
  ['dorf-chest-alcove', 2],
];

describe('chest rooms are reached by the floor generator (#353)', () => {
  const seen = new Map<number, Set<string>>();
  for (const floor of [1, 2]) {
    const config = FLOOR_CONFIGS[floor - 1];
    if (config === undefined) {
      throw new Error(`no floor config for floor ${String(floor)}`);
    }
    const ids = new Set<string>();
    for (let seed = 1; seed <= 150; seed++) {
      const plan = generateFloor(new Rng(seed), config, TEMPLATES);
      for (const room of plan.rooms) {
        ids.add(room.templateId);
      }
    }
    seen.set(floor, ids);
  }

  it.each(CHEST_ROOMS)('%s is drawn on floor %i', (id, floor) => {
    expect(seen.get(floor)?.has(id)).toBe(true);
  });
});
