import type { GameSim } from '../../sim/game/sim.js';
import type { TelemetryDeathCause, TelemetryRoomClear, TelemetryRunRecord } from './schema.js';

/**
 * Collects one run's worth of telemetry, the same shape `RunSummaryTracker`
 * (`app/run-summary.ts`) already uses for kills: a fresh instance per run
 * (`app/main.ts`'s `startRun`), fed one `recordTick` call per real
 * `sim.step()` (`advanceOneTick`), read once at the end via `finish`.
 *
 * Never gates on consent itself — `app/telemetry/store.ts#recordRunTelemetry`
 * is the one place that checks `TelemetryStore.optedIn` before this run's
 * `finish()` result is kept. That keeps "should this be collected at all" a
 * single decision at the point of persistence, rather than every call site
 * in `main.ts` needing its own opt-out branch.
 */
export class TelemetryTracker {
  private roomEnteredKey: string | null = null;
  private roomEnteredTick = 0;
  private readonly knownItemIds = new Set<string>();
  private readonly roomClears: TelemetryRoomClear[] = [];
  private readonly promilleTierTicks = new Map<number, number>();

  /** Call once per real `sim.step()`, right after it — mirrors `RunSummaryTracker.recordTick`'s own contract. */
  recordTick(
    sim: GameSim,
    floor: number,
    roomId: string,
    roomRole: string,
    justCleared: boolean,
  ): void {
    const key = `${String(floor)}:${roomId}`;
    if (key !== this.roomEnteredKey) {
      this.roomEnteredKey = key;
      this.roomEnteredTick = sim.tick;
    }
    if (justCleared) {
      this.roomClears.push({ floor, role: roomRole, ticks: sim.tick - this.roomEnteredTick });
    }

    const tier = sim.promilleTier;
    this.promilleTierTicks.set(tier, (this.promilleTierTicks.get(tier) ?? 0) + 1);

    sim.inventory.forEachHeld((index) => {
      this.knownItemIds.add(sim.items.at(index).id);
    });
  }

  /** Every enemy content id still alive in the room right now — see `TelemetryDeathCause`'s own doc comment for what this is a substitute for. */
  private enemiesPresent(sim: GameSim): string[] {
    const ids: string[] = [];
    sim.world.forEach(sim.enemyMask, (index) => {
      const id = sim.enemyIdAt(index);
      if (id !== null) {
        ids.push(id);
      }
    });
    return ids;
  }

  /** Builds the finished `TelemetryRunRecord` — call once, at the same moment `run-summary.ts#runDetailsFrom` is called for the outcome that just happened. */
  finish(
    sim: GameSim,
    options: {
      readonly seed: number;
      readonly character: string;
      readonly outcome: 'won' | 'died';
      readonly floor: number;
      readonly roomRole: string;
      readonly ticksSurvived: number;
    },
  ): TelemetryRunRecord {
    const promilleTierTicks: Record<string, number> = {};
    for (const [tier, ticks] of this.promilleTierTicks) {
      promilleTierTicks[String(tier)] = ticks;
    }
    const deathCause: TelemetryDeathCause | null =
      options.outcome === 'died'
        ? { word: sim.deathWord ?? null, enemiesPresent: this.enemiesPresent(sim) }
        : null;
    return {
      runId: crypto.randomUUID(),
      recordedAt: Date.now(),
      seed: options.seed,
      character: options.character,
      outcome: options.outcome,
      floor: options.floor,
      roomRole: options.roomRole,
      ticksSurvived: options.ticksSurvived,
      deathCause,
      itemsHeld: Array.from(this.knownItemIds),
      roomClears: this.roomClears,
      promilleTierTicks,
    };
  }
}
