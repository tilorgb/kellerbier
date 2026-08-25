import { circlesOverlap } from '../collision/circle-circle.js';
import { CollisionLayer } from '../collision/layers.js';
import type { GameSim } from '../game/sim.js';

/**
 * The player against pickups.
 *
 * One query does two jobs: a pickup inside the player's collider is queued
 * for collection, and a pickup inside the (larger) magnet radius but not yet
 * touching is nudged toward the player instead. Collection is still deferred
 * until after the broadphase query finishes — same reason `stepImpact`
 * collects hits before acting on them — but the magnet nudge acts
 * immediately: it only ever writes a position, never destroys anything, so
 * there is nothing about mutating mid-query that the query itself can
 * observe.
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

  const queryRadius = Math.max(radius, sim.tuning.pickup.magnetRadius);
  sim.broadphase.query(x, y, queryRadius, candidate);
  activeSim = null;

  const count = collectedState[COLLECTED_COUNT];
  for (let entry = 0; entry < count; entry++) {
    const other = collected[entry] ?? 0;
    // A priced pickup the player can't afford is left in place — not
    // collected, and not destroyed. Everything else is collected outright.
    if (collect(sim, other)) {
      sim.world.destroy(sim.world.entityAt(other));
    }
  }
}

/** Either queues a touching pickup for collection, or nudges a nearby one toward the player. */
function candidate(other: number): void {
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
  const playerX = player[PLAYER_X] ?? 0;
  const playerY = player[PLAYER_Y] ?? 0;
  const playerRadius = player[PLAYER_RADIUS] ?? 0;

  if (circlesOverlap(playerX, playerY, playerRadius, otherX, otherY, otherRadius)) {
    const count = collectedState[COLLECTED_COUNT] ?? 0;
    if (count < MAX_COLLECTED) {
      collected[count] = other;
      collectedState[COLLECTED_COUNT] = count + 1;
    }
    return;
  }

  const magnetRadius = sim.tuning.pickup.magnetRadius;
  const dx = playerX - otherX;
  const dy = playerY - otherY;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared <= 0 || distanceSquared > magnetRadius * magnetRadius) {
    return;
  }
  const distance = Math.sqrt(distanceSquared);
  const step = Math.min(sim.tuning.pickup.magnetSpeed, distance);
  const transform = sim.transform.data;
  transform[other * 4] = otherX + (dx / distance) * step;
  transform[other * 4 + 1] = otherY + (dy / distance) * step;
}

/**
 * Resolves what collecting one pickup does, by the kind it was spawned as.
 * Returns `false` — nothing applied, the entity survives — for a priced
 * pickup the player cannot yet afford; `true` otherwise.
 */
function collect(sim: GameSim, other: number): boolean {
  const definitionIndex = sim.pickupKind.data[other] ?? -1;
  if (definitionIndex < 0) {
    return true;
  }
  const priced = ((sim.world.masks[other] ?? 0) & sim.pickupPrice.bit) !== 0;
  if (priced && !sim.spendBiermarken(sim.pickupPrice.data[other] ?? 0)) {
    return false;
  }
  const definition = sim.pickups.at(definitionIndex);
  const effect = definition.effect;
  sim.reportCollected(definition.name, definition.description);

  switch (effect.kind) {
    case 'health':
      if (effect.pool === 'red') {
        sim.addPlayerHealth(effect.amount);
      } else if (effect.pool === 'soul') {
        sim.addSoulHealth(effect.amount);
      } else {
        sim.addEternalHealth(effect.amount);
      }
      break;
    case 'currency':
      sim.addBiermarken(effect.amount);
      break;
    case 'bombs':
      sim.addBombs(effect.amount);
      break;
    case 'keys':
      sim.addKeys(effect.amount);
      break;
    case 'food':
      // Inert in a sober run is true of every food pickup, by construction:
      // Promille sits at zero the whole run, so `lowerPromille` has nothing
      // to lower. No gate is needed here — see `GameSim.lowerPromille`.
      sim.addPlayerHealth(effect.heal);
      sim.lowerPromille(effect.promille);
      break;
    case 'promille':
      // Reads the live tunable rather than a value baked into content — see
      // the `promille` variant's doc comment in `sim/pickup/definition.ts`.
      sim.addPromille(sim.tuning.promille.beerAmount);
      sim.addPlayerHealth(effect.heal);
      break;
    case 'weisswurst':
      // *"Nach zwölfe nimmer."* One definition, one tint — the branch changes
      // what it does, never what it looks like.
      if (sim.currentFloor < effect.floorThreshold) {
        sim.addPlayerHealth(effect.healBelowFloor);
      } else {
        sim.applyPlayerDamage(effect.damageAtOrAbove);
      }
      break;
  }
  return true;
}
