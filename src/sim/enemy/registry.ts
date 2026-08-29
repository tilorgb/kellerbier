import {
  type BehaviourName,
  DEATH_BEHAVIOURS,
  type EnemyBehaviour,
  type EnemyDefinition,
  ENTRY_BEHAVIOURS,
  FIRING_BEHAVIOURS,
  type EnemyState,
  type FireAtPlayerBehaviour,
  type FireBurstBehaviour,
  type FireOnBeatBehaviour,
  type FireSpreadBehaviour,
  MOVEMENT_BEHAVIOURS,
} from './definition.js';
import { ENEMY_PROFILES, ENEMY_SIZE_BY_NAME, type EnemySizeId } from './size.js';
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
} as const;

export type TransitionTriggerId = (typeof TransitionTrigger)[keyof typeof TransitionTrigger];

export interface CompiledTransition {
  readonly trigger: TransitionTriggerId;
  /** Ticks, or a distance in pixels. Unused by the triggers that carry neither. */
  readonly value: number;
  /** Index into the enemy's own state list. */
  readonly to: number;
}

/** A `splitOnDeath` with its target resolved to a definition index. */
export interface CompiledSplit {
  readonly definition: number;
  readonly count: number;
  readonly spread: number;
  /** Fraction of max health that force-triggers the split early. Zero: never. */
  readonly atHealthBelow: number;
}

export type FiringBehaviour =
  FireAtPlayerBehaviour | FireBurstBehaviour | FireSpreadBehaviour | FireOnBeatBehaviour;

/** A `detonateLobbedBomb` resolved and validated once, at compile time. */
export interface CompiledDetonation {
  readonly damage: number;
  readonly radius: number;
}

export interface CompiledState {
  readonly name: string;
  /** Exactly one, guaranteed by validation. */
  readonly movement: EnemyBehaviour;
  readonly firing: readonly FiringBehaviour[];
  /** Ticks of telegraph from the moment the state begins. Zero for none. */
  readonly telegraphTicks: number;
  /** Ticks of invulnerability from the moment the state begins. Zero for none. */
  readonly invulnerableTicks: number;
  /** True for a state whose entry stores the player's position for a later `detonateLobbedBomb` to read (Böllerschmeißer, #156). */
  readonly capturesLobTarget: boolean;
  /** Set for a state whose entry deals area damage at an earlier `lobTarget`'s captured position. `null` for every other state. */
  readonly detonate: CompiledDetonation | null;
  readonly splits: readonly CompiledSplit[];
  readonly transitions: readonly CompiledTransition[];
}

export interface CompiledEnemy {
  readonly id: string;
  readonly name: string;
  readonly size: EnemySizeId;
  readonly radius: number;
  readonly mass: number;
  readonly health: number;
  readonly contactDamage: number;
  readonly initialState: number;
  readonly states: readonly CompiledState[];
  readonly lootTier: 'weak' | 'normal' | 'tough';
  readonly locksRoom: boolean;
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

    return {
      id: definition.id,
      name: definition.name,
      size,
      radius: profile.radius,
      mass: definition.mass ?? profile.mass,
      health: definition.health,
      contactDamage: definition.contactDamage,
      initialState,
      states,
      lootTier: definition.lootTier ?? 'normal',
      locksRoom: definition.locksRoom ?? true,
      deathEffect: compileDeathEffect(definition.deathEffect, where),
    };
  }

  private compileState(
    definition: EnemyDefinition,
    state: EnemyState,
    stateIndexByName: ReadonlyMap<string, number>,
  ): CompiledState {
    const where = `enemy "${definition.id}" state "${state.name}"`;

    let movement: EnemyBehaviour | null = null;
    const firing: FiringBehaviour[] = [];
    const splits: CompiledSplit[] = [];
    let telegraphTicks = 0;
    let invulnerableTicks = 0;
    let capturesLobTarget = false;
    let detonate: CompiledDetonation | null = null;

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
        continue;
      }
      if (FIRING_BEHAVIOURS.includes(name)) {
        const shooting = behaviour as FiringBehaviour;
        if (!(shooting.everyTicks >= 1)) {
          throw new Error(`${where}: "${name}" needs everyTicks of at least 1`);
        }
        firing.push(shooting);
        continue;
      }
      if (ENTRY_BEHAVIOURS.includes(name)) {
        if (behaviour.behaviour === 'telegraph') {
          telegraphTicks = Math.max(telegraphTicks, behaviour.ticks);
        } else if (behaviour.behaviour === 'becomeInvulnerable') {
          invulnerableTicks = Math.max(invulnerableTicks, behaviour.ticks);
        } else if (behaviour.behaviour === 'lobTarget') {
          capturesLobTarget = true;
        } else if (behaviour.behaviour === 'detonateLobbedBomb') {
          if (!(behaviour.damage > 0) || !(behaviour.radius > 0)) {
            throw new Error(`${where}: "detonateLobbedBomb" needs damage and radius above zero`);
          }
          detonate = { damage: behaviour.damage, radius: behaviour.radius };
        }
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
        splits.push({
          definition: into,
          count: behaviour.count,
          spread: behaviour.spread ?? 6,
          atHealthBelow,
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

    const transitions = (state.transitions ?? []).map((transition) => {
      const to = stateIndexByName.get(transition.to);
      if (to === undefined) {
        throw new Error(
          `${where} transitions to "${transition.to}", which is not one of its states`,
        );
      }
      if ('after' in transition) {
        return { trigger: TransitionTrigger.After, value: transition.after, to } as const;
      }
      if ('onHit' in transition) {
        return { trigger: TransitionTrigger.OnHit, value: 0, to } as const;
      }
      if ('onBlocked' in transition) {
        return { trigger: TransitionTrigger.OnBlocked, value: 0, to } as const;
      }
      if ('whenPlayerWithin' in transition) {
        return {
          trigger: TransitionTrigger.PlayerWithin,
          value: transition.whenPlayerWithin,
          to,
        } as const;
      }
      return {
        trigger: TransitionTrigger.PlayerBeyond,
        value: transition.whenPlayerBeyond,
        to,
      } as const;
    });

    return {
      name: state.name,
      movement,
      firing,
      telegraphTicks,
      invulnerableTicks,
      capturesLobTarget,
      detonate,
      splits,
      transitions,
    };
  }
}
