import { describe, expect, it } from 'vitest';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';
import { generateFloor } from '../../src/sim/room/floor-plan.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { ROOM_TEMPLATE_POOL, pathToBoss } from '../playtest/lib/floor-runtime.js';

/**
 * The scripted bot's route (#54's harness), now that a floor has a mini-boss
 * room off the path to its boss (#274).
 *
 * `tests/playtest/` itself is a nightly sweep (`npm run playtest`) — this is
 * the cheap part of it that belongs on every pull request: the routing is
 * pure graph work, and #275 turns the detour it does here from optional into
 * the only way a run finishes. A bot that could not walk it would fail that
 * issue as a harness bug dressed up as a broken lock.
 */
describe('playtest routing through the mini-boss room (#274)', () => {
  const playableFloors = FLOOR_CONFIGS.filter((config) => config.floor <= 2);

  for (const config of playableFloors) {
    it(`walks floor ${String(config.floor)}'s mini-boss room and still reaches the boss`, () => {
      for (let seed = 0; seed < 60; seed++) {
        const plan = generateFloor(new Rng(seed + 5100), config, ROOM_TEMPLATE_POOL);
        const context = `floor ${String(config.floor)}, seed ${String(seed)}`;
        expect(plan.minibossRoomIds.length, context).toBeGreaterThan(0);

        // The bot's own loop: walk the path it is handed, drop each mini-boss
        // room off the waypoint list as it arrives, ask again.
        let current = plan.startRoomId;
        let pending = plan.minibossRoomIds.filter((id) => id !== current);
        const walked = new Set<string>([current]);
        for (let step = 0; step < 200 && current !== plan.bossRoomId; step++) {
          const path = pathToBoss(plan, current, pending);
          expect(path, `${context}: no route from ${current}`).not.toBeNull();
          const next = path?.[1] ?? path?.[0];
          expect(next, `${context}: route from ${current} went nowhere`).toBeDefined();
          current = next ?? current;
          pending = pending.filter((id) => id !== current);
          walked.add(current);
        }

        expect(current, `${context}: never reached the boss room`).toBe(plan.bossRoomId);
        for (const id of plan.minibossRoomIds) {
          expect(walked.has(id), `${context}: never walked mini-boss room ${id}`).toBe(true);
        }
      }
    });
  }

  it('still reaches the boss when it is handed no waypoints at all', () => {
    // The shape every caller had before this issue, and the shape a floor
    // with no mini-boss content (floors 3-7) still has.
    const config = FLOOR_CONFIGS[0];
    if (config === undefined) throw new Error('no floor 1 config');
    for (let seed = 0; seed < 40; seed++) {
      const plan = generateFloor(new Rng(seed + 5100), config, ROOM_TEMPLATE_POOL);
      const path = pathToBoss(plan, plan.startRoomId);
      expect(path?.at(-1), `seed ${String(seed)}`).toBe(plan.bossRoomId);
    }
  });
});
