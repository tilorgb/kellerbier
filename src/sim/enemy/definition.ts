import type { EnemySizeName } from './size.js';

/**
 * The shape an enemy is authored in.
 *
 * An enemy is a size, four numbers and a small state machine whose states are
 * built out of named behaviour primitives. That is the whole format, and it is
 * the assumption the rest of the project's schedule rests on: floors 2 to 7 are
 * roughly thirty-five more enemies, and if each of them needs engine work then
 * M6 is where this project stops.
 *
 * Everything here is types only. Content files import them with `import type`
 * — the architecture lint rule in `tools/eslint/architecture.js` allows exactly
 * that and nothing else, so an enemy cannot quietly become code.
 *
 * ## Behaviour scopes
 *
 * A primitive runs at one of three moments, decided by which primitive it is
 * rather than by anything the author writes:
 *
 * - **entry** — once, when the state is entered: `telegraph`, `becomeInvulnerable`
 * - **tick** — every tick the state is current: the movement and firing ones
 * - **death** — when the body dies while in that state: `splitOnDeath`
 *
 * Putting `splitOnDeath` on a *state* rather than on the enemy is what lets a
 * boss split in phase two and not in phase one, which is Die Große Kellerassel
 * (#36) and half the reason the format is shaped this way.
 */

/** Every primitive, by the name content refers to it by. */
export type BehaviourName =
  | 'walkTowardPlayer'
  | 'chargeAtPlayer'
  | 'wander'
  | 'orbitPoint'
  | 'fleeFromPlayer'
  | 'rollBounce'
  | 'pause'
  | 'fireAtPlayer'
  | 'fireBurst'
  | 'fireSpread'
  | 'splitOnDeath'
  | 'becomeInvulnerable'
  | 'telegraph';

/** Walks straight at the player, re-aiming every tick. The floor-one default. */
export interface WalkTowardPlayerBehaviour {
  readonly behaviour: 'walkTowardPlayer';
  /** Pixels per tick, before the global `enemy.speedScale`. */
  readonly speed: number;
}

/**
 * Runs in the direction the player was in when the state began.
 *
 * The direction is locked at entry and never re-aimed, which is the entire
 * point: a charge that follows the player is a charge that punishes nothing.
 * Pair it with a `telegraph` state so the commitment is legible before it
 * starts rather than after it lands.
 */
export interface ChargeAtPlayerBehaviour {
  readonly behaviour: 'chargeAtPlayer';
  readonly speed: number;
}

/** Drifts, picking a new direction on a timer. */
export interface WanderBehaviour {
  readonly behaviour: 'wander';
  readonly speed: number;
  /** Ticks between direction changes. */
  readonly turnEveryTicks: number;
}

/** Circles the point the body was spawned at. */
export interface OrbitPointBehaviour {
  readonly behaviour: 'orbitPoint';
  readonly speed: number;
  /** Pixels from the spawn point the orbit settles at. */
  readonly radius: number;
  readonly clockwise?: boolean;
}

/** Backs away from the player. Kiting enemies, and anything that repositions. */
export interface FleeFromPlayerBehaviour {
  readonly behaviour: 'fleeFromPlayer';
  readonly speed: number;
}

/**
 * Rolls in a fixed direction along one axis, forever, ignoring the player.
 *
 * The direction is entirely the state's own — Rollfass (#35): a barrel that
 * "rolls along one axis, bounces off walls" (`docs/CONTENT_BIBLE.md`). It
 * does not turn on its own; a bounce is authored as a pair of states, one
 * per direction, joined by an `onBlocked` transition each way — the same
 * `ENEMY_FLAG_BLOCKED` signal `chargeAtPlayer`'s own wall-stop already reads,
 * just consumed by content instead of by a special case in this primitive.
 */
export interface RollBounceBehaviour {
  readonly behaviour: 'rollBounce';
  readonly speed: number;
  readonly axis: 'x' | 'y';
  /** Which way along `axis` this state rolls: positive is east/south. */
  readonly direction: 1 | -1;
}

/**
 * Stands still.
 *
 * Every state declares exactly one movement primitive — the registry rejects a
 * state that declares none — so standing still is stated rather than implied.
 * A state that forgot to move is otherwise indistinguishable from a turret.
 */
export interface PauseBehaviour {
  readonly behaviour: 'pause';
}

/** Fields every firing primitive carries. */
export interface FiringBehaviourBase {
  /** Ticks between volleys. The first volley leaves on the tick the state begins. */
  readonly everyTicks: number;
  /** Pixels per tick, before the global `enemy.projectileSpeedScale`. */
  readonly speed: number;
  /** Half-Maß per projectile. */
  readonly damage: number;
  readonly lifetimeTicks: number;
  /** Collider radius. Defaults to the player's own shot size. */
  readonly radius?: number;
}

/** One shot at the player, on a timer. */
export interface FireAtPlayerBehaviour extends FiringBehaviourBase {
  readonly behaviour: 'fireAtPlayer';
}

/** Several shots at the player in quick succession, then the gap. */
export interface FireBurstBehaviour extends FiringBehaviourBase {
  readonly behaviour: 'fireBurst';
  readonly shots: number;
  /** Ticks between the shots inside one burst. */
  readonly gapTicks: number;
}

/** A fan of shots, centred on the player. */
export interface FireSpreadBehaviour extends FiringBehaviourBase {
  readonly behaviour: 'fireSpread';
  readonly shots: number;
  /** Total width of the fan, in radians. */
  readonly arc: number;
}

/** Leaves smaller things behind. The state it is declared on is the one that splits. */
export interface SplitOnDeathBehaviour {
  readonly behaviour: 'splitOnDeath';
  /** The `id` of another enemy definition. */
  readonly into: string;
  readonly count: number;
  /** Pixels from the death point the children appear at. */
  readonly spread?: number;
}

/**
 * Nothing can hurt it while this state is young.
 *
 * Shots still land — they splash off, loudly, because a bullet that vanishes
 * into an invulnerable body reads as the game having dropped it. The window is
 * counted from the moment the state was entered, so a state cannot renew its
 * own invulnerability: to curl again, the body has to uncurl and be hit again.
 */
export interface BecomeInvulnerableBehaviour {
  readonly behaviour: 'becomeInvulnerable';
  readonly ticks: number;
}

/**
 * Says out loud that something is about to happen.
 *
 * Draws a growing ring for the duration, so the state before an attack is
 * readable at a glance. Scaled globally by `enemy.telegraphScale`, which is
 * both a difficulty knob and an accessibility one.
 */
export interface TelegraphBehaviour {
  readonly behaviour: 'telegraph';
  readonly ticks: number;
}

export type EnemyBehaviour =
  | WalkTowardPlayerBehaviour
  | ChargeAtPlayerBehaviour
  | WanderBehaviour
  | OrbitPointBehaviour
  | FleeFromPlayerBehaviour
  | RollBounceBehaviour
  | PauseBehaviour
  | FireAtPlayerBehaviour
  | FireBurstBehaviour
  | FireSpreadBehaviour
  | SplitOnDeathBehaviour
  | BecomeInvulnerableBehaviour
  | TelegraphBehaviour;

/**
 * When a state gives way to another.
 *
 * Transitions are tried in the order they are written and the first match wins,
 * which makes a state machine's behaviour a function of its text rather than of
 * anything the engine decided for it.
 */
export type EnemyTransition =
  /** After this many ticks in the state. */
  | { readonly to: string; readonly after: number }
  /** The body took a hit. Cleared once read, so it fires once per hit. */
  | { readonly to: string; readonly onHit: true }
  /** The body ran into a wall or a block. What stops a charge. */
  | { readonly to: string; readonly onBlocked: true }
  | { readonly to: string; readonly whenPlayerWithin: number }
  | { readonly to: string; readonly whenPlayerBeyond: number };

export interface EnemyState {
  readonly name: string;
  /** Exactly one movement primitive, plus any number of the others. */
  readonly behaviours: readonly EnemyBehaviour[];
  readonly transitions?: readonly EnemyTransition[];
}

export interface EnemyDefinition {
  /** Unique, lower case, no spaces. Used by room templates, loot tables and saves. */
  readonly id: string;
  /** The name a player would see. German, per docs/CONTENT_BIBLE.md. */
  readonly name: string;
  /** Decides the collider radius and, unless overridden, the mass. */
  readonly size: EnemySizeName;
  readonly health: number;
  /** Half-Maß dealt by touching it. Zero for anything that is only in the way. */
  readonly contactDamage: number;
  /** Overrides the size class's mass, for a body unusually heavy for its size. */
  readonly mass?: number;
  /** The `name` of the state it spawns in. */
  readonly initial: string;
  readonly states: readonly EnemyState[];
  /** Which drop table (`content/pickups/drop-tables.ts`) its death rolls from. Defaults to `'normal'`. */
  readonly lootTier?: 'weak' | 'normal' | 'tough';
  /**
   * Whether its presence counts toward `GameSim.roomEnemyCount` — and so
   * toward sealing the room's doors. Defaults to `true`; the shopkeeper
   * (`content/enemies/shopkeeper.ts`) is the one exception today: a shop's
   * doors must not seal just because it stands there peacefully.
   */
  readonly locksRoom?: boolean;
}

/** Primitives that decide where a body goes. Exactly one per state. */
export const MOVEMENT_BEHAVIOURS: readonly BehaviourName[] = [
  'walkTowardPlayer',
  'chargeAtPlayer',
  'wander',
  'orbitPoint',
  'fleeFromPlayer',
  'rollBounce',
  'pause',
];

/** Primitives that run once, when the state is entered. */
export const ENTRY_BEHAVIOURS: readonly BehaviourName[] = ['telegraph', 'becomeInvulnerable'];

/** Primitives that run when the body dies in that state. */
export const DEATH_BEHAVIOURS: readonly BehaviourName[] = ['splitOnDeath'];

/** Primitives that put something in the air. */
export const FIRING_BEHAVIOURS: readonly BehaviourName[] = [
  'fireAtPlayer',
  'fireBurst',
  'fireSpread',
];
