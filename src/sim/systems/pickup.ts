import { circlesOverlap } from '../collision/circle-circle.js';
import { CollisionLayer } from '../collision/layers.js';
import type { GameSim } from '../game/sim.js';

/**
 * The player against pickups.
 *
 * A single kind exists today — the beer pickup (#17) — so this is
 * deliberately minimal: find what overlaps, raise Promille, remove it. The
 * real pickup system (loot tables, multiple kinds, UI) is #22; this only has
 * to not be in that system's way later.
 *
 * Collection is deferred until after the broadphase query finishes, the same
 * reason `stepImpact` collects hits before acting on them — destroying an
 * entity mid-query would mutate the world the query is still walking.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** Same reasoning as `contact.ts`'s `PLAYER_SLOTS`: typed scratch, not a closure capture. */
const PLAYER_X = 0;
const PLAYER_Y = 1;
const PLAYER_RADIUS = 2;
const PLAYER_SLOTS = 3;
const player = new Float64Array(PLAYER_SLOTS);

/** Generous cap on pickups touched in one tick. */
const MAX_COLLECTED = 16;
const collected = new Int32Array(MAX_COLLECTED);
/** How many of `collected` are in use — a typed slot, not a module `let`, same reason as `impact.ts`'s `collected` counter. */
const COLLECTED_COUNT = 0;
const collectedState = new Int32Array(1);

let activeSim: GameSim | null = null;

export function stepPickups(sim: GameSim): void {
  const index = sim.playerIndex;
  const x = sim.positionX(index);
  const y = sim.positionY(index);
  const radius = sim.body.data[index * 2] ?? 0;

  activeSim = sim;
  collectedState[COLLECTED_COUNT] = 0;
  player[PLAYER_X] = x;
  player[PLAYER_Y] = y;
  player[PLAYER_RADIUS] = radius;

  sim.broadphase.query(x, y, radius, collect);
  activeSim = null;

  const count = collectedState[COLLECTED_COUNT];
  for (let entry = 0; entry < count; entry++) {
    const other = collected[entry] ?? 0;
    sim.addPromille(sim.tuning.promille.beerAmount);
    sim.world.destroy(sim.world.entityAt(other));
  }
}

function collect(other: number): void {
  const sim = activeSim;
  if (sim === null) {
    return;
  }
  const layer = sim.collision.data[other * 2] ?? 0;
  if ((layer & CollisionLayer.Pickup) === 0) {
    return;
  }
  const otherRadius = sim.body.data[other * 2] ?? 0;
  const otherX = sim.positionX(other);
  const otherY = sim.positionY(other);
  if (
    !circlesOverlap(
      player[PLAYER_X] ?? 0,
      player[PLAYER_Y] ?? 0,
      player[PLAYER_RADIUS] ?? 0,
      otherX,
      otherY,
      otherRadius,
    )
  ) {
    return;
  }
  const count = collectedState[COLLECTED_COUNT] ?? 0;
  if (count < MAX_COLLECTED) {
    collected[count] = other;
    collectedState[COLLECTED_COUNT] = count + 1;
  }
}
