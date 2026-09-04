import { EventKind } from '../sim/events/queue.js';
import type { GameSim } from '../sim/game/sim.js';
import { encodeSeed } from '../sim/rng/seed.js';
import { TICKS_PER_SECOND } from '../sim/time.js';

/**
 * Tallies the one run statistic nothing else tracks: kills.
 *
 * Ticks survived and the death word both already live on `GameSim`
 * (`playerDeathTick`, `deathWord`) — there is no reason to duplicate them
 * here. Kills are different: nothing in `sim/` counts them, because nothing
 * in the simulation itself needs to. This listens the same way
 * `playImpactAudio` does — reading events after a step, never touching sim
 * internals — so it stays a presentation-adjacent concern rather than
 * something the sim carries for a screen it doesn't know exists.
 */
export class RunSummaryTracker {
  private killCount = 0;

  get kills(): number {
    return this.killCount;
  }

  /** Call once, right after `sim.step()`, before the next step clears the queue. */
  recordTick(sim: GameSim): void {
    const events = sim.events;
    const player = sim.playerIndex;
    events.forEach((slot) => {
      if (events.kind[slot] === EventKind.Death && events.subject[slot] !== player) {
        this.killCount += 1;
      }
    });
  }
}

/**
 * The names of every item `sim`'s run currently holds, active item first —
 * `Inventory.forEachHeld` already visits in id order (`inventory.ts`'s own
 * doc comment), which reads as an arbitrary order to a player, where "what I
 * activate" leading the list reads as the one they'd expect to see named
 * first.
 */
export function heldItemNames(sim: GameSim): string[] {
  const activeId = sim.heldActiveItemId();
  const names: string[] = [];
  if (activeId !== null) {
    names.push(sim.items.get(activeId).name);
  }
  sim.inventory.forEachHeld((index) => {
    const item = sim.items.at(index);
    if (item.id !== activeId) {
      names.push(item.name);
    }
  });
  return names;
}

/** Everything `buildRunDetailsText` needs to say about one run. */
export interface RunDetails {
  readonly seed: number;
  /** Who the run was played as (#47) — read off the run itself, not off the save's current pick. */
  readonly character: string;
  readonly floorName: string;
  readonly roomRole: string;
  readonly ticksSurvived: number;
  readonly kills: number;
  readonly deathWord: string | null;
  readonly items: readonly string[];
  /** Whether the run this describes is still going — changes the tense of the outcome clause. */
  readonly alive: boolean;
  /**
   * Whether the run ended in a win (#155) rather than ongoing or dead.
   * Optional, defaulting to falsy, so every existing caller/fixture that
   * predates the win state (there was only ever "alive" or "dead" before
   * it) keeps meaning exactly what it always did.
   */
  readonly won?: boolean;
  /**
   * The anonymous playtest telemetry session id (#159), if the player has
   * opted into telemetry (`app/telemetry/store.ts#loadTelemetry`) — `null`
   * otherwise. Included in the "copy run details" text so a tester in a
   * playtest session (`docs/PLAYTEST_PROTOCOL.md`) can hand the observer the
   * one thing that ties their telemetry to the session being watched,
   * through the same key everybody already presses to report a bug.
   */
  readonly telemetrySessionId?: string | null;
}

export function runDetailsFrom(
  sim: GameSim,
  floorName: string,
  roomRole: string,
  kills: number,
  telemetrySessionId: string | null = null,
): RunDetails {
  return {
    seed: sim.seed,
    character: sim.character.name,
    floorName,
    roomRole,
    // `sim.tick` keeps climbing after either outcome (nothing pauses the
    // sim itself at the moment a run ends) — the frozen tick each outcome's
    // own field records is what "how long did the run actually last" means.
    ticksSurvived: sim.playerWon
      ? sim.playerWonTick
      : sim.playerDead
        ? sim.playerDeathTick
        : sim.tick,
    kills,
    // A won run never drew a death word — there was nothing to draw one for.
    deathWord: sim.playerWon ? null : (sim.deathWord ?? null),
    items: heldItemNames(sim),
    alive: !sim.playerDead,
    won: sim.playerWon,
    telemetrySessionId,
  };
}

/**
 * "Copy run details" (#48's acceptance criterion): a shareable, one-paste
 * summary of the seed, character, items and outcome. Built as plain text
 * rather than anything richer — `navigator.clipboard.writeText` is what
 * every call site actually has, and a bug report or a chat message wants
 * something it can paste straight in, not a format it has to render first.
 */
export function buildRunDetailsText(details: RunDetails): string {
  const seconds = (details.ticksSurvived / TICKS_PER_SECOND).toFixed(1);
  const outcome =
    details.won === true
      ? `won on ${details.floorName} (${details.roomRole})`
      : details.alive
        ? `still going, ${details.floorName} (${details.roomRole})`
        : `died on ${details.floorName} (${details.roomRole})${
            details.deathWord === null ? '' : ` — "${details.deathWord}"`
          }`;
  const items = details.items.length === 0 ? 'none' : details.items.join(', ');
  // `>>> 0`: see `debug/panels/run-info.ts`'s identical normalisation — a
  // dev-only seed source (`?seed=`, `#seed-input`) is the only way `sim.seed`
  // is not already a valid 32-bit unsigned integer.
  const telemetryLine =
    details.telemetrySessionId === null || details.telemetrySessionId === undefined
      ? ''
      : `\nPlaytest session: ${details.telemetrySessionId}`;
  return (
    `Kellerbier run — seed ${encodeSeed(details.seed >>> 0)} · ${details.character}\n` +
    `${seconds}s survived · ${String(details.kills)} kills · ${outcome}\n` +
    `Items: ${items}${telemetryLine}`
  );
}
