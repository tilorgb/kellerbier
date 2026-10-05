import { circlesOverlap } from '../collision/circle-circle.js';
import { CollisionLayer } from '../collision/layers.js';
import type { GameSim } from '../game/sim.js';
import { ParticleKind } from '../particle/store.js';
import { NO_SLOT } from '../pool/slot-pool.js';
import { applyPoison } from '../systems/status-effects.js';
import { CLOUD_CAPACITY, CloudTeam, type CloudTeamId } from './cloud-store.js';

/**
 * Poison clouds (#401): a lingering circle that poisons whoever stands in it.
 *
 * Each tick a cloud ages, and any body inside its *current* radius on the
 * opposing team has poison refreshed — the same `Math.max` refresh a shot
 * does (`applyPoison`), never a stack, so standing in a cloud for ten seconds
 * is no worse than three. The radius grows 0 → full over `growTicks`, so a
 * cloud a Zecke or Fliegenpilz just emitted can be read — and stepped out of —
 * as it opens rather than appearing at full size under the player's feet.
 *
 * **Team rule: an enemy's cloud poisons only the player**, never other
 * enemies. A room of poisoners that thinned one another out would be both
 * unreadable and self-defeating; the player's own clouds (none authored yet)
 * would likewise touch only enemies.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

let activeSim: GameSim | null = null;

/** Spawns a cloud that poisons the player. The entry point `emitCloud` and any other primitive share. */
export function spawnPoisonCloud(
  sim: GameSim,
  x: number,
  y: number,
  radius: number,
  growTicks: number,
  lifetimeTicks: number,
  team: CloudTeamId = CloudTeam.Enemy,
): number {
  const clouds = sim.clouds;
  // `maxActive` can lower the ceiling but never lift it past the store; past
  // it the oldest cloud is recycled (`docs/DECISIONS.md` #4).
  const limit = Math.min(CLOUD_CAPACITY, Math.max(1, Math.round(sim.tuning.poisonCloud.maxActive)));
  while (clouds.count >= limit && clouds.oldest !== NO_SLOT) {
    clouds.despawn(clouds.oldest);
  }
  return clouds.spawn(
    x,
    y,
    radius,
    Math.max(0, Math.round(growTicks)),
    Math.max(1, Math.round(lifetimeTicks)),
    team,
  );
}

export function stepClouds(sim: GameSim): void {
  const clouds = sim.clouds;
  if (clouds.count === 0) {
    return;
  }
  activeSim = sim;
  clouds.forEachLive(stepCloud);
  activeSim = null;
}

function stepCloud(index: number): void {
  const sim = activeSim;
  if (sim === null) {
    return;
  }
  const clouds = sim.clouds;
  const age = (clouds.age[index] ?? 0) + 1;
  if (age >= (clouds.lifetimeTicks[index] ?? 0)) {
    clouds.despawn(index);
    return;
  }
  clouds.age[index] = age;

  const x = clouds.x[index] ?? 0;
  const y = clouds.y[index] ?? 0;
  const radius = clouds.currentRadius(index);
  if (radius <= 0) {
    return;
  }
  emitCloudParticles(sim, index, x, y, radius, age);

  if ((clouds.team[index] ?? CloudTeam.Enemy) === CloudTeam.Enemy) {
    const player = sim.playerIndex;
    if (
      !sim.playerDead &&
      circlesOverlap(
        sim.positionX(player),
        sim.positionY(player),
        sim.body.data[player * 2] ?? 0,
        x,
        y,
        radius,
      )
    ) {
      applyPoison(sim, player);
    }
    return;
  }
  circle[CIRCLE_X] = x;
  circle[CIRCLE_Y] = y;
  circle[CIRCLE_RADIUS] = radius;
  sim.broadphase.query(x, y, radius, poisonEnemy);
}

const GOLDEN_ANGLE = 2.399963229728653;
/** Edge motes per tick: with `EDGE_LIFE_TICKS` of life they overlap into a dotted ring the player can read the limit of. */
const EDGE_MOTES = 3;
const EDGE_LIFE_TICKS = 10;
const BODY_LIFE_TICKS = 26;
const MOTE_SIZE = 3;

/**
 * The cloud's look: a handful of drifting Miasma motes through its body and a
 * ring of still ones on its current edge (#401). Particles rather than a
 * sprite because world sprites are hard-edged cutouts (`docs/DECISIONS.md`
 * #74) and a cloud should not be; the *edge* ring is what says where it
 * ends. Positions come from the golden angle of the cloud's age and slot —
 * no RNG, so a replay's particles match and the cloud costs the sim nothing
 * to stay deterministic. Miasma is neither a decorative nor a flashing kind
 * (`render/particles.ts`), so no accessibility setting hides the edge.
 */
function emitCloudParticles(
  sim: GameSim,
  index: number,
  x: number,
  y: number,
  radius: number,
  age: number,
): void {
  const seed = age * EDGE_MOTES + index * 7;
  for (let mote = 0; mote < EDGE_MOTES; mote++) {
    const angle = (seed + mote) * GOLDEN_ANGLE;
    sim.particles.spawn(
      x + Math.cos(angle) * radius,
      y + Math.sin(angle) * radius,
      0,
      0,
      EDGE_LIFE_TICKS,
      MOTE_SIZE,
      ParticleKind.Miasma,
    );
  }
  const angle = seed * GOLDEN_ANGLE * 1.7;
  const reach = radius * Math.sqrt(((seed * 0.618) % 1) + 0.0001);
  sim.particles.spawn(
    x + Math.cos(angle) * reach,
    y + Math.sin(angle) * reach,
    Math.cos(angle) * 0.05,
    Math.sin(angle) * 0.05,
    BODY_LIFE_TICKS,
    MOTE_SIZE * 1.5,
    ParticleKind.Miasma,
  );
}

/** The cloud being stepped, as typed scratch rather than module `let`s (`no-hot-allocation`). */
const CIRCLE_X = 0;
const CIRCLE_Y = 1;
const CIRCLE_RADIUS = 2;
const circle = new Float64Array(3);

/** A player-team cloud's victims: anything on the enemy/obstacle layers inside the circle. */
function poisonEnemy(other: number): void {
  const sim = activeSim;
  if (sim === null || other === sim.playerIndex) {
    return;
  }
  const layer = sim.collision.data[other * 2] ?? 0;
  if ((layer & (CollisionLayer.Enemy | CollisionLayer.Obstacle)) === 0) {
    return;
  }
  if (
    circlesOverlap(
      sim.positionX(other),
      sim.positionY(other),
      sim.body.data[other * 2] ?? 0,
      circle[CIRCLE_X] ?? 0,
      circle[CIRCLE_Y] ?? 0,
      circle[CIRCLE_RADIUS] ?? 0,
    )
  ) {
    applyPoison(sim, other);
  }
}
