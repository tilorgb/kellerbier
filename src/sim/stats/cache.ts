import { STAT_IDS, type BaseStats, type StatId } from './definition.js';
import type { StatModifier } from './modifiers.js';
import { type StatCaps, type StatTrace, type StatTraces, resolveStats } from './pipeline.js';

/** A zero-filled `Record<StatId, number>`, built once per `StatPipeline`. */
function zeroedBaseStats(): Record<StatId, number> {
  const zeroed = {} as Record<StatId, number>;
  for (const stat of STAT_IDS) {
    zeroed[stat] = 0;
  }
  return zeroed;
}

/**
 * `resolveStats`, recomputed only when the modifier set or the base stats it
 * starts from actually change.
 *
 * The pure function in `pipeline.ts` is cheap for one stat, but a caller that
 * asks for a trace every frame — the debug overlay does, and firing does too,
 * twice a shot — should not pay for six stats' worth of resolution when
 * nothing about the build has changed since the last one. Modifiers are
 * tracked per source (`setSourceModifiers`/`clearSource`) so that adding or
 * removing one item, curse or Promille tier only ever touches that source's
 * own entries.
 *
 * Base stats are compared, not just modifiers — tuning is live-editable
 * (`tuning.ts`), so a debug-window slider has to take effect the tick it
 * moves, not the tick a modifier next changes. The comparison snapshot
 * (`lastBase`) is a scratch object owned by this class and written into in
 * place, never reallocated: this runs on the firing path, and a fresh object
 * every shot to answer "did anything change?" would be exactly the kind of
 * per-tick garbage the cache exists to avoid.
 */
export class StatPipeline {
  private readonly baseStats: () => BaseStats;
  private readonly caps: StatCaps;

  private readonly bySource = new Map<string, readonly StatModifier[]>();
  private modifiers: readonly StatModifier[] = [];
  private dirty = true;
  private cached: StatTraces | null = null;

  private readonly lastBase: Record<StatId, number> = zeroedBaseStats();
  private hasLastBase = false;

  constructor(baseStats: () => BaseStats, caps: StatCaps = {}) {
    this.baseStats = baseStats;
    this.caps = caps;
  }

  /**
   * Replaces every modifier previously registered under `sourceKey` with
   * `modifiers`. Marks the pipeline dirty unconditionally — the caller is
   * expected to call this only when the source's contribution actually
   * changed (a Promille tier crossed, an item picked up), not every tick.
   */
  setSourceModifiers(sourceKey: string, modifiers: readonly StatModifier[]): void {
    this.bySource.set(sourceKey, modifiers);
    this.rebuild();
  }

  /** Removes every modifier `sourceKey` contributed. A no-op if it had none. */
  clearSource(sourceKey: string): void {
    if (this.bySource.delete(sourceKey)) {
      this.rebuild();
    }
  }

  private rebuild(): void {
    const modifiers: StatModifier[] = [];
    for (const group of this.bySource.values()) {
      modifiers.push(...group);
    }
    this.modifiers = modifiers;
    this.dirty = true;
  }

  private baseChanged(base: BaseStats): boolean {
    if (!this.hasLastBase) {
      return true;
    }
    for (const stat of STAT_IDS) {
      if (this.lastBase[stat] !== base[stat]) {
        return true;
      }
    }
    return false;
  }

  private resolve(): StatTraces {
    const base = this.baseStats();
    if (this.dirty || this.cached === null || this.baseChanged(base)) {
      this.cached = resolveStats(base, this.modifiers, this.caps);
      for (const stat of STAT_IDS) {
        this.lastBase[stat] = base[stat];
      }
      this.hasLastBase = true;
      this.dirty = false;
    }
    return this.cached;
  }

  /** The resolved value of one stat — the number gameplay code should read. */
  value(stat: StatId): number {
    return this.resolve()[stat].value;
  }

  /** The full resolution trace of one stat, for the debug overlay. */
  trace(stat: StatId): StatTrace {
    return this.resolve()[stat];
  }

  /** Every stat's trace at once. */
  traces(): StatTraces {
    return this.resolve();
  }
}
