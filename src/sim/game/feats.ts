import type { CompiledItem } from '../item/registry.js';
import type { PromilleTierId } from './promille.js';

/**
 * Run feats (#502): *how* a run went, as opposed to how long it lasted.
 *
 * Meta-progression could only ever ask for totals (`bossDefeated`,
 * `statAtLeast` over kills and runs), so the only way to earn anything was
 * to play more. This is the sim's half of asking for a style of play
 * instead — a no-damage boss, a sober kill, a full item set — recorded as a
 * small summary the app commits to the save (`app/meta/progress.ts`'s
 * `withBossFight`/`withRunBests`).
 *
 * The tracker only *reads* the simulation. It draws nothing from any RNG
 * stream and changes no state anything else reads, so a run with it is the
 * same run as one without it, and the summary is a pure function of the seed
 * and the input log like everything else here — a replay or a resumed run
 * rebuilds exactly the same feats (`docs/DECISIONS.md` #2, #51).
 */

/** Everything the tracker reads off `GameSim`, so a test can drive it without a whole run. */
export interface FeatSource {
  readonly tick: number;
  readonly currentFloor: number;
  readonly characterId: string;
  readonly promilleUnlocked: boolean;
  readonly promille: number;
  readonly promilleTier: PromilleTierId;
  /** Red plus Weißbier, in half-Maß; `null` while life is Promille (Homebrew) and hearts mean nothing. */
  readonly featHealth: number | null;
  /** Every held item, in deterministic order. */
  heldItems(): readonly CompiledItem[];
}

/** One boss fight the player won — from the boss room's lock to the tick it cleared. */
export interface BossFightRecord {
  readonly floor: number;
  readonly character: string;
  /** Hits that actually landed during the fight (`GameSim.applyPlayerDamage`). */
  readonly hitsTaken: number;
  readonly ticks: number;
  /** Health left at the kill, in half-Maß — `null` when the run has no hearts to count (Homebrew). */
  readonly healthLeft: number | null;
  /** Whether the meter existed at all during the fight — a sober kill only counts once it could have been otherwise. */
  readonly promilleUnlocked: boolean;
  readonly promille: number;
  readonly promilleTier: PromilleTierId;
  /** The highest item quality held at the kill, `-1` with nothing held. */
  readonly topQuality: number;
  /** Item tags the roster knows about that no held item carried at the kill — sorted. */
  readonly absentTags: readonly string[];
  /** The lowest Promille tier the player sat at between arriving on this floor and the kill. */
  readonly floorLowestTier: PromilleTierId;
}

/** The run-wide bests — each only ever rises over a run, which is what lets the app merge them idempotently. */
export interface RunBests {
  readonly deepestTier: number;
  readonly beersDrunk: number;
  readonly mostPassives: number;
  /** Per item tag, the most items carrying it held at once — "hold 4 rosinen items" (#503). */
  readonly mostTagged: Readonly<Record<string, number>>;
  /** Ids of every item set completed at some point this run, in completion order. */
  readonly completedSets: readonly string[];
}

interface ActiveFight {
  readonly floor: number;
  readonly startTick: number;
  readonly hitsAtStart: number;
}

export class RunFeatTracker {
  private hits = 0;
  private fight: ActiveFight | null = null;
  private readonly fights: BossFightRecord[] = [];
  private floor = -1;
  private floorLowestTier: PromilleTierId = 0;
  private deepestTier = 0;
  private beers = 0;
  private mostPassives = 0;
  private readonly mostTagged: Record<string, number> = {};
  private readonly sets: string[] = [];
  private revisionValue = 0;

  /**
   * @param tagUniverse every tag any item on the roster carries — what
   *   "held nothing tagged X" is measured against.
   */
  constructor(private readonly tagUniverse: readonly string[]) {}

  /**
   * Bumped whenever anything here changes, so the app can tell "commit
   * again" from "nothing new" without diffing the summary every frame.
   */
  get revision(): number {
    return this.revisionValue;
  }

  /** Every boss fight won this run, oldest first. */
  get bossFights(): readonly BossFightRecord[] {
    return this.fights;
  }

  /** The fight in progress, if the player is in an uncleared boss room — for the debug overlay. */
  fightInProgress(
    currentTick: number,
  ): { readonly floor: number; readonly ticks: number; readonly hits: number } | null {
    const fight = this.fight;
    return fight === null
      ? null
      : {
          floor: fight.floor,
          ticks: currentTick - fight.startTick,
          hits: this.hits - fight.hitsAtStart,
        };
  }

  get bests(): RunBests {
    return {
      deepestTier: this.deepestTier,
      beersDrunk: this.beers,
      mostPassives: this.mostPassives,
      mostTagged: this.mostTagged,
      completedSets: this.sets,
    };
  }

  /** A hit actually landed on the player. */
  notePlayerHit(): void {
    this.hits += 1;
  }

  /** A Maß was actually drunk (not stored by a Sixpack). */
  noteBeerDrunk(): void {
    this.beers += 1;
    this.revisionValue += 1;
  }

  /** An item set's last piece arrived. Completing the same set twice in one run counts once. */
  noteSetCompleted(id: string): void {
    if (!this.sets.includes(id)) {
      this.sets.push(id);
      this.revisionValue += 1;
    }
  }

  /** The inventory changed — re-counts the passives, and the items per tag, held right now. */
  noteInventory(source: FeatSource): void {
    let passives = 0;
    const tagged: Record<string, number> = {};
    for (const item of source.heldItems()) {
      if (item.active === undefined) {
        passives += 1;
      }
      for (const tag of item.tags) {
        tagged[tag] = (tagged[tag] ?? 0) + 1;
      }
    }
    if (passives > this.mostPassives) {
      this.mostPassives = passives;
      this.revisionValue += 1;
    }
    for (const [tag, count] of Object.entries(tagged)) {
      if (count > (this.mostTagged[tag] ?? 0)) {
        this.mostTagged[tag] = count;
        this.revisionValue += 1;
      }
    }
  }

  /**
   * A room finished loading. A boss room with something still alive in it is
   * a fight starting; any other room ends whatever fight was open without
   * recording it (the doors are locked in a boss fight, so the only way out
   * of one unfinished is a run that is already over).
   */
  noteRoomLoaded(source: FeatSource, bossFight: boolean): void {
    this.fight = bossFight
      ? { floor: source.currentFloor, startTick: source.tick, hitsAtStart: this.hits }
      : null;
  }

  /**
   * The current room just cleared. Records the fight if it was a boss fight
   * the player is still standing at the end of — a boss room that clears on
   * the same tick the player died in it is a draw, not a win.
   */
  noteRoomCleared(source: FeatSource, playerStanding: boolean): void {
    const fight = this.fight;
    this.fight = null;
    if (fight === null || !playerStanding) {
      return;
    }
    let topQuality = -1;
    const held = new Set<string>();
    for (const item of source.heldItems()) {
      topQuality = Math.max(topQuality, item.quality);
      for (const tag of item.tags) {
        held.add(tag);
      }
    }
    this.fights.push({
      floor: fight.floor,
      character: source.characterId,
      hitsTaken: this.hits - fight.hitsAtStart,
      ticks: source.tick - fight.startTick,
      healthLeft: source.featHealth,
      promilleUnlocked: source.promilleUnlocked,
      promille: source.promille,
      promilleTier: source.promilleTier,
      topQuality,
      absentTags: this.tagUniverse.filter((tag) => !held.has(tag)),
      floorLowestTier: this.floorLowestTier,
    });
    this.revisionValue += 1;
  }

  /** Once a tick: the Promille bests, and a fresh low-water mark for each floor arrived on. */
  tick(source: FeatSource): void {
    const tier = source.promilleTier;
    if (source.currentFloor !== this.floor) {
      this.floor = source.currentFloor;
      this.floorLowestTier = tier;
    } else if (tier < this.floorLowestTier) {
      this.floorLowestTier = tier;
    }
    if (tier > this.deepestTier) {
      this.deepestTier = tier;
      this.revisionValue += 1;
    }
  }
}

/** Every tag carried by any item in `items`, sorted — `RunFeatTracker`'s tag universe. */
export function itemTagUniverse(items: readonly Pick<CompiledItem, 'tags'>[]): string[] {
  const tags = new Set<string>();
  for (const item of items) {
    for (const tag of item.tags) {
      tags.add(tag);
    }
  }
  return [...tags].sort();
}
