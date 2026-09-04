import { circlesOverlap } from '../collision/circle-circle.js';
import { CollisionLayer } from '../collision/layers.js';
import type { GameSim } from '../game/sim.js';
import { pickupGlint } from '../particle/effects.js';
import { pickupDescriptionFor } from '../pickup/definition.js';
import { dispatchItemBeerPickup } from './items.js';

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

/** The priced pickup found touching the player this tick, or -1. A typed slot for the same reason `collectedState` is one. */
const SHOP_TOUCH_SLOT = 0;
const shopTouchState = new Int32Array(1);

let activeSim: GameSim | null = null;

export function stepPickups(sim: GameSim): void {
  const index = sim.playerIndex;
  const x = sim.positionX(index);
  const y = sim.positionY(index);
  const radius = sim.body.data[index * 2] ?? 0;

  activeSim = sim;
  collectedState[COLLECTED_COUNT] = 0;
  shopTouchState[SHOP_TOUCH_SLOT] = -1;
  player[PLAYER_X] = x;
  player[PLAYER_Y] = y;
  player[PLAYER_RADIUS] = radius;

  const queryRadius = Math.max(radius, sim.tuning.pickup.magnetRadius);
  sim.broadphase.query(x, y, queryRadius, candidate);
  activeSim = null;

  const count = collectedState[COLLECTED_COUNT];
  for (let entry = 0; entry < count; entry++) {
    const other = collected[entry] ?? 0;
    if (collect(sim, other)) {
      sim.world.destroy(sim.world.entityAt(other));
    }
  }
  sim.setNearbyShopPickup(shopTouchState[SHOP_TOUCH_SLOT]);
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
    // A priced pickup is a shop's stock, not a free pickup: touching it only
    // surfaces what it is (`GameSim.shopPreview`) and lets the Use button buy
    // it (`attemptShopPurchase`, from `sim/systems/pedestal.ts`) — it is
    // never collected by walking over it.
    const priced = ((sim.world.masks[other] ?? 0) & sim.pickupPrice.bit) !== 0;
    if (priced) {
      shopTouchState[SHOP_TOUCH_SLOT] = other;
      return;
    }
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
 * pickup the player cannot afford; `true` otherwise. Reached two ways: an
 * ordinary pickup collected on touch (`stepPickups`, below), or a priced one
 * bought on purpose (`attemptShopPurchase`).
 */
function collect(sim: GameSim, other: number): boolean {
  const definitionIndex = sim.pickupKind.data[other] ?? -1;
  if (definitionIndex < 0) {
    return true;
  }
  const definition = sim.pickups.at(definitionIndex);
  const effect = definition.effect;
  // A full pool refuses its Wurst outright — no heal, no Promille change.
  // Checked before the price is paid below, not after: a shop selling a
  // full-pool Wurst would otherwise take Biermarken for something the player
  // then can't use.
  if (effect.kind === 'food' && sim.healthPoolFull(effect.pool)) {
    sim.reportCollected(definition.name, 'Is scho voll — bleibt liegn.');
    return false;
  }
  const priced = ((sim.world.masks[other] ?? 0) & sim.pickupPrice.bit) !== 0;
  if (priced && !sim.spendBiermarken(sim.pickupPrice.data[other] ?? 0)) {
    return false;
  }
  sim.reportCollected(definition.name, pickupDescriptionFor(definition, sim.promilleUnlocked));

  switch (effect.kind) {
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
      // Inert in a sober run is true of every Wurst pickup, by construction:
      // Promille sits at zero the whole run, so `lowerPromille` has nothing
      // to lower, and Kater is never running to clear. No gate is needed
      // here — see `GameSim.lowerPromille`.
      if (effect.pool === 'red') {
        sim.addPlayerHealth(effect.heal);
      } else if (effect.pool === 'soul') {
        sim.addSoulHealth(effect.heal);
      } else {
        sim.addEternalHealth(effect.heal);
      }
      sim.lowerPromille(effect.promille);
      sim.clearKater();
      break;
    case 'promille': {
      // Reads the live tunable rather than a value baked into content — see
      // the `promille` variant's doc comment in `sim/pickup/definition.ts`.
      // Maß no longer heals at all — that is Wurst's job now.
      const amount =
        effect.size === 'full'
          ? sim.tuning.promille.massFullAmount
          : sim.tuning.promille.massHalfAmount;
      sim.addPromille(amount);
      // A Maß never clears Kater on its own (that is `food`'s job, above) —
      // Konterbier (#32) is what makes drinking through a hangover work, so
      // every held item gets a look at this exact event rather than the
      // engine special-casing one item's id here.
      dispatchItemBeerPickup(sim);
      break;
    }
  }
  // A collected pickup already vanishes, so this is decoration on top of
  // something the player can already see (#153) — which is exactly the bar an
  // effect has to clear before it may be switched off by a toggle.
  pickupGlint(sim, sim.positionX(other), sim.positionY(other));
  return true;
}

/**
 * Buys the priced pickup the player is currently touching (`sim.nearbyShopPickup`),
 * on the Use button — called from `sim/systems/pedestal.ts`'s Use-button
 * priority chain, the one place that resolves what `Use` does this tick.
 * A no-op with nothing touching, and (via `collect`'s own check) a no-op the
 * player can't afford: either way the pickup stays put for another look.
 */
export function attemptShopPurchase(sim: GameSim): void {
  const slot = sim.nearbyShopPickup;
  if (slot < 0) {
    return;
  }
  if (collect(sim, slot)) {
    sim.world.destroy(sim.world.entityAt(slot));
    sim.setNearbyShopPickup(-1);
  }
}
