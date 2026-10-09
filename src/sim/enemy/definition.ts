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
 * - **entry** — once, when the state is entered: `telegraph`, `becomeInvulnerable`, `emitCloud`
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
  | 'hopCardinal'
  | 'hopTowardPlayer'
  | 'swimInZone'
  | 'approachWood'
  | 'returnToPerch'
  | 'flyLoops'
  | 'fireAtPlayer'
  | 'fireRing'
  | 'fireBurst'
  | 'fireSpread'
  | 'fireOnBeat'
  | 'meleeArc'
  | 'splitOnDeath'
  | 'summon'
  | 'dropProp'
  | 'becomeInvulnerable'
  | 'phaseShift'
  | 'telegraph'
  | 'grabProp'
  | 'lobTarget'
  | 'detonateLobbedBomb'
  | 'emitCloud'
  | 'latchOnPlayer'
  | 'submerge'
  | 'land'
  | 'ride'
  | 'rideToLineStart'
  | 'rideLine'
  | 'glideToPoint'
  | 'fireRotatingRing'
  | 'fireSweep'
  | 'fireBeam'
  | 'captureLine'
  | 'lobVolley'
  | 'detonateVolley'
  | 'leaveArena'
  | 'dropPickupOnDeath'
  | 'rollLog'
  | 'becomeProp'
  | 'shoal'
  | 'slalom'
  | 'burrow';

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
  /**
   * Snaps the locked direction to the nearest of the four axes (`'cardinal'`)
   * or the four diagonals (`'diagonal'`) — the Kaninchen's pawn capture
   * (#407) leaps only diagonally, the Boar (#409) only along the axes. The
   * wind-up's telegraph line snaps with it, so the warning and the leap never
   * disagree. Omitted: straight at the locked aim, as before.
   */
  readonly snap?: 'cardinal' | 'diagonal';
  /**
   * The charge goes *over* the room's blocks instead of stopping at them
   * (#40, the Steinbock: an ibex climbs what is in its way). Furniture,
   * water and pits are crossed the way a `flying` body crosses them; only
   * the room's walls stop it (`onBlocked`). The renderer lifts the body
   * while it is over a block, so the climb reads as a bound rather than a
   * clip. Omitted: a block stops the charge, as every other charger's does.
   */
  readonly climbsBlocks?: true;
  /**
   * Room units the charge covers before the body stops for the rest of the
   * state, measured as speed × ticks (a wall stopping it early is
   * `onBlocked`'s business). Turns a run-until-the-wall charge into a short
   * leap (#407). Omitted: no limit.
   */
  readonly maxDistance?: number;
  /**
   * Stops on the point it was aimed at — the player's position as the
   * charge began (`updateAimLock` keeps that point current through the
   * wind-up) — and raises `onArrived` there, rather than running on until a
   * wall stops it (#411, the Specht's dive). A wall met first still stops it
   * with `onBlocked`. Unlike `maxDistance` the length is not authored: it is
   * however far away the player was.
   */
  readonly untilTargetPoint?: true;
  /**
   * What reaching that point does (#411, the Specht's beak hitting the
   * floor): everything within `radius` room units of it — the player
   * included, any other body too — takes `damage` (elite-scaled), once. With
   * `untilTargetPoint` only. The wind-up before such a dive marks this exact
   * circle on the floor instead of a direction line, following the player
   * until the dive begins and staying there through it, so where it lands is
   * the warning — and, with `contactDamage: 0`, the only place it hurts.
   */
  readonly landing?: { readonly radius: number; readonly damage: number };
  /**
   * What the charge does to the first thing it runs into (#409, the Boar).
   * Each tick, before moving, it looks one step ahead along its locked
   * direction; the first thing there takes the hit and the charge ends
   * (`onBlocked` fires next tick), never ploughing through a second:
   *
   * - **a body** — the player *or another enemy* — takes `contactDamage ×
   *   bodyDamageMultiplier` (elite-scaled) and is thrown `knockback` room
   *   units per tick along the charge. The one place enemies hurt each
   *   other: baiting a charge into the crowd is meant to be a tactic.
   * - **a destructible block**, with `breaksBlocks`: smashed, through the
   *   same path a bomb takes, so it stays gone on a revisit.
   * - **the room's edge at a door**, with `breaksDoors`: a secret wall opens
   *   exactly as a bomb opens it; a closed door is smashed open — passable
   *   for the rest of the floor even while the room is uncleared. Never in a
   *   boss or mini-boss room.
   * - **anything else** (a plain wall): just stops it.
   *
   * Omitted: the charge runs into things the way it always has.
   */
  readonly impact?: {
    readonly bodyDamageMultiplier: number;
    readonly knockback: number;
    readonly breaksBlocks: boolean;
    readonly breaksDoors: boolean;
    /**
     * Only the player is hit (#467, Bieber's rolling log): another enemy in the
     * way is left to the physics, so a log shoved from beside its own beaver
     * does not stop dead against him. Omitted: any body, as the Boar.
     */
    readonly playerOnly?: boolean;
    /**
     * The hit does not end the roll (#467): the body takes its damage and its
     * knockback and keeps going, wall to wall. The player is carried along by
     * the contact separation and, pinned against the wall at the end of the
     * lane, is popped out sideways (`contact.ts`). Omitted: the hit ends it, as
     * the Boar's dash does.
     */
    readonly continues?: boolean;
  };
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
  /**
   * Head for the prop standing *closest to the player's row* instead of the one
   * nearest the body (#467, Bieber): the log whose roll will actually cross the
   * player's lane. Unset: the nearest prop, as the Maibaum-Dieb wants.
   */
  readonly nearestToPlayerRow?: boolean;
  /**
   * Stop this many pixels short of the prop, on the side facing the room's
   * middle, instead of walking into it (#467): with the logs now solid and in
   * one line along the wall, walking at a log's centre meant walking into the
   * logs beside it. Unset: straight at the prop's centre, as the Maibaum-Dieb.
   */
  readonly standoff?: number;
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

/**
 * Small random hops along the four axes — never toward the player, never
 * diagonally (#407, the Kaninchen: a rabbit that moves like a chess pawn).
 *
 * The state's own ticks run in cycles of `hopTicks + restTicks`. At the start
 * of each cycle a direction is drawn from `random.enemies`; one whose landing
 * spot would be inside a wall or an obstacle is passed over for the next of
 * the four in turn, and with none clear the body rests through the cycle.
 * It then covers `hopDistance` over `hopTicks`, quickest mid-hop (a sine
 * ease, so the four-way motion reads as hops rather than as sliding), and
 * stands still for `restTicks`. The renderer bobs the body over the hop
 * (`enemyHopProgress`).
 *
 * `whenPlayerDiagonalAdjacent` only fires while resting, so an attack never
 * starts in the middle of a hop.
 */
export interface HopCardinalBehaviour {
  readonly behaviour: 'hopCardinal';
  /** Room units per hop, before the global `enemy.speedScale`. */
  readonly hopDistance: number;
  /** Ticks a hop takes. */
  readonly hopTicks: number;
  /** Ticks standing still between hops. */
  readonly restTicks: number;
}

/**
 * Tiny hops straight at the player, with every `backEvery`-th hop straight
 * away from them instead — the Zecke: two hops in, one hop back, a skittish
 * creep that still closes the distance, with a shot window on every hop back.
 *
 * A sine-eased hop like `hopCardinal`'s (the same renderer bob), but aimed
 * at any angle and never in step with its neighbours — a room of them must
 * read as bugs hopping about, not a hivemind:
 *
 * - **Rests are rolled.** Each rest, and the wait before the first hop, is
 *   `restTicks` give or take `restJitter` of it, from `random.enemies`, so
 *   no two ticks keep the same beat for long.
 * - **Aim wobbles.** Each hop's direction is the line to (or from) the
 *   player on the tick it starts, turned by up to `aimJitterDegrees` either
 *   way — so it never curves mid-air, and never quite beelines either.
 *
 * A hop whose landing would be in a wall or an obstacle tries 45° and then
 * 90° either side of its line before resting a hop out. The hop's direction
 * goes into the heading slots, which is what a `facing: 'crawl'` body turns
 * its head to.
 */
export interface HopTowardPlayerBehaviour {
  readonly behaviour: 'hopTowardPlayer';
  /** Room units per hop, before the global `enemy.speedScale`. */
  readonly hopDistance: number;
  /** Ticks a hop takes. */
  readonly hopTicks: number;
  /** Ticks standing still between hops, on average. */
  readonly restTicks: number;
  /** How far a rest is rolled either side of `restTicks`, as a fraction of it: `1` is anywhere from 0 to double. 0 to 1. */
  readonly restJitter: number;
  /** The most a hop's direction turns off the straight line, either way. */
  readonly aimJitterDegrees: number;
  /** Which hop of each run goes away from the player: `3` is toward, toward, away. At least 2. */
  readonly backEvery: number;
}

/**
 * Swims along the water it lives in, and never leaves it (#408, the
 * Bachforelle). `zone` names which water: `'waldbach'` is Floor 3's stream
 * (#403), and is the only zone today, so a future water creature reuses this
 * by naming its own.
 *
 * It follows the stream's own centreline (`RoomGeometry.streamCourses`, the
 * line the renderer draws the water along): pick a random point further up or
 * down the course from the `random.enemies` stream, swim there sample by
 * sample, pick again. Walking the centreline rather than straight at a point
 * is what keeps a meandering stream's fish in the water round its bends. A
 * body knocked out of the water anyway is put back on the nearest point of
 * the course the same tick (`stepZoneClamp`).
 *
 * An enemy with any `swimInZone` state is a water creature from its spawn:
 * it is placed at the nearest point of the stream, and in a room with no
 * stream at all it is not spawned — logged once in a dev build, never
 * counted toward the room's clear (`CLAUDE.md`'s graceful content gap; the
 * content suite holds authored rooms to always having the water).
 */
export interface SwimInZoneBehaviour {
  readonly behaviour: 'swimInZone';
  readonly zone: 'waldbach';
  /** Room units per tick, before the global `enemy.speedScale`. */
  readonly speed: number;
}

/**
 * Goes for wood and eats it (#410, the Borkenkäfer — a bark-beetle swarm). It
 * ignores the player entirely: contact damage is what makes it dangerous, the
 * room getting worse is what makes it urgent.
 *
 * It takes turns between two kinds of meal. One is the nearest tile of a
 * wooden destructible block (a log, a stump, a barricade — `blockMaterial`):
 * one tile, never the whole merged run it is part of. The other is the
 * nearest floor plank that passes the pit softlock guard
 * (`sim/systems/pits.ts`) — on a wooden floor only (`FloorConfig
 * .woodenFloor`) and under the room's pit cap. Cover first, then a plank,
 * then cover again; when the kind whose turn it is has nothing to offer, it
 * eats the other. With nothing eligible at all it wanders.
 *
 * Arrived, it eats for `eatTicks` — `obstacle` against a block, `plank`
 * sitting on a floor tile — and the renderer darkens the target and throws
 * chewing splinters for the length of it (`enemyEatProgress`), so the plank
 * about to go is the one the swarm is sitting on, visibly going. A tile of
 * cover eaten is broken the way the Boar breaks one and stays gone on a revisit;
 * a plank eaten is a pit, which stays too. The guard is asked again on the
 * last tick (a pickup or a body may have moved in meanwhile); a plank it
 * refuses there is left whole and the swarm looks for another.
 */
export interface ApproachWoodBehaviour {
  readonly behaviour: 'approachWood';
  /** Room units per tick, before the global `enemy.speedScale`. */
  readonly speed: number;
  /** Ticks of eating it takes to finish a wooden block, and a floor plank. */
  readonly eatTicks: { readonly obstacle: number; readonly plank: number };
}

/**
 * Flies back to the room's wall and perches there (#411, the Specht): to the
 * *nearest* point of the wall from wherever it is now, not necessarily the
 * perch it started on — unpredictable from one dive to the next, readable
 * within one. Straight there, over furniture, water and pits alike (it is
 * a `flying` body), then `onArrived` fires.
 *
 * A body with any `returnToPerch` state is a percher from its spawn: it is
 * put on the nearest wall point the moment it appears, facing into the room.
 */
export interface ReturnToPerchBehaviour {
  readonly behaviour: 'returnToPerch';
  /** Room units per tick, before the global `enemy.speedScale`. */
  readonly speed: number;
}

/**
 * Flies small wavy loops about a point that drifts through the room (the
 * Specht, between leaving its wall and diving). The loop is `radius` across
 * give or take `wobble`, which swells and shrinks it three times a turn so the
 * path waves rather than draws a clean ring; the point it loops about drifts
 * at `drift` room units a tick in a direction re-rolled now and then, turning
 * back off walls. It does not follow the player — a transition such as
 * `whenPlayerWithin` is what turns a flyer's loops into an attack.
 *
 * Entered off a wall, the loop starts a little way into the room; entered
 * from another `flyLoops` state, it carries on the loop it was on.
 */
export interface FlyLoopsBehaviour {
  readonly behaviour: 'flyLoops';
  /** Room units per tick along the loop, before the global `enemy.speedScale`. */
  readonly speed: number;
  /** The loop's radius, in room units. */
  readonly radius: number;
  /** How far the radius swells and shrinks either way, in room units. */
  readonly wobble: number;
  /** Room units per tick the loop's centre drifts. */
  readonly drift: number;
}

/**
 * On the floor while this state is current (#411, the Specht with its beak
 * stuck in a plank). Means something only for a `flying` body, which is
 * otherwise drawn up in the air: this is the state it is down on the ground,
 * within reach — the hit window. Presentational, like the rest of how a
 * body is drawn; what makes it the hit window is that it is paused there.
 */
export interface LandBehaviour {
  readonly behaviour: 'land';
}

/**
 * Under the surface while this state is current (#408, the Bachforelle):
 * nothing can touch it — no shot, no splash, no contact, no body pushes
 * against it — and it is drawn as a shadow under the water.
 *
 * Not `becomeInvulnerable`, which keeps the body there and makes shots splash
 * off it loudly: a submerged fish is simply not there to hit, and shots pass
 * over the water as though nothing is. Leaving a submerged state for one
 * without it is the fish breaking the surface, and throws a splash.
 */
export interface SubmergeBehaviour {
  readonly behaviour: 'submerge';
}

/**
 * Rides fast, erratic straight lines and never steers toward the player
 * (#412, Der Waldradler: a trail biker who goes where he likes).
 *
 * Not `wander`: a ride keeps its heading, turns abruptly every
 * `turnEveryTicks` — a fixed count, or `{ min, max }` rolled from
 * `random.enemies` at each turn, so the rhythm cannot be learnt — and
 * **bounces**: a step that would end inside a wall or an obstacle reflects the
 * blocked component of the heading instead. The new heading is a uniformly
 * random angle: nothing about it reads the player's position, which is the
 * whole point.
 */
export interface RideBehaviour {
  readonly behaviour: 'ride';
  /** Room units per tick, before the global `enemy.speedScale`. */
  readonly speed: number;
  /** Ticks between abrupt turns. */
  readonly turnEveryTicks: number | { readonly min: number; readonly max: number };
}

/**
 * Rides in a straight line to the start end of the line a `captureLine`
 * stored (#412), ignoring the player, and raises `onArrived` there. The start
 * end is whichever of the line's two ends was nearer the body at capture.
 */
export interface RideToLineStartBehaviour {
  readonly behaviour: 'rideToLineStart';
  /** Room units per tick, before the global `enemy.speedScale`. */
  readonly speed: number;
}

/**
 * Rides the captured line edge to edge (#412) and raises `onArrived` on
 * reaching the end it is heading for: `direction: 1` runs from the start end
 * to the far end, `-1` back the other way. The pass the body makes *through*
 * the room — whoever stands on the line is hit by contact damage as usual.
 * Needs a `captureLine` earlier in the same state machine.
 */
export interface RideLineBehaviour {
  readonly behaviour: 'rideLine';
  readonly speed: number;
  readonly direction: 1 | -1;
}

/**
 * Glides to a point over exactly `ticks` ticks of the state (#413): each tick
 * the body covers a share of what is left of the way, so it arrives on the last
 * tick whatever distance it started at, and raises `onArrived` there. A fixed
 * *duration* rather than a speed, because the Waldradl rolls to the arena
 * centre from wherever the Waldradler died and its invulnerable intro has to be
 * the same length every fight.
 */
export interface GlideToPointBehaviour {
  readonly behaviour: 'glideToPoint';
  /** `'roomCentre'`: the middle of the room's interior bounds. */
  readonly point: 'roomCentre';
  readonly ticks: number;
}

/**
 * A ring of shots whose gaps turn slowly (#413, Das Waldradl): the same ring
 * `fireRing` fires, with `gaps` left out of it and the whole pattern — ring and
 * gaps together — turning `rotationPerVolley` radians every volley.
 *
 * **Fully deterministic, no RNG**: volley *n* of a state is the ring turned by
 * exactly `n × rotationPerVolley`, counted from the state's entry, so the
 * pattern is the same in every fight and can be learnt. A gap is `width`
 * consecutive slots of the `shots` evenly spaced ones left unfired, centred on
 * the slot nearest `at` (radians, east 0, clockwise on screen) — a constant
 * number of slots whatever the rotation, which a gap defined as an angular
 * window would not be.
 *
 * `minSafeDistance` is where the corridor is narrowest that matters: the
 * registry rejects a pattern whose gap, measured between the two shots either
 * side of it at that distance from the body, is narrower than the player's
 * diameter plus the shot's own plus a margin (`registry.ts`). A pattern nobody
 * can stand in fails the build, not a run.
 */
export interface FireRotatingRingBehaviour extends FiringBehaviourBase {
  readonly behaviour: 'fireRotatingRing';
  /** Shots evenly spaced around a full circle, before the gaps take theirs out. */
  readonly shots: number;
  /** Radians the whole pattern turns by each volley. Positive is clockwise on screen. */
  readonly rotationPerVolley: number;
  readonly gaps: readonly { readonly at: number; readonly width: number }[];
  /** Room units from the body's centre at which a gap must still be passable. */
  readonly minSafeDistance: number;
}

/**
 * On entry, stores a straight line across the room through the player's
 * position, randomly horizontal or vertical (`random.enemies`), edge to edge
 * (#412). The body's own radius is kept off the walls: the line runs between
 * the two spots its centre can reach. The state that carries it also shows the
 * line's two ramps, rising over its telegraph; the states that ride it keep them
 * up (`rideToLineStart`, `rideLine`, `leaveArena`) and the first state without
 * any of those sinks them.
 *
 * The line is built for an arena without obstacles on it (`wald-boss` is an
 * open clearing): a block across it stops the ride, and the content's
 * `onBlocked` fallbacks are what keep that from being a softlock.
 */
export interface CaptureLineBehaviour {
  readonly behaviour: 'captureLine';
}

/**
 * On entry, picks landing points *around* the player and remembers them
 * (#412, the wrapper volley): `count` of them (a number, or `{ min, max }` rolled
 * from `random.enemies`), evenly spaced on a ring of `ringRadius` room units
 * about the player's position, the whole ring turned by a random angle. A
 * point that would land in a wall or off the room is replaced by its
 * reflection through the player, and failing that clamped inside — so the
 * volley is always inside the room and never on top of the player. At most
 * `VOLLEY_MAX_POINTS` points. The state's own telegraph is the flight: a marker
 * on the floor at every point, and an arc to it, until the state ends.
 * `detonateVolley` reads the points back.
 */
export interface LobVolleyBehaviour {
  readonly behaviour: 'lobVolley';
  readonly count: number | { readonly min: number; readonly max: number };
  readonly ringRadius: number;
}

/** What each point of a `detonateVolley` throws out. */
export interface VolleyBurst {
  readonly shots: number;
  readonly speed: number;
  readonly damage: number;
  readonly lifetimeTicks: number;
  readonly radius?: number;
  readonly art?: string;
  readonly poison?: boolean;
}

/**
 * On entry, at every point an earlier `lobVolley` captured: a poison cloud
 * (`cloud`, as `emitCloud`) and a ring of `burst.shots` projectiles flying
 * outward in all directions, poisoned if `burst.poison` (#412).
 *
 * It does **not** call `triggerExplosion`: a wrapper is litter, not a bomb, and
 * must never open a secret wall the way a Böller does. It is not splash damage
 * either — the cloud and the ring are the whole of it.
 */
export interface DetonateVolleyBehaviour {
  readonly behaviour: 'detonateVolley';
  readonly cloud: {
    readonly radius: number;
    readonly growTicks?: number;
    readonly lifetimeTicks?: number;
  };
  readonly burst: VolleyBurst;
}

/**
 * Off the arena while this state is current (#412, the Waldradler jumping off
 * his ramp): untargetable — no shot, no splash, no contact, no shove — and not
 * drawn. The state flag `submerge` is for a fish under the water; this is the
 * same removal without the water. Like the line it belongs to, it keeps the
 * ramps up: they are the telegraph of where he comes back.
 */
export interface LeaveArenaBehaviour {
  readonly behaviour: 'leaveArena';
}

/**
 * When the body dies in this state, a pickup appears at the death point (#412):
 * the Maß dropped at the Waldradler's transition so the player can cleanse
 * before the bullet-hell phase. Declared on every state the body might die in,
 * as `splitOnDeath` is. `pickup` is a pickup id; one that is not a pickup fails
 * the content test, not a run.
 */
export interface DropPickupOnDeathBehaviour {
  readonly behaviour: 'dropPickupOnDeath';
  readonly pickup: string;
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
  /**
   * What the roll does to the first thing it runs into — `chargeAtPlayer`'s
   * `impact`, unchanged (#467: a pushed log hits the player as hard as a Boar's
   * dash, and ends the roll against it). Omitted: Rollfass's plain bounce.
   */
  readonly impact?: NonNullable<ChargeAtPlayerBehaviour['impact']>;
  /**
   * Holds the body on the row (`axis: 'x'`) or column it started the state on,
   * every tick (#467): whatever shoves it — a contact, a blast, another body —
   * the lane it was shoved along is not left. Rollfass, which is shoved off its
   * line by design, leaves it unset.
   */
  readonly fixedLane?: boolean;
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
  /**
   * Fire only straight along one of the four axes — north, south, east or
   * west — whichever the target is most along, instead of straight at it.
   * The Zapfhahn: a tap in a wall sprays down the room's axes, which makes
   * the safe ground readable at a glance. A fan (`fireSpread`) is centred on
   * the snapped axis. Not allowed on `fireOnBeat`, which aims at nothing.
   */
  readonly aimCardinal?: boolean;
  /**
   * Aim a fan *off the side* of the way the body was last moving instead of at
   * the player (#40, the Skier's drift-stop): `'left'`/`'right'` a quarter turn
   * off the remembered heading, `'random'` either, drawn from the enemy stream
   * when the shot leaves. Not gated on sight — it is aimed at nothing. Only on
   * `fireSpread`.
   */
  readonly aimSide?: 'left' | 'right' | 'random';
  /**
   * The shot poisons the player on a hit (#401): `ProjectileTag.Poison`, so
   * the player takes `playerPoisonDamagePerTick` every
   * `playerPoisonTickInterval` ticks for `playerPoisonDurationTicks`. A second
   * hit refreshes the duration and never stacks; drinking a Maß is the only
   * cure. Omitted is a plain shot. Whether it *reads* as poison on screen is
   * the `art`'s business — the tag alone tints it green.
   */
  readonly poison?: boolean;
  /**
   * The shot bounces off walls and off what it hits (#40, the Sennerin's
   * cheese wheel): `ProjectileTag.Bouncing`, with the same bounce budget the
   * player's own bouncing shots get (`tuning.projectileTags.bounceMaxCount`).
   * A rolling wheel that comes back off the wall is a second thing to dodge
   * from the one throw. Omitted is a plain shot.
   */
  readonly bounce?: boolean;
  /**
   * The shot freezes the player on a hit (#40, the Snow cannon): `ProjectileTag.Freezing`,
   * so Alois is all but rooted for `tuning.projectileTags.playerFreezeDurationTicks`
   * (he can still shoot) and then immune for the freeze cooldown. Omitted is a plain shot.
   */
  readonly freeze?: boolean;
  /**
   * The shot bursts into `tuning.projectileTags.burstFragments` freezing clods where it
   * ends — on a hit, a wall, or the end of its flight (#40, the Snow cannon).
   * `ProjectileTag.Bursting`. Omitted is a plain shot.
   */
  readonly burst?: boolean;
  /**
   * The shot flies to the spot it was aimed at and ends there, rather than on
   * a timer (#40, the Snow cannon): its flight is cut to exactly the distance to
   * the aim, so with `burst` the splash lands where the player stood when the
   * wind-up locked — dangerous on that spot, and only that spot. `lifetimeTicks`
   * is still the cap. Only on `fireAtPlayer`.
   */
  readonly landAtTarget?: boolean;
  /**
   * The shot *marks* the player on a hit (#40, the Bergwacht's flare):
   * `ProjectileTag.Marking`, so for `tuning.projectileTags.playerMarkDurationTicks`
   * every enemy in the room sees them through cover (`isSighted` is true)
   * and fires that much faster (`tuning.enemy.markedFireIntervalScale`). A
   * second hit refreshes the duration and never stacks. The flare's whole
   * job is the mark — authored with little damage of its own. Omitted is a
   * plain shot.
   */
  readonly mark?: boolean;
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
  /**
   * Ticks this body's beat sits *after* the bar line, so several bodies
   * sharing one `everyTicks` ring on different beats instead of together
   * (#277, Die Blaskapelle). Defaults to 0 — the downbeat, which is where
   * every `fireOnBeat` enemy before this one fired.
   *
   * Offsetting the *clock*, not the state machine, is the whole point: the
   * three Blaskapellisten of the mini-boss are three separate bodies with
   * separate state timers, and anything counted from "when this body entered
   * its state" would drift with when each one happened to spawn. Read against
   * `sim.tick` like the beat itself, so an eighth-note behind the tuba stays
   * an eighth-note behind it for the whole fight, and killing one leaves a
   * *hole* in the bar rather than slowing the bar down.
   */
  readonly beatOffset?: number;
}

/**
 * A full ring of shots, timed from the moment its state began (#408).
 *
 * `fireOnBeat`'s ring without the beat: `fireOnBeat` fires on the global
 * clock so a room of Blaskapellisten ring together; this fires when its own
 * state says so, which is what a creature reacting to something needs. The
 * Bachforelle breaks the surface and fires four, one down each diagonal
 * (`shots: 4, angleOffset: π/4`); Das Waldradl (#413) reuses it. Aims at
 * nothing, so it is not gated on sight and `aimCardinal` has no meaning on it.
 */
export interface FireRingBehaviour extends FiringBehaviourBase {
  readonly behaviour: 'fireRing';
  /** Shots evenly spaced around a full circle. */
  readonly shots: number;
  /** Radians the whole ring is turned by; the first shot leaves at this angle (east is 0). Defaults to 0. */
  readonly angleOffset?: number;
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

/**
 * A laser (#40, the Summit cross, the Mountain hare, The First Human's eyes): an
 * instant line from the body, dangerous for `beamTicks` after the state is
 * entered. There is no projectile to outrun — the dodge is being off the line
 * while it is lit, which is what the `telegraph` state before it is for.
 *
 * `mode` says which line: `'aim'` along the bearing locked on entry (the wind-up
 * before it locks it, exactly as a `meleeArc` blade's aim is locked); `'row'`
 * both ways along the body's own horizontal line, aim ignored; `'axis'` along
 * whichever of the four cardinal lines the locked aim is nearest to — the
 * crossed line, toward the player. Every beam runs on until a wall or a block
 * stops it (the same terrain a shot dies on), so a boulder is real shelter.
 *
 * A hit costs `damage` once (the player's contact i-frames cover the rest of the
 * beam) and, with `freeze`, freezes them. Not gated on sight: a committed beam
 * goes where it was aimed.
 */
export interface FireBeamBehaviour {
  readonly behaviour: 'fireBeam';
  readonly mode: 'aim' | 'row' | 'axis';
  /** Ticks the line stays lit after the state is entered. */
  readonly beamTicks: number;
  /** Half the beam's thickness, in room units: the player is hit within this plus their own radius. */
  readonly halfWidth: number;
  readonly damage: number;
  /** The hit freezes the player (`tuning.projectileTags.playerFreezeDurationTicks`). Omitted: it does not. */
  readonly freeze?: boolean;
}

/**
 * A swept *ranged* attack (#437, The First Human): an arm travels a fixed arc
 * over `sweepTicks`, exactly as `meleeArc`'s blade does, and every
 * `shotEveryTicks` a bullet leaves along the arm's current bearing. The
 * result is a fan of shots laid down one bearing at a time rather than all at
 * once — so the safe ground is *behind* the sweep: a player who has already
 * been passed by the arm has nothing more coming their way from this swing,
 * and one ahead of it can see where the next shot will be before it leaves.
 *
 * Same commitment as the blade: the aim is locked on the tick the state is
 * entered (and, with a `telegraph` state before it, on the tick that wind-up
 * began), the arm then runs from `-arc/2` to `+arc/2` around that aim, and
 * nothing re-aims mid-swing. `direction` is the pendulum: a boss alternating
 * `-1` and `1` from swing to swing reads as a left-right-left stalk, and the
 * telegraph before each swing is the stance that says which way is next.
 * Not gated on sight — a committed swing goes where it was aimed, and the
 * arena's cover is what the shots run into.
 *
 * Shots carry `FiringBehaviourBase`'s projectile fields (speed, damage,
 * lifetime, radius, art, poison/bounce/mark). `everyTicks` is replaced by
 * `shotEveryTicks`, counted from the swing's first tick, which also fires.
 */
export interface FireSweepBehaviour extends Omit<
  FiringBehaviourBase,
  'everyTicks' | 'aimCardinal'
> {
  readonly behaviour: 'fireSweep';
  /** Total angle the arm travels, in radians. */
  readonly arc: number;
  /** Ticks the arm takes to travel the whole arc. */
  readonly sweepTicks: number;
  /** Ticks between shots along the arc. The first leaves on the swing's first tick. */
  readonly shotEveryTicks: number;
  /** `-1` sweeps anticlockwise, `1` clockwise (screen space). Defaults to `1`. */
  readonly direction?: -1 | 1;
  /**
   * How far out the `telegraph` before this state draws its warning arc, in
   * pixels. Presentational only — the shots fly `speed × lifetimeTicks`
   * regardless. Defaults to three body radii.
   */
  readonly telegraphReach?: number;
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
  /**
   * Spawns the child at reduced health when no live prop of `propKind`
   * remains in the room at the moment of the split, instead of `into`'s own
   * authored `health` (#260).
   *
   * Der Stier's own case: `der-stier-maibaum-dieb` spawns at his full
   * authored health if the maypole he is about to grab (`der-stier.ts`'s
   * `PHASE_TWO_SPLIT`, `content/enemies/der-stier.ts`'s `approachProp`) is
   * still standing, and at `health` here if the player already brought it
   * down during phase one. A disarmed dieb falls into the shorter
   * `chase`/`dash` branch rather than the melee one — "the Dieb is sad" is
   * meant to read as a quicker fight, not the same one on foot.
   */
  readonly healthWithoutProp?: {
    /** A `DESTRUCTIBLE_PROP_KINDS` name — the same prop the split's target chases. */
    readonly propKind: string;
    readonly health: number;
  };
}

/**
 * Spawns more of a smaller enemy while alive, on a timer — the live-body
 * counterpart to `splitOnDeath`, which only ever fires once, on death.
 *
 * Der Rattenkönig (#276) is the enemy this exists for: he sits in the middle
 * of his arena and does not chase, and the whole fight is target priority —
 * the room is survivable forever and unwinnable until the player stops
 * shooting the Bierratten and starts shooting the thing making them. This
 * primitive is that "thing making them."
 *
 * `maxActive` is the entire fairness knob. A wave is skipped, not queued,
 * whenever `maxActive` of `enemyId` are already alive anywhere in the room —
 * so the pressure plateaus instead of compounding into an unclearable screen,
 * and a player who is keeping up with the adds never faces a fresh wave on
 * top. Children are spawned exactly as `splitOnDeath`'s are: never elite,
 * off the same `random.enemies` stream, so a replay reproduces the run.
 *
 * Declared on a *state* (like every behaviour), which is what lets a summoner
 * pause its spawning during a telegraphed "screech" beat and resume it after
 * — the same reason `splitOnDeath` is per-state.
 */
export interface SummonBehaviour {
  readonly behaviour: 'summon';
  /** The `id` of another enemy definition — the thing spawned. Never itself. */
  readonly enemyId: string;
  /** Ticks between waves. The first wave leaves on the tick the state begins. */
  readonly everyTicks: number;
  /** How many to spawn per wave, subject to the `maxActive` cap. */
  readonly countPerWave: number;
  /** No wave spawns while this many of `enemyId` are already alive in the room. */
  readonly maxActive: number;
  /** Pixels from the summoner the children appear at. Defaults to a body-length out. */
  readonly spread?: number;
}

/**
 * Leaves a solid, destructible prop behind it on a timer — the terrain
 * counterpart to `summon`, which grows the room's *bodies*.
 *
 * Der Ladewagen (#277) is the enemy this exists for: it drives its circuit
 * and sheds hay bales out the back, and the bales are `Obstacle`-layer props
 * exactly like an authored barrel — so they block the player's shots *and*
 * the Ladewagen's own line back, and the arena quietly fills with cover the
 * player built by not killing the thing fast enough. A soft timer made of
 * geometry rather than a hidden clock.
 *
 * `maxActive` is the same fairness knob `summon` carries, and matters more
 * here: a prop, unlike a body, never walks away or dies of its own accord, so
 * an uncapped dropper eventually walls a player into a corner they cannot
 * shoot out of. A drop is skipped, not queued, once the cap is met, and one
 * that would land inside a wall or on top of the player is skipped too.
 *
 * `propKind` names a `DESTRUCTIBLE_PROP_KINDS` entry, resolved at
 * construction (`docs/DECISIONS.md` #7): a typo fails the build.
 */
export interface DropPropBehaviour {
  readonly behaviour: 'dropProp';
  /** Which destructible prop to leave — a `DESTRUCTIBLE_PROP_KINDS` name. */
  readonly propKind: string;
  /** Ticks between drops. The first drop lands on the tick the state begins. */
  readonly everyTicks: number;
  /** No drop lands while this many of `propKind` are already standing in the room. */
  readonly maxActive: number;
  /** The dropped prop's own health — how long it takes the player to clear a lane back. */
  readonly health: number;
  /** The prop's drawn radius, in pixels. Defaults to the barrel's. */
  readonly radius?: number;
  /**
   * How far *behind* the body it lands, along the direction it is travelling.
   * Defaults to a body-length out. A stationary dropper leaves it underfoot.
   */
  readonly behind?: number;
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
 * A boss changing phase, made impossible to miss (#437): on the tick the
 * state is entered the room hears the split sting (`EventKind.EnemySplit`,
 * the same cue a body coming apart makes) and the camera shudders for
 * `shake` pixels. Presentation only — it changes nothing a run does. Put it on
 * the state a `whenHealthBelow` transition leads to, beside its invulnerable
 * beat, so the shift and the quiet moment arrive together.
 */
export interface PhaseShiftBehaviour {
  readonly behaviour: 'phaseShift';
  /** Screen shake in pixels. Omitted: 4. */
  readonly shake?: number;
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
 * On state entry, takes the nearest live prop of `propKind` within `reach` and
 * sets a rolling body going from where it lay (#467, Bieber): the log he
 * shoves across the room.
 *
 * The prop is removed exactly as `grabProp` removes one, and `east` or `west`
 * (another enemy's `id`, resolved at construction) is spawned in its place,
 * whichever lies on the player's side of it. Two definitions rather than one
 * with a direction because a body's rolling direction is its state's, not its
 * spawner's (`rollBounce`). A no-op when no such prop is in range.
 */
export interface RollLogBehaviour {
  readonly behaviour: 'rollLog';
  /** Which destructible prop to roll — a `DESTRUCTIBLE_PROP_KINDS` name. */
  readonly propKind: string;
  /** How close the prop has to be, in pixels, to be rolled. */
  readonly reach: number;
  /** The rolling body spawned when the player is east of the prop. */
  readonly east: string;
  /** The rolling body spawned when the player is west of the prop. */
  readonly west: string;
}

/**
 * On state entry, the body stops being an enemy and becomes a destructible
 * prop where it stands (#467, Bieber's log coming to rest against the wall).
 *
 * The inverse of `grabProp`: no death, no loot, nothing for `splitOnDeath` to
 * react to. Meant for a body with `locksRoom: false`, which was never counted
 * into the room, so removing it needs no bookkeeping. The prop appears where
 * the body stood, with no clearance check: the body came to rest there under
 * the room's own collision.
 */
export interface BecomePropBehaviour {
  readonly behaviour: 'becomeProp';
  /** Which destructible prop to become — a `DESTRUCTIBLE_PROP_KINDS` name. */
  readonly propKind: string;
  /** The prop's own health. */
  readonly health: number;
  /** The prop's drawn radius, in pixels. Defaults to the body's own. */
  readonly radius?: number;
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

/**
 * On state entry, leaves a poison cloud (#401) at the body's position: a
 * circle that grows from nothing to `radius` over `growTicks`, lingers until
 * `lifetimeTicks` have passed in total, and refreshes poison on the player
 * every tick they stand inside it. It poisons only the player, never other
 * enemies. `growTicks` and `lifetimeTicks` default to
 * `tuning.poisonCloud`'s; `radius` is in room units and has no default.
 */
export interface EmitCloudBehaviour {
  readonly behaviour: 'emitCloud';
  readonly radius: number;
  readonly growTicks?: number;
  readonly lifetimeTicks?: number;
}

/**
 * Grabs on to the player on touch and rides along (#406, the Zecke).
 *
 * Every tick the state carrying it is current, a body that is touching the
 * player — footprints within `tuning.latch.latchReach` of each other — attaches:
 * from then on it sits on Alois's boots at the side it came from, follows him
 * exactly, refreshes his poison every tick (`tuning.projectileTags`'
 * `playerPoisonDurationTicks`, the same refresh a cloud gives), and deals no
 * contact damage beyond that. The latch outlives the state that made it — it
 * is a property of the body, not of the state — and ends only when the player
 * shakes it off: `tuning.latch.shakeTurnDegrees` of quick turning of the
 * movement input — any direction change counts, a wiggle or a circle — throw
 * off every latched body at once (`sim/systems/latch.ts`).
 *
 * **Not shootable while latched.** A latched body drops to no collision layer
 * at all, so neither shots, splash, nor the player's own body touch it: the
 * player's shots would have to hit their own feet, which no aim can do, and a
 * bomb that cleared a tick off you by blowing you up too is a worse lesson
 * than "shake it". The answer is to shake it off — and the body that hits the
 * ground afterwards is the reward.
 *
 * Pair it with an `onLatched` transition to a state that `pause`s, and an
 * `onShakenOff` from there to whatever it does on the floor.
 */
export interface LatchOnPlayerBehaviour {
  readonly behaviour: 'latchOnPlayer';
}

/**
 * Moves as one of a shoal (#40, the Kuhglocke: a floating swarm of cowbells).
 *
 * Each tick the body's heading turns toward a blend of three pulls: the
 * centre of every live body of its own kind in the room (`cohesion`), the
 * player (`pull`), and away from any shoal-mate closer than `spacing` room
 * units — then it moves at `speed`. The heading carries over between ticks
 * (`inertia`, 0..1, how much of last tick's heading survives), so a shoal
 * swings and wheels rather than snapping, and a lone bell left over simply
 * drifts at the player. Deterministic, no RNG: the shoal is a function of
 * where everyone is. Meant for a `flying` body, so a shoal crosses furniture;
 * contact damage is what makes it dangerous.
 */
export interface ShoalBehaviour {
  readonly behaviour: 'shoal';
  /** Room units per tick, before the global `enemy.speedScale`. */
  readonly speed: number;
  /** Weight of the pull toward the shoal's centre. At least 0. */
  readonly cohesion: number;
  /** Weight of the pull toward the player. At least 0. */
  readonly pull: number;
  /** Room units below which two shoal-mates push apart. At least 0. */
  readonly spacing: number;
  /** How much of last tick's heading survives into this one, 0 (none) to 1 (never turns). */
  readonly inertia: number;
}

/**
 * Carves down the room in long S-turns (#40, the Skier): a base heading,
 * re-rolled every `legTicks` toward the room's middle (± a wide random
 * spread, so a skier crosses the room rather than hugging a wall), with the
 * actual heading swinging up to `swing` radians either side of it on a sine of
 * `periodTicks` — a slalom, not a random walk. It never steers at the player.
 * The heading it leaves is what a `pause`d state after it still remembers,
 * which is how a drift-stop knows which way it was going.
 */
export interface SlalomBehaviour {
  readonly behaviour: 'slalom';
  /** Room units per tick, before the global `enemy.speedScale`. */
  readonly speed: number;
  /** Peak angle either side of the base heading, in radians. */
  readonly swing: number;
  /** Ticks for one full S (left and back). */
  readonly periodTicks: number;
  /** Ticks between new base headings. */
  readonly legTicks: number;
}

/**
 * Under the ground while this state is current (#40, the Murmeltier):
 * nothing can touch it — no shot, no splash, no contact — it crosses the
 * room's furniture as a flyer does (it is *under* it), and it is drawn as a
 * moving mound of snow, the `<id>-shadow` art if the creature ships one.
 * Leaving a burrowed state for one without it is the body breaking the
 * surface, and throws a puff of snow.
 *
 * `submerge`'s shape without the water: a fish needs a stream to be under,
 * a marmot digs wherever it stands. Pair the surfacing with a `telegraph`
 * before it — the whistle — so where it comes up is a warning, not a trap.
 */
export interface BurrowBehaviour {
  readonly behaviour: 'burrow';
}

export type EnemyBehaviour =
  | WalkTowardPlayerBehaviour
  | ShoalBehaviour
  | SlalomBehaviour
  | BurrowBehaviour
  | ChargeAtPlayerBehaviour
  | WanderBehaviour
  | OrbitPointBehaviour
  | FlyLoopsBehaviour
  | FleeFromPlayerBehaviour
  | RollBounceBehaviour
  | ApproachPropBehaviour
  | PauseBehaviour
  | HopCardinalBehaviour
  | HopTowardPlayerBehaviour
  | SwimInZoneBehaviour
  | ApproachWoodBehaviour
  | SubmergeBehaviour
  | ReturnToPerchBehaviour
  | LandBehaviour
  | FireRingBehaviour
  | FireRotatingRingBehaviour
  | FireAtPlayerBehaviour
  | FireBurstBehaviour
  | FireSpreadBehaviour
  | FireOnBeatBehaviour
  | MeleeArcBehaviour
  | FireSweepBehaviour
  | FireBeamBehaviour
  | SplitOnDeathBehaviour
  | SummonBehaviour
  | DropPropBehaviour
  | BecomeInvulnerableBehaviour
  | PhaseShiftBehaviour
  | GrabPropBehaviour
  | RollLogBehaviour
  | BecomePropBehaviour
  | LobTargetBehaviour
  | DetonateLobbedBombBehaviour
  | EmitCloudBehaviour
  | LatchOnPlayerBehaviour
  | RideBehaviour
  | RideToLineStartBehaviour
  | RideLineBehaviour
  | GlideToPointBehaviour
  | CaptureLineBehaviour
  | LobVolleyBehaviour
  | DetonateVolleyBehaviour
  | LeaveArenaBehaviour
  | DropPickupOnDeathBehaviour
  | TelegraphBehaviour;

/**
 * When a state gives way to another.
 *
 * Transitions are tried in the order they are written and the first match wins,
 * which makes a state machine's behaviour a function of its text rather than of
 * anything the engine decided for it.
 */
export type EnemyTransition =
  /**
   * After this many ticks in the state — or, given `{ min, max }`, after a
   * whole number of ticks between the two (inclusive), rolled from
   * `random.enemies` each time the state is entered (#408: the Bachforelle
   * surfaces at random). Every ranged `after` on one state reads the same
   * roll, placed within its own range, so two of them cannot disagree about
   * which comes first by luck alone.
   */
  | {
      readonly to: string;
      readonly after: number | { readonly min: number; readonly max: number };
    }
  /**
   * After `after` ticks — as above — to **one of several** states, chosen at
   * random by weight from `random.enemies` (#412: the Waldradler picks an attack).
   * `maxInARow`, when set, stops the same choice being taken more than that many
   * times in a row: a per-body counter of the last state this kind of transition
   * chose and how often running, shared by every `toOneOf` of the body, so a
   * choice already taken `maxInARow` times is simply left out of the draw. Every
   * weight above zero; at least two choices.
   */
  | {
      readonly toOneOf: readonly { readonly to: string; readonly weight: number }[];
      readonly after: number | { readonly min: number; readonly max: number };
      readonly maxInARow?: number;
    }
  /** The body took a hit. Cleared once read, so it fires once per hit. */
  | { readonly to: string; readonly onHit: true }
  /** The body ran into a wall or a block. What stops a charge. */
  | { readonly to: string; readonly onBlocked: true }
  /**
   * A target-seeking movement reached its target this tick (#411): a
   * `returnToPerch` landing on the wall, a `chargeAtPlayer` with
   * `untilTargetPoint` reaching the point it was aimed at. Like `onHit`,
   * cleared once read.
   */
  | { readonly to: string; readonly onArrived: true }
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
  | { readonly to: string; readonly whenPropBeyond: number; readonly prop: string }
  /**
   * Fires on the tick the body latches on to the player (#406) — see
   * `latchOnPlayer`. Like `onHit`, cleared once read.
   */
  | { readonly to: string; readonly onLatched: true }
  /**
   * Fires on the tick after the player shook the body off (#406). Like
   * `onHit`, cleared once read, so a body shaken off while in a state that
   * does not listen for it simply stays where the state machine put it.
   */
  | { readonly to: string; readonly onShakenOff: true }
  /**
   * The player stands about one step away on one of the four diagonals —
   * their offset from the body lies within `tolerance` room units of
   * `(±distance, ±distance)`. A pawn's capture square (#407, the Kaninchen).
   * Never fires mid-hop on a `hopCardinal` state, and never through cover.
   */
  | {
      readonly to: string;
      readonly whenPlayerDiagonalAdjacent: {
        readonly distance: number;
        readonly tolerance: number;
      };
    }
  /**
   * The player's centre is within `tolerance` room units of one of the
   * body's four axis lines — straight north, east, south or west of it — and
   * in sight along it (#409, the Boar's trigger: you crossed its line). Sight
   * is the same test `whenPlayerWithin` uses, run only once the cheap axis
   * test has passed.
   */
  | { readonly to: string; readonly whenPlayerOnAxis: { readonly tolerance: number } }
  /**
   * The player's centre crossed the body's horizontal line since the last tick —
   * went from the north of it to the south, or back (#40, the Summit cross).
   * A one-tick event: a state that is not listening that tick misses it, which
   * is what makes a rest state a cooldown. Not gated on sight; the beam it
   * starts is stopped by cover on its own.
   */
  | { readonly to: string; readonly whenPlayerCrossesRow: true }
  /**
   * The body's health is at or below this fraction (0 exclusive, 1
   * inclusive) of its max (#437): a phase change on a health threshold that
   * does not kill and respawn the body the way `splitOnDeath.atHealthBelow`
   * does, so the boss bar, the elite roll and the position carry over. Like
   * `atHealthBelow`, declare it on every state the body might be in when the
   * threshold is crossed. It is read before any other trigger on the same
   * state only if written first — declaration order still decides.
   */
  | { readonly to: string; readonly whenHealthBelow: number };

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
  /**
   * Flies (#411, the Specht): crosses the room's furniture, its water and its
   * pits — everything `RoomGeometry` flags `blockOverflyable`, plus every
   * stream and pit — and is stopped only by the room's walls and the grid
   * cells its shape never claimed. The rule König Ludwig's crown already
   * gives the player (#47, `sim/systems/movement.ts`), for an enemy. Drawn up
   * in the air, except in a state that `land`s.
   */
  readonly flying?: boolean;
  /**
   * Rooted to its spot — the Fliegenpilz in the ground, the Bachforelle in its
   * stream, the Specht on its wall: no shove moves it. A shot's knockback, a
   * blast, the Boar's impact, Der Ordner's shove all go through `addPush`, and
   * `addPush` drops them for a rooted body. Its own movement is untouched — a
   * rooted Specht still flies and dives, it just isn't knocked about doing it.
   */
  readonly rooted?: boolean;
  /**
   * Shots do nothing to it (#467, Bieber's rolling log): every projectile — the
   * player's or an enemy's — splashes off, loudly, exactly as off a curled-up
   * shell, and only an explosion (a bomb, a splash blast) hurts it. Unlike
   * `becomeInvulnerable` it has no window: it is the body's nature, not a state.
   */
  readonly shotProof?: boolean;
  /**
   * Other enemies neither push it nor are pushed by it (#467, Bieber's rolling
   * log): the separation between enemy bodies skips it, so a log shoved from
   * beside its own beaver rolls through the room's other bodies instead of
   * ploughing them across it. The player is not an enemy and still gets hit.
   */
  readonly ignoresBodies?: boolean;
  /**
   * A localisation key (`enemies.<id>.title`), same convention
   * `ItemDefinition.flavourText` uses — resolved by the render layer, never
   * read directly here. The boss intro plate's middle line (#58/#327); unset
   * for everything that isn't a boss, since nothing else shows one.
   */
  readonly title?: string;
  /**
   * A localisation key (`enemies.<id>.epithet`), same convention as `title`
   * above. The boss intro plate's bottom line — the one line on the plate
   * actually meant to be read as a sentence, same reasoning
   * `FloorTitleCard`'s own flavour line gives for staying in the text face
   * rather than the display one.
   */
  readonly epithet?: string;
  /**
   * A localisation key (`enemies.<id>.line`), same convention as `title`
   * above — a villager's one-liner (#58/#330), shown in a `TextPlate` toast
   * the first time this enemy type is encountered in a run. Unset for
   * everything without one; only an enemy standing in for an ordinary
   * Oberniederburg resident (`bauer`, today) carries it. `docs/CONTENT_BIBLE.md`
   * §0's tone rule applies directly: an NPC who genuinely prefers the new
   * Pfeitinger, not written as a fool or a victim.
   */
  readonly line?: string;
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
  /**
   * Draws `<id>-phase-two` art instead of its own once health is at or
   * below this fraction (0 exclusive, 1 inclusive) of max (#437): The First
   * Human's strip without the arrowhead in his shoulder, from the moment he
   * pulls it out. The same frame count and clips as the body's own strip,
   * since the animator keeps indexing frames across the swap. Purely
   * presentational, like `deathEffect`: it can never change what a run does,
   * and an enemy without the suffixed strip keeps its own art.
   */
  readonly phaseArtBelow?: number;
  /**
   * How the body itself shows a telegraph, on top of the floor shape every
   * telegraph draws (#405). Unset: the body looks the same while it winds up,
   * which is right for nearly everything — the floor shape is the warning.
   *
   * `'bloat'` swells the sprite over the countdown and glows it green over
   * the last third, then lets it snap back as the state ends: the Fliegenpilz
   * puffing up before it deflates in a poison cloud. A render option rather
   * than authored frames so it works on the placeholder blob and on any
   * future cloud-emitter alike, and an emissive glow rather than a multiply
   * tint so it still reads in a lantern-dark room (#404). Purely
   * presentational, like `deathEffect`: it can never change what a run does.
   *
   * `'drum'` is the Specht's drumming (#411): the body hammers back and forth
   * on the spot and throws wood chips for the whole countdown — the half of
   * the warning that works with the sound off, drawn through the darkness
   * like every telegraphing body. Its own wind-up sound comes through the
   * impact audio seam (`content/audio/sfx.ts`'s `ENEMY_WINDUP_SFX`).
   */
  readonly telegraphLook?: 'bloat' | 'drum';
  /**
   * How a body with no animation strip turns to show where it is going.
   * Purely presentational, like `telegraphLook`.
   *
   * - `'mirror'` — a side-view sprite (authored facing left, like all
   *   character art) flips to face the way it moves, and toward the player
   *   while it stands still: the Boar and the Kaninchen, so a wind-up always
   *   points at whom it is about to hit.
   * - `'crawl'` — a top-down sprite (head at the top of the canvas) lies flat
   *   on the floor, turned in quarter turns so its head points the way it is
   *   heading: the Zecke.
   *
   * - `'fixed'` — drawn as authored and never mirrored, *even with an
   *   animation strip*: a body with one view that does not turn to left or
   *   right (The First Human, seen from the front; only his arms swing).
   *
   * Omitted: drawn as authored, never turned. A body with an animation strip
   * faces through its animator regardless.
   */
  readonly facing?: 'mirror' | 'crawl' | 'fixed';
  /** Which drop table (`content/pickups/drop-tables.ts`) its death rolls from. Defaults to `'normal'`. */
  readonly lootTier?: 'weak' | 'normal' | 'tough' | 'none';
  /**
   * Whether its presence counts toward `GameSim.roomEnemyCount` — and so
   * toward sealing the room's doors. Defaults to `true`; the shopkeeper
   * (`content/enemies/shopkeeper.ts`) is the one exception today: a shop's
   * doors must not seal just because it stands there peacefully.
   */
  readonly locksRoom?: boolean;
  /**
   * Whether this body's health feeds the top-of-screen boss/mini-boss bar
   * (`GameSim.bossHealth`, `render/boss-health-hud.ts`). Defaults to `false`.
   *
   * Set on a boss, a mini-boss, and the smaller bodies a boss splits *into*
   * that are still "the boss" (Die Große Kellerassel's segments) — never on
   * an add. Der Rattenkönig (#276) is why this is a flag rather than just
   * `locksRoom`: his summoned Bierratten lock the room like any enemy, but
   * the bar tracks the king, and a bar that jumped up every time a rat
   * spawned would read as losing ground for doing the right thing.
   */
  readonly bossBar?: boolean;
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
  'hopCardinal',
  'hopTowardPlayer',
  'swimInZone',
  'approachWood',
  'returnToPerch',
  'flyLoops',
  'ride',
  'rideToLineStart',
  'rideLine',
  'glideToPoint',
  'shoal',
  'slalom',
];

/** Primitives that run once, when the state is entered. */
export const ENTRY_BEHAVIOURS: readonly BehaviourName[] = [
  'telegraph',
  'becomeInvulnerable',
  'phaseShift',
  'grabProp',
  'rollLog',
  'becomeProp',
  'lobTarget',
  'detonateLobbedBomb',
  'emitCloud',
  'captureLine',
  'lobVolley',
  'detonateVolley',
];

/** Primitives that mark the whole state rather than doing anything in it (#408). */
export const STATE_FLAG_BEHAVIOURS: readonly BehaviourName[] = [
  'submerge',
  'land',
  'leaveArena',
  'burrow',
];

/** Primitives that run when the body dies in that state. */
export const DEATH_BEHAVIOURS: readonly BehaviourName[] = ['splitOnDeath', 'dropPickupOnDeath'];

/** Most landing points one `lobVolley` can capture: the body's fixed per-body storage (#412). */
export const VOLLEY_MAX_POINTS = 4;

/** Primitives that spawn more bodies on a timer while alive (#276). */
export const SUMMON_BEHAVIOURS: readonly BehaviourName[] = ['summon'];

/** Primitives that leave solid props behind on a timer while alive (#277). */
export const PROP_DROP_BEHAVIOURS: readonly BehaviourName[] = ['dropProp'];

/** Primitives that run every tick alongside the movement one, without being one (#406). */
export const LATCH_BEHAVIOURS: readonly BehaviourName[] = ['latchOnPlayer'];

/** Primitives that put something in the air. `meleeArc` (#199) is handled on its own, not here. */
export const FIRING_BEHAVIOURS: readonly BehaviourName[] = [
  'fireAtPlayer',
  'fireBurst',
  'fireSpread',
  'fireOnBeat',
  'fireRing',
  'fireRotatingRing',
];
