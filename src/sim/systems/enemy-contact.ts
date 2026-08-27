import { World } from '../ecs/world.js';
import type { GameSim } from '../game/sim.js';

/**
 * Enemies against each other.
 *
 * `contact.ts` already separates the player from a body they overlap; this is
 * the same idea between two enemies, which otherwise stand on top of each
 * other freely — most visibly the instant a boss splits (`splitFromEvent`,
 * `systems/enemy.ts`), where the children spawn in a ring around the death
 * point but nothing has ever stopped them drifting back onto one another
 * since. Separation is shared out by mass, same as the player's own: a Mini
 * gets shouldered out of a Mid's way, not the other way round.
 *
 * Deliberately not `contact.ts`'s own `moveClear` (a wall-aware move with a
 * corner-slide fallback and a "whatever a wall refuses, the other body owes
 * instead" redistribution) — that shape is worth it for the player, who has
 * to feel exactly right against a wall of enemies, but between two enemies
 * it is a lot of extra cross-function-call arithmetic to spend on a body
 * nobody is looking that closely at. A blocked half-step here just tries
 * again next tick, the same pair still being overlapped — which it will be,
 * since nothing here removed the reason they overlapped in the first place.
 *
 * Deliberately not the broadphase either, unlike everything else in
 * `systems/`. `sim.broadphase.query` earns its keep against a population it
 * was built for — thousands of projectiles against hundreds of enemies,
 * where a pairwise sweep really would be a million tests. Called once per
 * enemy instead of once per tick (up to 200 times, at the frame-time
 * benchmark's stress population), it stopped being a broadphase and became
 * 200 extra crossings of a call boundary V8 does not inline, each one
 * boxing the doubles handed across it — the same "boxing a double at an
 * un-inlined call boundary" cost `contact.ts` and the frame-time benchmark's
 * own doc comments already call out as a residual, accepted-once-a-tick
 * cost. Multiplied by a couple hundred it stopped being residual.
 *
 * A direct double loop over `world.highWater`/`world.masks` — the same
 * "hand-written system loop" shape `bodies.ts`, `enemy.ts` and `collision.ts`
 * already use — has no such boundary to cross: at the benchmark's own
 * population that is at most ~20,000 pure-arithmetic pair checks, entirely
 * inside one function, against 4ms of budget. `sim.room.isClear` is still
 * called through, same as `contact.ts`, but only for a pair that is actually
 * overlapping — rare against a real room even at this population — not for
 * every candidate the way the broadphase call was.
 *
 * Runs after `stepContacts`; nothing between them moves anything, so reading
 * `transform` fresh here still sees this tick's positions.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

export function stepEnemyContacts(sim: GameSim): void {
  const world = sim.world;
  const states = world.states;
  const masks = world.masks;
  const mask = sim.enemyMask;
  const highWater = world.highWater;
  const body = sim.body.data;
  const transform = sim.transform.data;

  for (let index = 0; index < highWater; index++) {
    if (states[index] !== World.ALIVE) {
      continue;
    }
    if (((masks[index] ?? 0) & mask) !== mask) {
      continue;
    }

    const base = index * 4;
    let x = transform[base] ?? 0;
    let y = transform[base + 1] ?? 0;
    const radius = body[index * 2] ?? 0;
    const mass = Math.max(0.01, body[index * 2 + 1] ?? 1);

    for (let other = index + 1; other < highWater; other++) {
      if (states[other] !== World.ALIVE) {
        continue;
      }
      if (((masks[other] ?? 0) & mask) !== mask) {
        continue;
      }

      const otherBase = other * 4;
      const otherX = transform[otherBase] ?? 0;
      const otherY = transform[otherBase + 1] ?? 0;
      const otherRadius = body[other * 2] ?? 0;

      const deltaX = x - otherX;
      const deltaY = y - otherY;
      const reach = radius + otherRadius;
      // Squared, so the overlap test itself never calls into `Math.sqrt` —
      // only an actual overlap, rare across a real room even at 200 enemies,
      // pays for one.
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (distanceSquared >= reach * reach) {
        continue;
      }

      const distance = Math.sqrt(distanceSquared);
      let awayX: number;
      let awayY: number;
      if (distance === 0) {
        // Exactly concentric — the fresh-split case. Any direction will do; a
        // fixed one keeps this deterministic.
        awayX = 1;
        awayY = 0;
      } else {
        awayX = deltaX / distance;
        awayY = deltaY / distance;
      }
      const overlap = reach - distance;

      // Split by mass: the lighter body gives way, same as the player's own.
      const otherMass = Math.max(0.01, body[other * 2 + 1] ?? 1);
      const share = otherMass / (mass + otherMass);

      const wantedX = x + awayX * overlap * share;
      const wantedY = y + awayY * overlap * share;
      if (sim.room.isClear(wantedX, wantedY, radius)) {
        transform[base] = wantedX;
        transform[base + 1] = wantedY;
        x = wantedX;
        y = wantedY;
      }

      const otherShare = 1 - share;
      const otherWantedX = otherX - awayX * overlap * otherShare;
      const otherWantedY = otherY - awayY * overlap * otherShare;
      if (sim.room.isClear(otherWantedX, otherWantedY, otherRadius)) {
        transform[otherBase] = otherWantedX;
        transform[otherBase + 1] = otherWantedY;
      }
    }
  }
}
