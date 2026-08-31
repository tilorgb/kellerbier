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
  | 'approachProp'
  | 'pause'
  | 'fireAtPlayer'
  | 'fireBurst'
  | 'fireSpread'
  | 'fireOnBeat'
  | 'meleeArc'
  | 'splitOnDeath'
  | 'becomeInvulnerable'
  | 'telegraph'
  | 'grabProp'
  | 'lobTarget'
  | 'detonateLobbedBomb';

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

/**
 * Walks toward the nearest live destructible prop of a named kind, and toward
 * the player when there is no such prop left in the room.
 *
 * The Maibaum-Dieb's opening move (#199): dismounted and unarmed, he heads for
 * the arena's own maypole to pick it up. If the player brought the maypole
 * down during phase one, `propKind`'s target is gone and he chases them
 * instead — which is what routes him into the disarmed dash branch, with no
 * stored "armed" flag anywhere. The fallback is `walkTowardPlayer`'s exact
 * behaviour, so a state using this never needs a separate movement primitive
 * for the "prop is gone" case.
 */
export interface ApproachPropBehaviour {
  readonly behaviour: 'approachProp';
  /** Which destructible prop to head for — a `DESTRUCTIBLE_PROP_KINDS` name. */
  readonly propKind: string;
  /** Pixels per tick, before the global `enemy.speedScale`. */
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
  /**
   * Which projectile sprite this shot is drawn as (#152) — a sprite name
   * under some bucket's `projectiles/` folder (`spore`, `blas-note`, ...).
   * Omitted draws the shooter's floor default, so a new enemy needs nothing
   * here until its shot is worth telling apart from its neighbours'.
   *
   * On the *behaviour* rather than on the enemy, because a creature with two
   * firing states can plausibly fire two different things — the Zapfhahn's
   * drip and its pressurised burst are the same enemy — and because that is
   * where the rest of a shot's authored properties already live.
   *
   * Purely presentational: nothing in `step` reads it, and it is checked
   * against the loaded art at content-test time rather than at spawn time,
   * so a typo fails CI instead of a run.
   */
  readonly art?: string;
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

/**
 * A full ring of shots, timed to `sim.tick` instead of the state's own
 * ticks-in-state counter.
 *
 * Every other firing primitive counts from the moment its state began, which
 * is right for an enemy reacting to the player but wrong for the
 * Blaskapellist (`docs/CONTENT_BIBLE.md`'s Floor 2 roster): its sound rings
 * are supposed to land on the beat of the floor's music, and two
 * Blaskapellisten in the same room have to ring together regardless of when
 * each one entered its firing state. `everyTicks` here means "ticks per
 * beat" against the simulation's one deterministic clock (`sim/time.ts`,
 * `GameSim.tick`) rather than against audio playback position — there is no
 * real audio track yet (`app/audio/ambience.ts`'s stub, M8's job), so this is
 * the clock reference for one to plug into later, already correct today
 * (#37's own notes: "drive it from the tick counter, not from audio playback
 * position").
 */
export interface FireOnBeatBehaviour extends FiringBehaviourBase {
  readonly behaviour: 'fireOnBeat';
  /** Shots evenly spaced around a full circle — a ring, not an aimed fan. */
  readonly shots: number;
}

/**
 * A swept melee attack: a blade (a pole, a bench, a fist) travels a fixed arc
 * over a set number of ticks and hits wherever it actually passes.
 *
 * Deterministic, not a point check: the aim is locked when the state is
 * entered (the same commitment `chargeAtPlayer` makes), then the blade sweeps
 * from `-arc/2` to `+arc/2` around that aim over `sweepTicks`, and each tick it
 * only threatens the thin wedge it is crossing *right now*. A player already
 * behind the swing, or one the blade has passed, is not hit — standing inside
 * the arc's footprint is not the same as being caught by it. It connects at
 * most once per swing because the blade crosses any given angle exactly once.
 * Pair it with a `telegraph` state for the wind-up.
 *
 * Reusable and scale-free: the Maibaum-Dieb swings the stolen maypole with a
 * big one (#199); a future Wiesn mob might swipe a Bierbank with a small one.
 * Damage and knockback go through the same `Contact` event a body touching the
 * player raises, so a swing reads like everything else that hits you. `weapon`
 * names which sprite the renderer swings along the blade (`render/`), or is
 * omitted for an unarmed swipe that only the telegraph shows.
 */
export interface MeleeArcBehaviour {
  readonly behaviour: 'meleeArc';
  /** Total angle the blade travels, in radians (≈ `Math.PI / 2` for a 90° swipe). */
  readonly arc: number;
  /** Blade length from the body, in pixels. */
  readonly reach: number;
  /** Half-Maß dealt to a player the blade passes through. */
  readonly damage: number;
  /** Outward shove on hit, on top of the standard contact knockback. */
  readonly knockback: number;
  /** Ticks the blade takes to travel the whole arc. */
  readonly sweepTicks: number;
  /** `-1` sweeps anticlockwise, `1` clockwise (screen space). Defaults to `1`. */
  readonly direction?: -1 | 1;
  /** Which held-weapon sprite the renderer swings, e.g. `'maibaum'`. Omitted: telegraph only. */
  readonly weapon?: string;
}

/** Leaves smaller things behind. The state it is declared on is the one that splits. */
export interface SplitOnDeathBehaviour {
  readonly behaviour: 'splitOnDeath';
  /** The `id` of another enemy definition. */
  readonly into: string;
  readonly count: number;
  /** Pixels from the death point the children appear at. */
  readonly spread?: number;
  /**
   * Forces the split early, at this fraction (0 exclusive, 1 inclusive) of
   * max health, instead of waiting for the body to actually reach zero.
   *
   * Die Große Kellerassel's (#36) phase two: the same primitive Schimmelfleck
   * dies with, just triggered by a health gate rather than by combat finally
   * landing the last hit. Declare it on every state the body might be in when
   * the threshold is crossed — not only the one it is likeliest to be in —
   * since the split reads off whichever state was current at the moment.
   */
  readonly atHealthBelow?: number;
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

/**
 * On state entry, takes the nearest live destructible prop of a named kind
 * that is within `reach` — the prop entity is removed from the room.
 *
 * The Maibaum-Dieb picking up the maypole (#199). A no-op when there is no
 * such prop in range, which is the whole of the disarmed branch: he reaches
 * an empty patch of ground, grabs nothing, and the state machine carries on
 * into the dash states. Once a prop is taken it is gone for the rest of the
 * fight — the swing states never transition back to `approachProp`.
 */
export interface GrabPropBehaviour {
  readonly behaviour: 'grabProp';
  /** Which destructible prop to take — a `DESTRUCTIBLE_PROP_KINDS` name. */
  readonly propKind: string;
  /** How close the prop has to be, in pixels, to be grabbed. */
  readonly reach: number;
}

/**
 * Remembers where the player is standing, right now, for a
 * `detonateLobbedBomb` later in the same state machine to read.
 *
 * Böllerschmeißer (#156, `docs/CONTENT_BIBLE.md` §2 — "the throw is
 * readable, the landing spot is marked") is the enemy this exists for: a
 * lobbed bomb has to land where the player *was* when it left the thrower's
 * hand, not wherever they have moved to by the time it goes off, or the
 * telegraph lied. Declared on the state the throw itself begins (the same
 * state as its own `telegraph`, typically), stored in the body's own
 * `enemyMotion` heading fields — safe to reuse them for an absolute
 * position rather than a direction, since a state that captures a lob
 * target moves with `pause` and never reads them as a heading.
 */
export interface LobTargetBehaviour {
  readonly behaviour: 'lobTarget';
}

/**
 * The other half of `lobTarget`: on entry, deals area damage at the
 * position an earlier `lobTarget` in this state machine captured, through
 * `GameSim.applySplashDamage` — the same chokepoint the player's own
 * Böllerschmeißer item detonates through, so an enemy's bomb and the
 * player's own read identically.
 */
export interface DetonateLobbedBombBehaviour {
  readonly behaviour: 'detonateLobbedBomb';
  readonly damage: number;
  readonly radius: number;
}

export type EnemyBehaviour =
  | WalkTowardPlayerBehaviour
  | ChargeAtPlayerBehaviour
  | WanderBehaviour
  | OrbitPointBehaviour
  | FleeFromPlayerBehaviour
  | RollBounceBehaviour
  | ApproachPropBehaviour
  | PauseBehaviour
  | FireAtPlayerBehaviour
  | FireBurstBehaviour
  | FireSpreadBehaviour
  | FireOnBeatBehaviour
  | MeleeArcBehaviour
  | SplitOnDeathBehaviour
  | BecomeInvulnerableBehaviour
  | GrabPropBehaviour
  | LobTargetBehaviour
  | DetonateLobbedBombBehaviour
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
  | { readonly to: string; readonly whenPlayerBeyond: number }
  /**
   * The nearest live destructible prop of `prop` is within this many pixels.
   * Never fires when no such prop is left in the room — which is how the
   * Maibaum-Dieb (#199) tells "walk to the maypole and grab it" from "there
   * is no maypole, go for the player instead".
   */
  | { readonly to: string; readonly whenPropWithin: number; readonly prop: string }
  /**
   * The nearest live prop of `prop` is *beyond* this many pixels — and, in
   * particular, always fires when there is no such prop at all (distance
   * treated as infinite). The Maibaum-Dieb drops into his disarmed chase the
   * instant the player destroys the maypole he was walking toward (#199).
   */
  | { readonly to: string; readonly whenPropBeyond: number; readonly prop: string };

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
  /**
   * What this creature comes apart into when it dies (#153) — one of
   * `DEATH_EFFECT_KINDS`' names (`splash`, `spore`, `shard`, `dust`, `ember`).
   *
   * Defaults to `splash`, which is beer, which is what every death in the game
   * threw before this. Authored rather than switched on by id so floor 3's
   * roster picks one without an engine change; purely presentational, so it
   * can never change what a run does.
   */
  readonly deathEffect?: string;
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
  'approachProp',
  'pause',
];

/** Primitives that run once, when the state is entered. */
export const ENTRY_BEHAVIOURS: readonly BehaviourName[] = [
  'telegraph',
  'becomeInvulnerable',
  'grabProp',
  'lobTarget',
  'detonateLobbedBomb',
];

/** Primitives that run when the body dies in that state. */
export const DEATH_BEHAVIOURS: readonly BehaviourName[] = ['splitOnDeath'];

/** Primitives that put something in the air. `meleeArc` (#199) is handled on its own, not here. */
export const FIRING_BEHAVIOURS: readonly BehaviourName[] = [
  'fireAtPlayer',
  'fireBurst',
  'fireSpread',
  'fireOnBeat',
];
