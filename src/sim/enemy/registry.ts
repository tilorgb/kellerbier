import {
  type BehaviourName,
  DEATH_BEHAVIOURS,
  type EnemyBehaviour,
  type EnemyDefinition,
  ENTRY_BEHAVIOURS,
  FIRING_BEHAVIOURS,
  type EnemyState,
  LATCH_BEHAVIOURS,
  STATE_FLAG_BEHAVIOURS,
  type FireAtPlayerBehaviour,
  type FireBurstBehaviour,
  type FireOnBeatBehaviour,
  type FireRingBehaviour,
  type FireSpreadBehaviour,
  type MeleeArcBehaviour,
  MOVEMENT_BEHAVIOURS,
  PROP_DROP_BEHAVIOURS,
  SUMMON_BEHAVIOURS,
} from './definition.js';
import { ENEMY_PROFILES, ENEMY_SIZE_BY_NAME, type EnemySizeId } from './size.js';
import { propKindIndex } from '../game/prop-kinds.js';
import { DEATH_EFFECT_KINDS, DEFAULT_DEATH_EFFECT } from '../particle/effects.js';
import type { ParticleKindId } from '../particle/store.js';

/**
 * `deathEffect` as a name to `deathEffect` as a `ParticleKind`.
 *
 * Thrown on an unknown name rather than defaulted: a definition that names an
 * effect means to have one, and the failure mode of guessing is a creature
 * that quietly throws beer forever with nobody noticing.
 */
function compileDeathEffect(name: string | undefined, where: string): ParticleKindId {
  if (name === undefined) {
    return DEFAULT_DEATH_EFFECT;
  }
  const kind = DEATH_EFFECT_KINDS[name];
  if (kind === undefined) {
    throw new Error(
      `${where} names deathEffect "${name}", which is not one of ` +
        Object.keys(DEATH_EFFECT_KINDS).join(', '),
    );
  }
  return kind;
}

/**
 * `telegraphLook` as a name to whether the body bloats (#405). Thrown on an
 * unknown name for `compileDeathEffect`'s reason: content is loaded from
 * data, and a typo must not quietly become "no look at all".
 */
function compileTelegraphLook(name: string | undefined, where: string): boolean {
  if (name === undefined) {
    return false;
  }
  if (name !== 'bloat') {
    throw new Error(`${where} names telegraphLook "${name}", which is not one of bloat`);
  }
  return true;
}

/** `facing` resolved to a number, so the renderer compares no string per frame. */
export const EnemyFacing = {
  /** Drawn as authored. */
  None: 0,
  /** Flips left/right toward its movement, else toward the player. */
  Mirror: 1,
  /** Lies flat, head turned in quarter turns toward its heading. */
  Crawl: 2,
} as const;
export type EnemyFacingId = (typeof EnemyFacing)[keyof typeof EnemyFacing];

/** `facing` as a name to an `EnemyFacing`, thrown on an unknown name for `compileTelegraphLook`'s reason. */
function compileFacing(name: string | undefined, where: string): EnemyFacingId {
  switch (name) {
    case undefined:
      return EnemyFacing.None;
    case 'mirror':
      return EnemyFacing.Mirror;
    case 'crawl':
      return EnemyFacing.Crawl;
    default:
      throw new Error(`${where} names facing "${name}", which is not one of mirror, crawl`);
  }
}

/**
 * Enemy data, checked once and turned into something a system can read fast.
 *
 * The two jobs are separate on purpose. **Validation** is the content test
 * suite's half: a transition pointing at a state that does not exist is a
 * mistake that must fail loudly at load, not produce an enemy that stands still
 * in one room out of forty. **Compilation** is the frame loop's half: state and
 * transition names are resolved to indices here, at construction, so the enemy
 * system never compares a string while the game is running.
 *
 * What it deliberately does *not* do is flatten the data into typed arrays. The
 * collision system does that because it runs five thousand times a tick; a room
 * holds dozens of enemies, and reading a frozen object graph costs nothing
 * measurable at that count while costing a great deal of legibility. If a floor
 * ever holds thousands of behaving bodies, this is the file to revisit.
 */

/** What makes a state give way to another. */
export const TransitionTrigger = {
  After: 0,
  OnHit: 1,
  OnBlocked: 2,
  PlayerWithin: 3,
  PlayerBeyond: 4,
  PropWithin: 5,
  PropBeyond: 6,
  /** The body latched on to the player this tick (#406). */
  OnLatched: 7,
  /** The player shook the body off (#406). */
  OnShakenOff: 8,
  /** The player is one step away on a diagonal (#407). `value` is the step, `tolerance` the slack. */
  PlayerDiagonalAdjacent: 9,
  /** The player is on one of the body's four axes, in sight (#409). `tolerance` is the slack. */
  PlayerOnAxis: 10,
} as const;

export type TransitionTriggerId = (typeof TransitionTrigger)[keyof typeof TransitionTrigger];

export interface CompiledTransition {
  readonly trigger: TransitionTriggerId;
  /** Ticks, or a distance in pixels. Unused by the triggers that carry neither. */
  readonly value: number;
  /** Index into the enemy's own state list. */
  readonly to: number;
  /** For `PropWithin`: the `DESTRUCTIBLE_PROP_KINDS` index to measure to. -1 otherwise. */
  readonly propKind: number;
  /** For `PlayerDiagonalAdjacent`: room units of slack around the diagonal step. 0 otherwise. */
  readonly tolerance: number;
  /**
   * For `After`: the top of a ranged `after` (#408), `value` being its
   * bottom. Equal to `value` for a fixed `after`, and unused by every other
   * trigger.
   */
  readonly max: number;
}

/** A `summon` with its child resolved to a definition index (#276). */
export interface CompiledSummon {
  readonly definition: number;
  readonly everyTicks: number;
  readonly countPerWave: number;
  readonly maxActive: number;
  readonly spread: number;
}

/** A `dropProp` with its prop resolved to a `DESTRUCTIBLE_PROP_KINDS` index (#277). */
export interface CompiledPropDrop {
  readonly kind: number;
  readonly everyTicks: number;
  readonly maxActive: number;
  readonly health: number;
  readonly radius: number;
  readonly behind: number;
}

/** A `splitOnDeath` with its target resolved to a definition index. */
export interface CompiledSplit {
  readonly definition: number;
  readonly count: number;
  readonly spread: number;
  /** Fraction of max health that force-triggers the split early. Zero: never. */
  readonly atHealthBelow: number;
  /** `healthWithoutProp`'s prop resolved to a `DESTRUCTIBLE_PROP_KINDS` index, or -1 when unset. */
  readonly healthWithoutPropKind: number;
  /** `healthWithoutProp.health`. Meaningless when `healthWithoutPropKind` is -1. */
  readonly healthWithoutPropHealth: number;
}

export type FiringBehaviour =
  | FireAtPlayerBehaviour
  | FireBurstBehaviour
  | FireSpreadBehaviour
  | FireOnBeatBehaviour
  | FireRingBehaviour;

/** A `detonateLobbedBomb` resolved and validated once, at compile time. */
export interface CompiledDetonation {
  readonly damage: number;
  readonly radius: number;
}

/** An `emitCloud` validated once, at compile time (#401). `-1` ticks mean "use the tuning default" and are resolved at emit time, so a runtime tuning change applies. */
export interface CompiledCloud {
  readonly radius: number;
  readonly growTicks: number;
  readonly lifetimeTicks: number;
}

/** A `meleeArc` validated once, at compile time (#199). */
export interface CompiledMeleeArc {
  readonly arc: number;
  readonly reach: number;
  readonly damage: number;
  readonly knockback: number;
  readonly sweepTicks: number;
  readonly direction: -1 | 1;
  /** Which held-weapon sprite the renderer swings, or `null` for a swipe the telegraph alone shows. Read once a frame, not in the hot path — no interning. */
  readonly weapon: string | null;
}

export interface CompiledState {
  readonly name: string;
  /** Exactly one, guaranteed by validation. */
  readonly movement: EnemyBehaviour;
  readonly firing: readonly FiringBehaviour[];
  /**
   * True for a state that attacks in a direction — an aimed shot, a
   * `chargeAtPlayer`, a `meleeArc`. Such a state keeps an aim locked by the
   * wind-up before it (`ENEMY_FLAG_AIM_LOCKED`); any other state releases it.
   */
  readonly aimsAttack: boolean;
  /** Ticks of telegraph from the moment the state begins. Zero for none. */
  readonly telegraphTicks: number;
  /** Ticks of invulnerability from the moment the state begins. Zero for none. */
  readonly invulnerableTicks: number;
  /** True for a state whose entry stores the player's position for a later `detonateLobbedBomb` to read (Böllerschmeißer, #156). */
  readonly capturesLobTarget: boolean;
  /** Set for a state whose entry deals area damage at an earlier `lobTarget`'s captured position. `null` for every other state. */
  readonly detonate: CompiledDetonation | null;
  /** Set for a state whose entry leaves a poison cloud (#401). `null` for every other state. */
  readonly emitCloud: CompiledCloud | null;
  /** Set for a state that swings a wide melee arc (Maibaum-Dieb, #199). `null` otherwise. */
  readonly meleeArc: CompiledMeleeArc | null;
  /** True for a state carrying `latchOnPlayer` (#406): touching the player attaches the body. */
  readonly latchesOnPlayer: boolean;
  /** True for a state carrying `submerge` (#408): out of reach of everything, drawn as a shadow. */
  readonly submerged: boolean;
  /** True for a state with a ranged `after` (#408): entering it rolls a duration from `random.enemies`. */
  readonly rollsDuration: boolean;
  /**
   * For an `approachProp` movement: the `DESTRUCTIBLE_PROP_KINDS` index it
   * heads for. -1 for every other movement, and read only when
   * `movement.behaviour === 'approachProp'` (#199).
   */
  readonly approachPropKind: number;
  /** For a `grabProp` entry: `{ kind, reach }`. `null` for every other state (#199). */
  readonly grabProp: { readonly kind: number; readonly reach: number } | null;
  readonly splits: readonly CompiledSplit[];
  /** `summon` behaviours on this state, children resolved to definition indices (#276). */
  readonly summons: readonly CompiledSummon[];
  /** `dropProp` behaviours on this state, props resolved to kind indices (#277). */
  readonly propDrops: readonly CompiledPropDrop[];
  readonly transitions: readonly CompiledTransition[];
}

export interface CompiledEnemy {
  readonly id: string;
  readonly name: string;
  readonly size: EnemySizeId;
  readonly radius: number;
  /** The size class's ground footprint (#73) — see `EnemyProfile.footprint`. */
  readonly footprint: number;
  readonly mass: number;
  readonly health: number;
  readonly contactDamage: number;
  readonly initialState: number;
  readonly states: readonly CompiledState[];
  readonly lootTier: 'weak' | 'normal' | 'tough';
  readonly locksRoom: boolean;
  /** Whether this body's health feeds the boss/mini-boss bar (#276). */
  readonly bossBar: boolean;
  /**
   * The `ParticleKind` this creature comes apart into (#153), resolved from
   * the definition's authored `deathEffect` name.
   *
   * Resolved here rather than at the death site for the same reason every
   * other name in this class is: the frame loop must not compare a string,
   * and an unknown name must fail at construction — a typo'd `deathEffect`
   * silently falling back to beer is exactly the kind of quiet content bug
   * `docs/DECISIONS.md` #7 rules out.
   */
  readonly deathEffect: ParticleKindId;
  /** The definition's `telegraphLook === 'bloat'` (#405), resolved once so the renderer compares no string per frame. */
  readonly telegraphBloat: boolean;
  /** The definition's `facing`, resolved once for the same reason as `telegraphBloat`. */
  readonly facing: EnemyFacingId;
  /**
   * The water this creature lives in (#408) — set when any of its states
   * `swimInZone`s, `null` for everything that walks. A water creature is
   * placed in its water at spawn and kept there (`stepZoneClamp`).
   */
  readonly zone: 'waldbach' | null;
}

export class EnemyRegistry {
  readonly all: readonly CompiledEnemy[];

  /**
   * Every distinct projectile-sprite name any firing behaviour in the roster
   * names (#152), interned so a shot in flight can carry a small integer
   * instead of a string.
   *
   * Index 0 is reserved for "no art named" and is never a real name, so a
   * projectile's `art` slot needs no sentinel of its own and a store zeroed
   * on reset means what it looks like it means. Built here rather than on
   * `GameSim` because it is a property of the *roster*, resolved once at
   * construction alongside every other name-to-index this class already
   * resolves.
   */
  readonly projectileArtNames: readonly string[];

  private readonly byId = new Map<string, number>();
  private readonly artIndices = new Map<string, number>();

  constructor(definitions: readonly EnemyDefinition[]) {
    for (const definition of definitions) {
      if (this.byId.has(definition.id)) {
        throw new Error(`Two enemies share the id "${definition.id}"`);
      }
      this.byId.set(definition.id, this.byId.size);
    }
    const artNames: string[] = [''];
    for (const definition of definitions) {
      for (const state of definition.states) {
        for (const behaviour of state.behaviours) {
          const art = 'art' in behaviour ? behaviour.art : undefined;
          if (typeof art !== 'string' || art === '' || this.artIndices.has(art)) {
            continue;
          }
          this.artIndices.set(art, artNames.length);
          artNames.push(art);
        }
      }
    }
    this.projectileArtNames = artNames;
    this.all = definitions.map((definition) => this.compile(definition));
  }

  /** The interned index of a shot's `art` name, or 0 for a shot that names none. */
  artIndexOf(art: string | undefined): number {
    return art === undefined ? 0 : (this.artIndices.get(art) ?? 0);
  }

  /** The name behind an `art` index, or `null` for 0 (and for anything out of range). */
  artNameAt(index: number): string | null {
    const name = this.projectileArtNames[index];
    return name === undefined || name === '' ? null : name;
  }

  get count(): number {
    return this.all.length;
  }

  /** The index of an enemy by id, or -1. Indices are what entities store. */
  indexOf(id: string): number {
    return this.byId.get(id) ?? -1;
  }

  /** The enemy at an index. Throws rather than returning a half-enemy. */
  at(index: number): CompiledEnemy {
    const enemy = this.all[index];
    if (enemy === undefined) {
      throw new RangeError(`No enemy definition at index ${String(index)}`);
    }
    return enemy;
  }

  /** The enemy with an id. Throws, because a missing id is a content bug. */
  get(id: string): CompiledEnemy {
    const index = this.indexOf(id);
    if (index < 0) {
      throw new Error(`No enemy definition with id "${id}"`);
    }
    return this.at(index);
  }

  private compile(definition: EnemyDefinition): CompiledEnemy {
    const where = `enemy "${definition.id}"`;
    if (definition.id.trim() === '' || definition.id !== definition.id.toLowerCase()) {
      throw new Error(`${where} must have a non-empty, lower-case id`);
    }
    if (definition.states.length === 0) {
      throw new Error(`${where} has no states`);
    }
    if (!(definition.health > 0)) {
      throw new Error(`${where} must have health above zero, got ${String(definition.health)}`);
    }
    if (definition.contactDamage < 0) {
      throw new Error(`${where} has negative contact damage`);
    }

    // Read through a wider type on purpose: the types say a definition names
    // one of three sizes, and a definition is data, which can say anything.
    const sizes: Readonly<Record<string, EnemySizeId | undefined>> = ENEMY_SIZE_BY_NAME;
    const size = sizes[definition.size];
    if (size === undefined) {
      throw new Error(`${where} has unknown size "${definition.size}"`);
    }
    const profile = ENEMY_PROFILES[size];

    const stateIndexByName = new Map<string, number>();
    for (const [index, state] of definition.states.entries()) {
      if (stateIndexByName.has(state.name)) {
        throw new Error(`${where} declares the state "${state.name}" twice`);
      }
      stateIndexByName.set(state.name, index);
    }

    const initialState = stateIndexByName.get(definition.initial);
    if (initialState === undefined) {
      throw new Error(`${where} starts in "${definition.initial}", which is not one of its states`);
    }

    const states = definition.states.map((state) =>
      this.compileState(definition, state, stateIndexByName),
    );
    // `onLatched`/`onShakenOff` can only ever fire for a body that latches
    // somewhere (#406): written on an enemy that never does, it is a state
    // machine waiting forever on a signal nothing sends.
    if (!states.some((state) => state.latchesOnPlayer)) {
      for (const state of states) {
        for (const transition of state.transitions) {
          if (
            transition.trigger === TransitionTrigger.OnLatched ||
            transition.trigger === TransitionTrigger.OnShakenOff
          ) {
            throw new Error(
              `${where} state "${state.name}" waits on onLatched/onShakenOff, ` +
                `but no state of it uses "latchOnPlayer"`,
            );
          }
        }
      }
    }

    return {
      id: definition.id,
      name: definition.name,
      size,
      radius: profile.radius,
      footprint: profile.footprint,
      mass: definition.mass ?? profile.mass,
      health: definition.health,
      contactDamage: definition.contactDamage,
      initialState,
      states,
      lootTier: definition.lootTier ?? 'normal',
      locksRoom: definition.locksRoom ?? true,
      bossBar: definition.bossBar ?? false,
      deathEffect: compileDeathEffect(definition.deathEffect, where),
      telegraphBloat: compileTelegraphLook(definition.telegraphLook, where),
      facing: compileFacing(definition.facing, where),
      zone: states.some((state) => state.movement.behaviour === 'swimInZone') ? 'waldbach' : null,
    };
  }

  private compileState(
    definition: EnemyDefinition,
    state: EnemyState,
    stateIndexByName: ReadonlyMap<string, number>,
  ): CompiledState {
    const where = `enemy "${definition.id}" state "${state.name}"`;

    let movement: EnemyBehaviour | null = null;
    let approachPropKind = -1;
    const firing: FiringBehaviour[] = [];
    const splits: CompiledSplit[] = [];
    const summons: CompiledSummon[] = [];
    const propDrops: CompiledPropDrop[] = [];
    let telegraphTicks = 0;
    let invulnerableTicks = 0;
    let capturesLobTarget = false;
    let detonate: CompiledDetonation | null = null;
    let emitCloud: CompiledCloud | null = null;
    let meleeArc: CompiledMeleeArc | null = null;
    let grabProp: { kind: number; reach: number } | null = null;
    let latchesOnPlayer = false;
    let submerged = false;

    for (const behaviour of state.behaviours) {
      const name: BehaviourName = behaviour.behaviour;
      if (MOVEMENT_BEHAVIOURS.includes(name)) {
        if (movement !== null) {
          throw new Error(
            `${where} declares two movement behaviours ` +
              `("${movement.behaviour}" and "${name}"). A state goes one way at a time.`,
          );
        }
        movement = behaviour;
        if (behaviour.behaviour === 'swimInZone') {
          // Read wide for the same reason `size` is: content is data.
          const zone: string = behaviour.zone;
          if (zone !== 'waldbach') {
            throw new Error(`${where}: "swimInZone" zone "${zone}" is not one of waldbach`);
          }
          if (!(behaviour.speed > 0)) {
            throw new Error(`${where}: "swimInZone" needs a speed above zero`);
          }
        }
        if (behaviour.behaviour === 'approachWood') {
          if (!(behaviour.speed > 0)) {
            throw new Error(`${where}: "approachWood" needs a speed above zero`);
          }
          if (!(behaviour.eatTicks.obstacle >= 1) || !(behaviour.eatTicks.plank >= 1)) {
            throw new Error(`${where}: "approachWood" needs eatTicks of at least 1 for both`);
          }
        }
        if (behaviour.behaviour === 'hopCardinal' || behaviour.behaviour === 'hopTowardPlayer') {
          const name = behaviour.behaviour;
          if (!(behaviour.hopDistance > 0)) {
            throw new Error(`${where}: "${name}" needs a hopDistance above zero`);
          }
          if (!(behaviour.hopTicks >= 1) || !(behaviour.restTicks >= 0)) {
            throw new Error(
              `${where}: "${name}" needs hopTicks of at least 1 and restTicks of at least 0`,
            );
          }
        }
        if (behaviour.behaviour === 'hopTowardPlayer') {
          if (!(behaviour.backEvery >= 2)) {
            throw new Error(`${where}: "hopTowardPlayer" needs a backEvery of at least 2`);
          }
          if (!(behaviour.restJitter >= 0 && behaviour.restJitter <= 1)) {
            throw new Error(`${where}: "hopTowardPlayer" needs a restJitter from 0 to 1`);
          }
          if (!(behaviour.aimJitterDegrees >= 0 && behaviour.aimJitterDegrees < 90)) {
            throw new Error(
              `${where}: "hopTowardPlayer" needs an aimJitterDegrees from 0 to under 90`,
            );
          }
        }
        if (behaviour.behaviour === 'chargeAtPlayer') {
          // Read through a wider type, as `size` is above: the types say one
          // of two snaps, and a definition is data, which can say anything.
          const snap: string | undefined = behaviour.snap;
          if (snap !== undefined && snap !== 'cardinal' && snap !== 'diagonal') {
            throw new Error(
              `${where}: "chargeAtPlayer" snap "${snap}" is not one of cardinal, diagonal`,
            );
          }
          if (behaviour.maxDistance !== undefined && !(behaviour.maxDistance > 0)) {
            throw new Error(`${where}: "chargeAtPlayer" maxDistance must be above zero`);
          }
          const impact = behaviour.impact;
          if (
            impact !== undefined &&
            (!(impact.bodyDamageMultiplier >= 0) || !(impact.knockback >= 0))
          ) {
            throw new Error(
              `${where}: "chargeAtPlayer" impact needs a bodyDamageMultiplier and knockback of at least zero`,
            );
          }
        }
        if (behaviour.behaviour === 'approachProp') {
          approachPropKind = resolvePropKind(behaviour.propKind, `${where}: "approachProp"`);
        }
        continue;
      }
      if (name === 'meleeArc') {
        const swing = behaviour as MeleeArcBehaviour;
        if (!(swing.arc > 0) || swing.arc > Math.PI * 2) {
          throw new Error(
            `${where}: "meleeArc" needs an arc between 0 and 2π, got ${String(swing.arc)}`,
          );
        }
        if (!(swing.reach > 0)) {
          throw new Error(`${where}: "meleeArc" needs a reach above zero`);
        }
        if (!(swing.damage > 0)) {
          throw new Error(`${where}: "meleeArc" needs damage above zero`);
        }
        if (!(swing.sweepTicks >= 1)) {
          throw new Error(`${where}: "meleeArc" needs sweepTicks of at least 1`);
        }
        if (swing.knockback < 0) {
          throw new Error(`${where}: "meleeArc" knockback must not be negative`);
        }
        meleeArc = {
          arc: swing.arc,
          reach: swing.reach,
          damage: swing.damage,
          knockback: swing.knockback,
          sweepTicks: Math.round(swing.sweepTicks),
          // `-1 | 1` in the authored type; anything else just sweeps oddly, not a crash.
          direction: swing.direction === -1 ? -1 : 1,
          weapon: swing.weapon ?? null,
        };
        continue;
      }
      if (LATCH_BEHAVIOURS.includes(name)) {
        latchesOnPlayer = true;
        continue;
      }
      if (STATE_FLAG_BEHAVIOURS.includes(name)) {
        submerged = true;
        continue;
      }
      if (FIRING_BEHAVIOURS.includes(name)) {
        const shooting = behaviour as FiringBehaviour;
        if (!(shooting.everyTicks >= 1)) {
          throw new Error(`${where}: "${name}" needs everyTicks of at least 1`);
        }
        if (shooting.behaviour === 'fireRing') {
          if (!(shooting.shots >= 1)) {
            throw new Error(`${where}: "fireRing" needs at least one shot`);
          }
          if (shooting.aimCardinal === true) {
            throw new Error(
              `${where}: "fireRing" fires a full ring at nothing in particular — ` +
                `"aimCardinal" has nothing to snap`,
            );
          }
        }
        if (shooting.behaviour === 'fireOnBeat' && shooting.aimCardinal === true) {
          throw new Error(
            `${where}: "fireOnBeat" fires a full ring at nothing in particular — ` +
              `"aimCardinal" has nothing to snap`,
          );
        }
        firing.push(shooting);
        continue;
      }
      if (ENTRY_BEHAVIOURS.includes(name)) {
        if (behaviour.behaviour === 'telegraph') {
          telegraphTicks = Math.max(telegraphTicks, behaviour.ticks);
        } else if (behaviour.behaviour === 'becomeInvulnerable') {
          invulnerableTicks = Math.max(invulnerableTicks, behaviour.ticks);
        } else if (behaviour.behaviour === 'grabProp') {
          if (!(behaviour.reach > 0)) {
            throw new Error(`${where}: "grabProp" needs a reach above zero`);
          }
          grabProp = {
            kind: resolvePropKind(behaviour.propKind, `${where}: "grabProp"`),
            reach: behaviour.reach,
          };
        } else if (behaviour.behaviour === 'lobTarget') {
          capturesLobTarget = true;
        } else if (behaviour.behaviour === 'detonateLobbedBomb') {
          if (!(behaviour.damage > 0) || !(behaviour.radius > 0)) {
            throw new Error(`${where}: "detonateLobbedBomb" needs damage and radius above zero`);
          }
          detonate = { damage: behaviour.damage, radius: behaviour.radius };
        } else if (behaviour.behaviour === 'emitCloud') {
          if (!(behaviour.radius > 0)) {
            throw new Error(`${where}: "emitCloud" needs a radius above zero`);
          }
          if (behaviour.growTicks !== undefined && !(behaviour.growTicks >= 0)) {
            throw new Error(`${where}: "emitCloud" growTicks must not be negative`);
          }
          if (behaviour.lifetimeTicks !== undefined && !(behaviour.lifetimeTicks >= 1)) {
            throw new Error(`${where}: "emitCloud" needs lifetimeTicks of at least 1`);
          }
          emitCloud = {
            radius: behaviour.radius,
            growTicks: behaviour.growTicks === undefined ? -1 : Math.round(behaviour.growTicks),
            lifetimeTicks:
              behaviour.lifetimeTicks === undefined ? -1 : Math.round(behaviour.lifetimeTicks),
          };
        }
        continue;
      }
      if (SUMMON_BEHAVIOURS.includes(name) && behaviour.behaviour === 'summon') {
        const summon = behaviour;
        const child = this.byId.get(summon.enemyId);
        if (child === undefined) {
          throw new Error(`${where} summons "${summon.enemyId}", which is not an enemy id`);
        }
        if (summon.enemyId === definition.id) {
          throw new Error(`${where} summons itself, which never stops. Summon a smaller enemy.`);
        }
        if (!(summon.everyTicks >= 1)) {
          throw new Error(`${where}: "summon" needs everyTicks of at least 1`);
        }
        if (!(summon.countPerWave >= 1)) {
          throw new Error(`${where}: "summon" needs countPerWave of at least 1`);
        }
        if (!(summon.maxActive >= 1)) {
          throw new Error(`${where}: "summon" needs maxActive of at least 1`);
        }
        summons.push({
          definition: child,
          everyTicks: Math.round(summon.everyTicks),
          countPerWave: Math.round(summon.countPerWave),
          maxActive: Math.round(summon.maxActive),
          spread: summon.spread ?? 14,
        });
        continue;
      }
      if (PROP_DROP_BEHAVIOURS.includes(name) && behaviour.behaviour === 'dropProp') {
        const drop = behaviour;
        if (!(drop.everyTicks >= 1)) {
          throw new Error(`${where}: "dropProp" needs everyTicks of at least 1`);
        }
        if (!(drop.maxActive >= 1)) {
          throw new Error(`${where}: "dropProp" needs maxActive of at least 1`);
        }
        if (!(drop.health > 0)) {
          throw new Error(`${where}: "dropProp" needs health above zero`);
        }
        propDrops.push({
          kind: resolvePropKind(drop.propKind, `${where}: "dropProp"`),
          everyTicks: Math.round(drop.everyTicks),
          maxActive: Math.round(drop.maxActive),
          health: drop.health,
          radius: drop.radius ?? 6,
          behind: drop.behind ?? 12,
        });
        continue;
      }
      if (DEATH_BEHAVIOURS.includes(name) && behaviour.behaviour === 'splitOnDeath') {
        const into = this.byId.get(behaviour.into);
        if (into === undefined) {
          throw new Error(`${where} splits into "${behaviour.into}", which is not an enemy id`);
        }
        if (behaviour.into === definition.id) {
          throw new Error(
            `${where} splits into itself, which never stops. Split into a smaller enemy.`,
          );
        }
        const atHealthBelow = behaviour.atHealthBelow ?? 0;
        if (atHealthBelow < 0 || atHealthBelow > 1) {
          throw new Error(
            `${where} has atHealthBelow of ${String(atHealthBelow)}, which is not a fraction between 0 and 1`,
          );
        }
        let healthWithoutPropKind = -1;
        let healthWithoutPropHealth = 0;
        if (behaviour.healthWithoutProp !== undefined) {
          if (!(behaviour.healthWithoutProp.health > 0)) {
            throw new Error(
              `${where}'s "splitOnDeath" healthWithoutProp must have health above zero, got ` +
                String(behaviour.healthWithoutProp.health),
            );
          }
          healthWithoutPropKind = resolvePropKind(
            behaviour.healthWithoutProp.propKind,
            `${where}: "splitOnDeath" healthWithoutProp`,
          );
          healthWithoutPropHealth = behaviour.healthWithoutProp.health;
        }
        splits.push({
          definition: into,
          count: behaviour.count,
          spread: behaviour.spread ?? 6,
          atHealthBelow,
          healthWithoutPropKind,
          healthWithoutPropHealth,
        });
        continue;
      }
      throw new Error(`${where} uses the unknown behaviour "${name}"`);
    }

    if (movement === null) {
      throw new Error(
        `${where} declares no movement behaviour. Every state states where the body goes; ` +
          `use "pause" for one that stands still, so a state that forgot is not mistaken ` +
          `for a turret.`,
      );
    }

    const transitions: CompiledTransition[] = (state.transitions ?? []).map((transition) => {
      const to = stateIndexByName.get(transition.to);
      if (to === undefined) {
        throw new Error(
          `${where} transitions to "${transition.to}", which is not one of its states`,
        );
      }
      if ('after' in transition) {
        const after = transition.after;
        if (typeof after === 'number') {
          return {
            trigger: TransitionTrigger.After,
            value: after,
            to,
            propKind: -1,
            tolerance: 0,
            max: after,
          };
        }
        if (!(after.min >= 0) || !(after.max >= after.min)) {
          throw new Error(
            `${where}: a ranged "after" needs 0 <= min <= max, got ${String(after.min)}..${String(after.max)}`,
          );
        }
        return {
          trigger: TransitionTrigger.After,
          value: Math.round(after.min),
          to,
          propKind: -1,
          tolerance: 0,
          max: Math.round(after.max),
        };
      }
      if ('onHit' in transition) {
        return {
          trigger: TransitionTrigger.OnHit,
          value: 0,
          to,
          propKind: -1,
          tolerance: 0,
          max: 0,
        };
      }
      if ('onBlocked' in transition) {
        return {
          trigger: TransitionTrigger.OnBlocked,
          value: 0,
          to,
          propKind: -1,
          tolerance: 0,
          max: 0,
        };
      }
      if ('onLatched' in transition) {
        return {
          trigger: TransitionTrigger.OnLatched,
          value: 0,
          to,
          propKind: -1,
          tolerance: 0,
          max: 0,
        };
      }
      if ('onShakenOff' in transition) {
        return {
          trigger: TransitionTrigger.OnShakenOff,
          value: 0,
          to,
          propKind: -1,
          tolerance: 0,
          max: 0,
        };
      }
      if ('whenPlayerWithin' in transition) {
        return {
          trigger: TransitionTrigger.PlayerWithin,
          value: transition.whenPlayerWithin,
          to,
          propKind: -1,
          tolerance: 0,
          max: 0,
        };
      }
      if ('whenPlayerDiagonalAdjacent' in transition) {
        const { distance, tolerance } = transition.whenPlayerDiagonalAdjacent;
        if (!(distance > 0) || !(tolerance >= 0)) {
          throw new Error(
            `${where}: "whenPlayerDiagonalAdjacent" needs a distance above zero and a tolerance of at least zero`,
          );
        }
        return {
          trigger: TransitionTrigger.PlayerDiagonalAdjacent,
          value: distance,
          to,
          propKind: -1,
          tolerance,
          max: 0,
        };
      }
      if ('whenPlayerOnAxis' in transition) {
        const { tolerance } = transition.whenPlayerOnAxis;
        if (!(tolerance >= 0)) {
          throw new Error(`${where}: "whenPlayerOnAxis" needs a tolerance of at least zero`);
        }
        return {
          trigger: TransitionTrigger.PlayerOnAxis,
          value: 0,
          to,
          propKind: -1,
          tolerance,
          max: 0,
        };
      }
      if ('whenPropWithin' in transition) {
        return {
          trigger: TransitionTrigger.PropWithin,
          value: transition.whenPropWithin,
          to,
          propKind: resolvePropKind(transition.prop, `${where}: "whenPropWithin"`),
          tolerance: 0,
          max: 0,
        };
      }
      if ('whenPropBeyond' in transition) {
        return {
          trigger: TransitionTrigger.PropBeyond,
          value: transition.whenPropBeyond,
          to,
          propKind: resolvePropKind(transition.prop, `${where}: "whenPropBeyond"`),
          tolerance: 0,
          max: 0,
        };
      }
      return {
        trigger: TransitionTrigger.PlayerBeyond,
        value: transition.whenPlayerBeyond,
        to,
        propKind: -1,
        tolerance: 0,
        max: 0,
      };
    });

    return {
      name: state.name,
      movement,
      firing,
      aimsAttack:
        movement.behaviour === 'chargeAtPlayer' ||
        meleeArc !== null ||
        firing.some((shot) => shot.behaviour !== 'fireOnBeat' && shot.behaviour !== 'fireRing'),
      telegraphTicks,
      invulnerableTicks,
      capturesLobTarget,
      detonate,
      emitCloud,
      meleeArc,
      latchesOnPlayer,
      submerged,
      rollsDuration: transitions.some(
        (transition) =>
          transition.trigger === TransitionTrigger.After && transition.max > transition.value,
      ),
      approachPropKind,
      grabProp,
      splits,
      summons,
      propDrops,
      transitions,
    };
  }
}

/** A `DESTRUCTIBLE_PROP_KINDS` name to its index, throwing on a typo (`docs/DECISIONS.md` #7). */
function resolvePropKind(name: string, where: string): number {
  const index = propKindIndex(name);
  if (index < 0) {
    throw new Error(`${where} names prop kind "${name}", which is not a destructible prop`);
  }
  return index;
}
