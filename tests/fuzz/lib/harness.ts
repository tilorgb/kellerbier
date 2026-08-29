import type { Entity } from '../../../src/sim/ecs/entity.js';
import type { ItemDefinition } from '../../../src/sim/item/definition.js';
import { GameSim } from '../../../src/sim/game/sim.js';
import {
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../../src/sim/input/frame.js';
import { STAT_IDS } from '../../../src/sim/stats/definition.js';
import { TICKS_PER_SECOND } from '../../../src/sim/time.js';

/**
 * #30's synergy fuzz harness: one combination in, one verdict out.
 *
 * A combination is granted to a fresh `GameSim` seeded and populated the same
 * way `tests/content/items.test.ts`'s held-together smoke test already
 * proved out for #29's whole roster — `population: 'enemies'` (the game's
 * own scripted roster, on respawning posts, per `GameSim.spawnEnemyRoom`),
 * aimed at whatever enemy is actually nearest (see `nearestEnemyAngle` for
 * why that, and not a sweep, is what "simulates combat" has to mean), a
 * Bierfassl dropped periodically, and every held active item polled — then
 * stepped for a fixed number of ticks while watching the four things
 * #26/#27's own acceptance criteria and this issue both name: an exception,
 * a non-finite stat or projectile field, the projectile pool overflowing,
 * and combat that stops producing damage (a softlock). Frame time is
 * measured too, because a combination that makes one tick pathologically
 * slow is the shape a synergy-triggered infinite (or merely enormous) loop
 * takes in a harness that cannot otherwise tell "slow" from "hung."
 *
 * Damage and kills are tallied off each tracked enemy's own health, not off
 * `sim.events` — `applyDamageAt` (`sim/systems/impact.ts`) only ever pushes
 * an `EventKind.Damage` event for a hit that lands on the *player*; a hit on
 * anything else changes `sim.health` directly and fires the item `onHit`
 * hook, with no event at all. Reading the event queue for enemy damage is
 * how an earlier version of this harness measured a DPS of exactly zero on
 * every one of 10,000 real combinations, including builds holding every
 * damage item in the roster — see the pull request body. `runFuzzCombination`
 * instead snapshots every enemy's health immediately before each `sim.step`
 * and compares it against the same entity immediately after: a drop is
 * damage dealt, and an entity that stopped being alive at all had whatever
 * health it still had taken from it.
 *
 * One `GameSim` per combination, deliberately — unlike
 * `tests/fuzz/heavy/projectile-tags.test.ts`'s 4,096 masks sharing one sim,
 * a combination here changes the inventory (and therefore the stat
 * pipeline's registered sources), and re-deriving "exactly the prior state"
 * for an arbitrary held-item set on removal is the harder problem #26
 * already solved by never asking `ItemInventory` to do it out of order. A
 * fresh sim is small — see the low capacities below — so this is cheap
 * enough that #30's "10,000 in under 5 minutes" holds; see
 * `tests/fuzz/heavy/synergy.test.ts`.
 */

export interface FuzzCombination {
  readonly seed: number;
  readonly itemIds: readonly string[];
}

export interface FuzzOutcome {
  readonly seed: number;
  /** What the combination asked to grant. */
  readonly itemIds: readonly string[];
  /**
   * What was actually held after granting — Reinheitsgebot 1516 strips
   * every already-held `impure` item the moment it is picked up (see
   * `tests/content/items.test.ts`), so this can be a strict subset of
   * `itemIds`. DPS and kills are about this set, not the requested one.
   */
  readonly heldItemIds: readonly string[];
  readonly ticksRequested: number;
  /** Short of `ticksRequested` only when a crash or non-finite value cut the run short. */
  readonly ticksCompleted: number;
  readonly crashed: boolean;
  /** The tick a crash happened on, or `undefined` for a crash while granting items. */
  readonly crashTick: number | undefined;
  readonly errorMessage: string | undefined;
  readonly nonFinite: boolean;
  readonly nonFiniteDetail: string | undefined;
  /** `ProjectileStore.overflows` — a spawn that had to recycle a live shot early. */
  readonly projectileOverflow: boolean;
  readonly softlocked: boolean;
  readonly softlockTick: number | undefined;
  readonly maxTickMs: number;
  readonly meanTickMs: number;
  readonly frameBudgetViolation: boolean;
  /** Total damage dealt to enemies, tallied off their own health — see the module doc comment. */
  readonly damageDealt: number;
  readonly kills: number;
  /** `damageDealt` per second of ticks actually completed. */
  readonly dps: number;
}

export interface FuzzOptions {
  /** Defaults to `DEFAULT_TICKS`. */
  readonly ticks?: number;
  /** Consecutive ticks with no damage dealt and no kill before a run is called softlocked. */
  readonly softlockWindowTicks?: number;
  /** A single tick's wall time above this flags `frameBudgetViolation`. */
  readonly frameBudgetMs?: number;
  /** The roster a combination's item ids are drawn from and the sim is built with. */
  readonly items: readonly ItemDefinition[];
}

/**
 * Four seconds of combat. Long enough for a stacking passive to compound, a
 * respawn cycle (`TARGET_RESPAWN_TICKS`, 150 ticks) to run twice, and an
 * active item with a short charge time to fire more than once — short
 * enough that 10,000 of them fit in the harness's own time budget.
 */
const DEFAULT_TICKS = 240;

/**
 * Three seconds of dealing no damage and landing no kill while combat is
 * otherwise running. Comfortably past one respawn cycle, so "the post just
 * hasn't respawned yet" is never mistaken for a softlock.
 */
const DEFAULT_SOFTLOCK_WINDOW_TICKS = 180;

/**
 * `docs/TECH_STACK.md` §3's simulation-tick budget, at 5,000 projectiles and
 * 200 enemies. This scene never gets close to that population, so a tick
 * that spends the whole budget anyway is a combination doing far more work
 * than six enemies and a handful of shots should ever cost — the shape a
 * synergy-triggered O(n²) or runaway retry takes.
 */
const DEFAULT_FRAME_BUDGET_MS = 4;

/** Small: the fuzz scene is six enemies and whatever a handful of items fire, never the stress scene's population. */
const CAPACITY = 1024;
const PROJECTILE_CAPACITY = 512;
const PARTICLE_CAPACITY = 256;

function aimingInput(angleRadians: number): ReturnType<typeof createInputFrame> {
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(Math.cos(angleRadians));
  frame.aimY = quantiseAxis(Math.sin(angleRadians));
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

/**
 * The direction from the player to the nearest live enemy, or `fallbackAngle`
 * when none is up (the gap between a kill and its post's respawn).
 *
 * A blind sweeping aim was tried first and discarded — see the pull request
 * body. The default shot lifetime (`shotLifetimeTicks`, 30 ticks) caps a
 * shot's range at roughly 105 px, most of `spawnEnemyRoom`'s roster spawns
 * farther than that from the player's fixed starting position, and a sweep
 * that changes direction every tick only fires roughly once every
 * `fireDelayTicks` (20) — nine or so shots across 180 ticks, aimed wherever
 * the sweep happened to point. Measured against real content that combination
 * produced a **DPS of exactly zero on every one of 10,000 combinations**,
 * including builds carrying every damage item in the roster: not a rare
 * build being weak, the harness never actually landing a hit. Aiming at
 * whatever is actually closest is what "simulates combat" (the issue's own
 * words) has to mean for the DPS number that comes out of it to mean
 * anything.
 */
function nearestEnemyAngle(sim: GameSim, fallbackAngle: number): number {
  const playerX = sim.positionX(sim.playerIndex);
  const playerY = sim.positionY(sim.playerIndex);
  // Object-wrapped rather than three `let`s — see the property-vs-`let`
  // narrowing note further down for why a `let` mutated only inside
  // `World.forEach`'s callback cannot be trusted after the call returns.
  const nearest = { dx: 0, dy: 0, distanceSquared: Number.POSITIVE_INFINITY, found: false };
  sim.world.forEach(sim.enemyMask, (index) => {
    const dx = sim.positionX(index) - playerX;
    const dy = sim.positionY(index) - playerY;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < nearest.distanceSquared) {
      nearest.dx = dx;
      nearest.dy = dy;
      nearest.distanceSquared = distanceSquared;
      nearest.found = true;
    }
  });
  return nearest.found ? Math.atan2(nearest.dy, nearest.dx) : fallbackAngle;
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs one combination to completion (or failure) and reports what happened. */
export function runFuzzCombination(
  combination: FuzzCombination,
  options: FuzzOptions,
): FuzzOutcome {
  const ticksRequested = options.ticks ?? DEFAULT_TICKS;
  const softlockWindow = options.softlockWindowTicks ?? DEFAULT_SOFTLOCK_WINDOW_TICKS;
  const frameBudgetMs = options.frameBudgetMs ?? DEFAULT_FRAME_BUDGET_MS;

  const sim = new GameSim({
    seed: combination.seed,
    items: options.items,
    population: 'enemies',
    capacity: CAPACITY,
    projectileCapacity: PROJECTILE_CAPACITY,
    particleCapacity: PARTICLE_CAPACITY,
  });

  let crashed = false;
  let crashTick: number | undefined;
  let errorMessage: string | undefined;

  try {
    for (const id of combination.itemIds) {
      sim.pickUpItem(id);
    }
  } catch (error) {
    crashed = true;
    errorMessage = errorMessageOf(error);
  }

  const heldItemIds: string[] = [];
  sim.inventory.forEachHeld((index) => {
    heldItemIds.push(sim.items.at(index).id);
  });

  let nonFinite = false;
  let nonFiniteDetail: string | undefined;
  let damageDealt = 0;
  let kills = 0;
  let ticksSinceProgress = 0;
  let softlocked = false;
  let softlockTick: number | undefined;
  let maxTickMs = 0;
  let totalTickMs = 0;
  let ticksCompleted = 0;

  // Reused every tick rather than allocated fresh — see `runFuzzCombination`'s
  // doc comment for why this exists instead of reading `sim.events`. Sized
  // for the roster's own population (six posts, plus whatever a split
  // enemy adds), never the world's full capacity.
  const trackedIndices: number[] = [];
  const trackedEntities: Entity[] = [];
  const trackedHealth: number[] = [];

  if (!crashed) {
    tickLoop: for (let tick = 0; tick < ticksRequested; tick++) {
      const fallbackAngle = (tick / 37) * Math.PI * 2;
      const input = aimingInput(nearestEnemyAngle(sim, fallbackAngle));

      trackedIndices.length = 0;
      trackedEntities.length = 0;
      trackedHealth.length = 0;
      sim.world.forEach(sim.enemyMask, (index) => {
        trackedIndices.push(index);
        trackedEntities.push(sim.world.entityAt(index));
        trackedHealth.push(sim.health.data[index * 2] ?? 0);
      });

      const started = performance.now();
      try {
        sim.step(input);
      } catch (error) {
        crashed = true;
        crashTick = tick;
        errorMessage = errorMessageOf(error);
        break;
      }
      const elapsed = performance.now() - started;
      maxTickMs = Math.max(maxTickMs, elapsed);
      totalTickMs += elapsed;
      ticksCompleted = tick + 1;

      if (tick % 90 === 0) {
        try {
          sim.spawnBierfassl(
            sim.positionX(sim.playerIndex) + 40,
            sim.positionY(sim.playerIndex),
            0,
            0,
            false,
          );
          sim.world.flush();
        } catch (error) {
          crashed = true;
          crashTick = tick;
          errorMessage = errorMessageOf(error);
          break;
        }
      }
      if (tick % 5 === 0) {
        // A no-op per `useActiveItem` for anything not held, not active, or
        // not yet charged — the same "whichever happens to be ready fires"
        // convention `tests/content/items.test.ts`'s smoke test uses.
        for (const id of heldItemIds) {
          sim.useActiveItem(id);
        }
      }

      for (const stat of STAT_IDS) {
        const value = sim.stats.value(stat);
        if (!Number.isFinite(value)) {
          nonFinite = true;
          nonFiniteDetail = `stat ${stat} = ${String(value)} at tick ${String(tick)}`;
          break tickLoop;
        }
      }
      // Plain-object flags rather than `let` locals: a `let` mutated only
      // inside a callback keeps its pre-call narrowed type in the code that
      // follows the call (TypeScript's control-flow analysis does not model
      // "the callback ran and changed this"), which makes `@typescript-eslint/
      // no-unnecessary-condition` flag the read below as always-false. A
      // property access is not narrowed that way.
      const projectileScan = { nonFinite: false };
      sim.projectiles.forEachLive((slot) => {
        if (projectileScan.nonFinite) {
          return;
        }
        const x = sim.projectiles.x[slot] ?? Number.NaN;
        const y = sim.projectiles.y[slot] ?? Number.NaN;
        const vx = sim.projectiles.velocityX[slot] ?? Number.NaN;
        const vy = sim.projectiles.velocityY[slot] ?? Number.NaN;
        const damage = sim.projectiles.damage[slot] ?? Number.NaN;
        if (![x, y, vx, vy, damage].every(Number.isFinite)) {
          projectileScan.nonFinite = true;
          nonFinite = true;
          nonFiniteDetail = `projectile ${String(slot)} non-finite at tick ${String(tick)}`;
        }
      });
      if (projectileScan.nonFinite) {
        break tickLoop;
      }

      let tickDamage = 0;
      let tickKills = 0;
      for (let tracked = 0; tracked < trackedIndices.length; tracked++) {
        const index = trackedIndices[tracked] ?? 0;
        const entity = trackedEntities[tracked];
        const before = trackedHealth[tracked] ?? 0;
        if (entity === undefined) {
          continue;
        }
        if (sim.world.isAlive(entity)) {
          const after = sim.health.data[index * 2] ?? 0;
          if (after < before) {
            tickDamage += before - after;
          }
        } else {
          // No longer alive — dead, in this scene's only way to stop being
          // alive — so whatever health it still had is what the last hit
          // dealt, even though nothing observed the intermediate state.
          tickDamage += before;
          tickKills += 1;
        }
      }
      damageDealt += tickDamage;
      kills += tickKills;

      if (tickDamage > 0 || tickKills > 0) {
        ticksSinceProgress = 0;
      } else {
        ticksSinceProgress += 1;
        if (!softlocked && ticksSinceProgress > softlockWindow) {
          softlocked = true;
          softlockTick = tick;
        }
      }
    }
  }

  const projectileOverflow = sim.projectiles.overflows > 0;
  const meanTickMs = ticksCompleted > 0 ? totalTickMs / ticksCompleted : 0;
  const frameBudgetViolation = maxTickMs > frameBudgetMs;
  const dps = ticksCompleted > 0 ? damageDealt / (ticksCompleted / TICKS_PER_SECOND) : 0;

  return {
    seed: combination.seed,
    itemIds: combination.itemIds,
    heldItemIds,
    ticksRequested,
    ticksCompleted,
    crashed,
    crashTick,
    errorMessage,
    nonFinite,
    nonFiniteDetail,
    projectileOverflow,
    softlocked,
    softlockTick,
    maxTickMs,
    meanTickMs,
    frameBudgetViolation,
    damageDealt,
    kills,
    dps,
  };
}
