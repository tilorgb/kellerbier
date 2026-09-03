import { HIGHEST_PLAYABLE_FLOOR } from '../../../src/content/floors/definition.js';
import type { ItemDefinition } from '../../../src/sim/item/definition.js';
import { GameSim } from '../../../src/sim/game/sim.js';
import type { FloorPlan } from '../../../src/sim/room/floor-plan.js';
import { RngStream, createStreamRng } from '../../../src/sim/rng/streams.js';
import { doorCentre } from '../../../src/sim/room/template.js';
import { combatInput, moveTowardInput, type SkillProfile } from './bot.js';
import {
  buildFloorPlan,
  doorContactMatches,
  doorToward,
  findSimDoor,
  pathToBoss,
  planDoorCrossing,
  planRoom,
  startRoomLoadOptions,
} from './floor-runtime.js';

/**
 * #54's "balance simulator": a scripted player driven headlessly through
 * *real, generated* floors — not `tests/fuzz/lib/harness.ts`'s single fixed
 * combat scene — up to `HIGHEST_PLAYABLE_FLOOR`, reporting per-floor timing
 * and damage so a floor's difficulty is a number, not a feeling.
 *
 * Deliberate simplifications against a real run, all in the "known
 * limitation, not a bug" sense CLAUDE.md's content-gap section asks for:
 *
 * - **Shortest path, not a detour.** `pathToBoss` walks the shortest route
 *   to the boss room — through a shop or an unlocked treasure room when
 *   that's genuinely the only way there, never through a secret/
 *   supersecret one. It never actually shops or opens a treasure pedestal
 *   along the way, so their item pedestals, Losbrunnen rolls and Biermarken
 *   sinks never factor into a run. A player who detours (or has to detour
 *   further than the shortest route) faces a different floor than what
 *   this bot measures.
 * - **A fixed starting loadout, not organic pickup.** `several skill
 *   levels` (the issue's own words) is modelled as a starting item set
 *   granted via `sim.pickUpItem` before floor 1 begins, the same
 *   before-the-run grant `tests/fuzz/lib/harness.ts` already uses — not by
 *   teaching the bot to walk onto and choose from a pedestal.
 * - **No procedural room content.** See `floor-runtime.ts`'s own doc
 *   comment — every room still plays a real authored template, just never
 *   the generated-in-place variant a human's run can also draw.
 *
 * None of these change what floors 1-2's *combat and traversal* actually
 * demand of a player, which is what `damageTaken`/`ticks`/`result` here are
 * measuring.
 */

export interface PlaytestOptions {
  readonly seed: number;
  /** The full item roster `GameSim` resolves ids against — normally `ITEM_DEFINITIONS`. */
  readonly items: readonly ItemDefinition[];
  /** Granted via `sim.pickUpItem` before floor 1 starts. */
  readonly loadoutItemIds: readonly string[];
  readonly skill: SkillProfile;
  /** Hard cap so a pathological run can't hang the sweep. Defaults to `DEFAULT_MAX_TICKS`. */
  readonly maxTicks?: number;
  /** Consecutive ticks with no room transition, no kill, and negligible movement before a run is called stuck. Defaults to `DEFAULT_STUCK_WINDOW_TICKS`. */
  readonly stuckWindowTicks?: number;
}

export interface FloorOutcome {
  readonly floor: number;
  readonly floorName: string;
  readonly roomsCleared: number;
  readonly ticks: number;
  readonly damageTaken: number;
}

export type PlaytestResult = 'won' | 'died' | 'stuck' | 'crashed' | 'ranOut';

export interface PlaytestOutcome {
  readonly seed: number;
  readonly skill: string;
  readonly loadoutItemIds: readonly string[];
  readonly heldItemIds: readonly string[];
  readonly result: PlaytestResult;
  readonly errorMessage: string | undefined;
  readonly floorsReached: number;
  readonly ticksCompleted: number;
  readonly damageTaken: number;
  readonly floors: readonly FloorOutcome[];
}

/** ~20 minutes of ticks at 60 tps — generous against #54's own "about fifteen minutes" target for a full two-floor run. */
const DEFAULT_MAX_TICKS = 72_000;

/** 10 seconds with no transition, kill, or meaningful movement. */
const DEFAULT_STUCK_WINDOW_TICKS = 600;

/** Below this, the player is considered "not moving" for stuck-detection purposes — a few px of collision jitter shouldn't reset the window. */
const STUCK_MOVE_EPSILON = 4;

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Summed remaining health of every live enemy — a proxy for "is combat
 * making progress," read the same way `tests/fuzz/lib/harness.ts`'s own
 * doc comment explains: `sim.events` only ever carries a `Damage` event for
 * a hit that lands on the *player*, so a hit on an enemy has to be read off
 * its own health directly instead.
 */
function totalEnemyHealth(sim: GameSim): number {
  let total = 0;
  sim.world.forEach(sim.enemyMask, (index) => {
    total += sim.health.data[index * 2] ?? 0;
  });
  return total;
}

/** Fresh per tick: cheap (a handful of rooms), and always right after a room transition changes `currentRoomId`. */
function decideTarget(
  sim: GameSim,
  floorPlan: FloorPlan,
  currentRoomId: string,
):
  | { readonly kind: 'combat' }
  | { readonly kind: 'stuck' }
  | { readonly kind: 'advanceFloor'; readonly x: number; readonly y: number }
  | {
      readonly kind: 'crossDoor';
      readonly x: number;
      readonly y: number;
      readonly crossing: ReturnType<typeof planDoorCrossing>;
    } {
  if (sim.liveEnemyCount > 0) {
    return { kind: 'combat' };
  }
  const nextFloorDoor = sim.nextFloorDoor;
  if (nextFloorDoor !== null) {
    const { x, y } = doorCentre(sim.room, nextFloorDoor);
    return { kind: 'advanceFloor', x, y };
  }
  const path = pathToBoss(floorPlan, currentRoomId);
  if (path === null || path.length < 2) {
    return { kind: 'stuck' };
  }
  const nextRoomId = path[1];
  if (nextRoomId === undefined) {
    return { kind: 'stuck' };
  }
  const door = doorToward(floorPlan, currentRoomId, nextRoomId);
  if (door === undefined) {
    return { kind: 'stuck' };
  }
  const crossing = planDoorCrossing(floorPlan, currentRoomId, door);
  const targetDoor = findSimDoor(sim, planRoom(floorPlan, currentRoomId), crossing.exitDoor);
  if (targetDoor === undefined) {
    return { kind: 'stuck' };
  }
  const { x, y } = doorCentre(sim.room, targetDoor);
  return { kind: 'crossDoor', x, y, crossing };
}

/** Runs one full scripted playtest — floor 1 through `HIGHEST_PLAYABLE_FLOOR` — and reports what happened. */
export function runPlaytest(options: PlaytestOptions): PlaytestOutcome {
  const maxTicks = options.maxTicks ?? DEFAULT_MAX_TICKS;
  const stuckWindow = options.stuckWindowTicks ?? DEFAULT_STUCK_WINDOW_TICKS;

  let floorPlan: FloorPlan;
  let sim: GameSim;
  try {
    floorPlan = buildFloorPlan(createStreamRng(options.seed, RngStream.Floor), 1);
    const startOptions = startRoomLoadOptions(floorPlan);
    sim = new GameSim({
      seed: options.seed,
      items: options.items,
      promilleUnlocked: true,
      roomTemplate: startOptions.roomTemplate,
      roomPlacement: startOptions.roomPlacement,
      floor: startOptions.floor,
      hiddenDoors: startOptions.hiddenDoors,
      suppressRoomContent: startOptions.suppressRoomContent,
    });
    for (const id of options.loadoutItemIds) {
      sim.pickUpItem(id);
    }
  } catch (error) {
    return {
      seed: options.seed,
      skill: options.skill.name,
      loadoutItemIds: options.loadoutItemIds,
      heldItemIds: [],
      result: 'crashed',
      errorMessage: errorMessageOf(error),
      floorsReached: 0,
      ticksCompleted: 0,
      damageTaken: 0,
      floors: [],
    };
  }

  const heldItemIds: string[] = [];
  sim.inventory.forEachHeld((index) => {
    heldItemIds.push(sim.items.at(index).id);
  });

  let currentRoomId: string = floorPlan.startRoomId;
  const floorOutcomes: FloorOutcome[] = [];
  let floorRoomsCleared = 0;
  let floorTicks = 0;
  let floorDamageTaken = 0;
  let totalDamageTaken = 0;
  let ticksSinceProgress = 0;
  let lastX = sim.positionX(sim.playerIndex);
  let lastY = sim.positionY(sim.playerIndex);

  let result: PlaytestResult = 'ranOut';
  let errorMessage: string | undefined;
  let tick = 0;

  runLoop: for (; tick < maxTicks; tick++) {
    let target: ReturnType<typeof decideTarget>;
    try {
      target = decideTarget(sim, floorPlan, currentRoomId);
    } catch (error) {
      result = 'crashed';
      errorMessage = errorMessageOf(error);
      break runLoop;
    }
    if (target.kind === 'stuck') {
      result = 'stuck';
      break runLoop;
    }

    const input =
      target.kind === 'combat'
        ? combatInput(sim, options.skill, tick)
        : moveTowardInput(sim, target.x, target.y, ticksSinceProgress);

    const healthBefore = sim.playerHealth + sim.playerSoulHealth + sim.playerEternalHealth;
    const enemyHealthBefore = totalEnemyHealth(sim);

    try {
      sim.step(input);
      if (tick % 5 === 0) {
        for (const id of heldItemIds) {
          sim.useActiveItem(id);
        }
      }
    } catch (error) {
      result = 'crashed';
      errorMessage = errorMessageOf(error);
      break runLoop;
    }
    floorTicks += 1;

    const healthAfter = sim.playerHealth + sim.playerSoulHealth + sim.playerEternalHealth;
    if (healthAfter < healthBefore) {
      const damage = healthBefore - healthAfter;
      floorDamageTaken += damage;
      totalDamageTaken += damage;
    }

    if (sim.playerDead) {
      result = 'died';
      break runLoop;
    }

    // A fight can hold position (within `combatInput`'s kiting band) for
    // many seconds while still landing real hits — only resetting the
    // stuck window on movement/door-crossings mistook a slow, healthy
    // multi-enemy fight for being stuck. Dealing damage counts as progress
    // too, whether or not it kills anything this tick.
    const dealtDamage = totalEnemyHealth(sim) < enemyHealthBefore;

    let progressed = false;

    if (target.kind === 'advanceFloor') {
      const contact = sim.nextFloorDoor;
      if (
        contact !== null &&
        doorContactMatches(sim.doorContact, {
          direction: contact.direction,
          cellCol: contact.cellCol,
          cellRow: contact.cellRow,
        })
      ) {
        floorOutcomes.push({
          floor: floorPlan.floor,
          floorName: floorPlan.floorName,
          roomsCleared: floorRoomsCleared,
          ticks: floorTicks,
          damageTaken: floorDamageTaken,
        });
        if (floorPlan.floor >= HIGHEST_PLAYABLE_FLOOR) {
          sim.markWon();
        } else {
          try {
            floorPlan = buildFloorPlan(sim.random.floor, floorPlan.floor + 1);
            const nextStart = startRoomLoadOptions(floorPlan);
            sim.clearFloorProgress();
            sim.loadRoom(
              nextStart.roomTemplate,
              nextStart.floor,
              null,
              nextStart.hiddenDoors,
              nextStart.roomPlacement,
              { col: 0, row: 0 },
              true,
            );
          } catch (error) {
            result = 'crashed';
            errorMessage = errorMessageOf(error);
            break runLoop;
          }
          currentRoomId = floorPlan.startRoomId;
          floorRoomsCleared = 0;
          floorTicks = 0;
          floorDamageTaken = 0;
        }
        progressed = true;
      }
    } else if (target.kind === 'crossDoor') {
      if (doorContactMatches(sim.doorContact, target.crossing.exitDoor)) {
        const { crossing } = target;
        const succeeded = crossing.staircase
          ? sim.transitionToStaircase(
              crossing.template,
              crossing.floor,
              crossing.direction,
              crossing.hiddenDoors,
            )
          : sim.transitionTo(
              crossing.template,
              crossing.floor,
              crossing.direction,
              crossing.hiddenDoors,
              crossing.placement,
              crossing.entryCell,
            );
        if (succeeded) {
          currentRoomId = crossing.neighborRoomId;
          floorRoomsCleared += 1;
          progressed = true;
        }
      }
    }

    if (sim.playerWon) {
      result = 'won';
      break runLoop;
    }

    const x = sim.positionX(sim.playerIndex);
    const y = sim.positionY(sim.playerIndex);
    const moved = Math.hypot(x - lastX, y - lastY) > STUCK_MOVE_EPSILON;
    lastX = x;
    lastY = y;

    if (progressed || moved || dealtDamage) {
      ticksSinceProgress = 0;
    } else {
      ticksSinceProgress += 1;
      if (ticksSinceProgress > stuckWindow) {
        result = 'stuck';
        break runLoop;
      }
    }
  }

  if (floorTicks > 0 && floorOutcomes.every((f) => f.floor !== floorPlan.floor)) {
    floorOutcomes.push({
      floor: floorPlan.floor,
      floorName: floorPlan.floorName,
      roomsCleared: floorRoomsCleared,
      ticks: floorTicks,
      damageTaken: floorDamageTaken,
    });
  }

  return {
    seed: options.seed,
    skill: options.skill.name,
    loadoutItemIds: options.loadoutItemIds,
    heldItemIds,
    result,
    errorMessage,
    floorsReached: floorOutcomes.length > 0 ? Math.max(...floorOutcomes.map((f) => f.floor)) : 0,
    ticksCompleted: tick,
    damageTaken: totalDamageTaken,
    floors: floorOutcomes,
  };
}
