import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import {
  FLOOR_CONFIGS,
  HIGHEST_PLAYABLE_FLOOR,
  HIGHEST_SANDBOX_FLOOR,
} from '../../src/content/floors/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import { parseStartFloor } from '../../src/app/start-floor.js';
import { generateFloor, validateFloorPlan } from '../../src/sim/room/floor-plan.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { validateRoomTemplate } from '../../src/sim/room/template.js';

/**
 * `HIGHEST_SANDBOX_FLOOR`: the `?floor=N` sandbox may start on a floor that a
 * normal run cannot progress into yet — but never on one whose room pool
 * cannot actually generate, which would be a frozen game rather than an
 * unfinished one (`docs/DECISIONS.md` #19).
 */
const templates = ROOM_TEMPLATES.map((room, index) =>
  validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
);

describe('the sandbox floor gate', () => {
  it('never lags behind the floor a normal run can reach', () => {
    expect(HIGHEST_SANDBOX_FLOOR).toBeGreaterThanOrEqual(HIGHEST_PLAYABLE_FLOOR);
  });

  it('only covers floors whose room pool generates a valid floor', () => {
    for (let floor = 1; floor <= HIGHEST_SANDBOX_FLOOR; floor++) {
      const config = FLOOR_CONFIGS.find((candidate) => candidate.floor === floor);
      expect(config, `floor ${String(floor)}`).toBeDefined();
      if (config === undefined) {
        continue;
      }
      for (let seed = 0; seed < 10; seed++) {
        const plan = generateFloor(new Rng(seed * 31 + floor), config, templates);
        expect(
          validateFloorPlan(plan, templates),
          `floor ${String(floor)} seed ${String(seed)}`,
        ).toEqual([]);
      }
    }
  });

  it('lets ?floor=3 start on floor 3 while normal runs still stop at floor 2', () => {
    expect(parseStartFloor('?floor=3', true, HIGHEST_SANDBOX_FLOOR)).toEqual({
      floor: 3,
      requested: 3,
    });
    // Past the sandbox gate it still clamps rather than freezing.
    expect(parseStartFloor('?floor=7', true, HIGHEST_SANDBOX_FLOOR)?.floor).toBe(
      HIGHEST_SANDBOX_FLOOR,
    );
  });
});
