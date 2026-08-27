import { type Component, World } from '../ecs/world.js';
import { type Entity, entityIndex } from '../ecs/entity.js';
import { ENEMY_DEFINITIONS } from '../../content/enemies/index.js';
import {
  BOSS_REWARD_DROP_TABLE,
  PICKUP_DEFINITIONS,
  ROOM_CLEAR_DROP_TABLE,
} from '../../content/pickups/index.js';
import type { RoomSpecialRole } from '../../content/rooms/definition.js';
import type { EnemyDefinition } from '../enemy/definition.js';
import { EnemyRegistry } from '../enemy/registry.js';
import { ENEMY_PROFILES, EnemySize, type EnemySizeId } from '../enemy/size.js';
import type { InputFrame } from '../input/frame.js';
import { createInputFrame } from '../input/frame.js';
import type { DropTable } from '../pickup/definition.js';
import { PickupRegistry } from '../pickup/registry.js';
import { ITEM_DEFINITIONS } from '../../content/items/index.js';
import {
  type ItemDefinition,
  type ItemPoolId,
  type ItemRuntimeState,
  itemStatSourceKey,
} from '../item/definition.js';
import { ItemInventory } from '../item/inventory.js';
import { selectItemOffer } from '../item/pool.js';
import { ItemRegistry } from '../item/registry.js';
import { type RunRandom, createRunRandom } from '../rng/streams.js';
import { drawDeathWord } from './death-word.js';
import {
  PromilleTier,
  type PromilleTierId,
  clampTrinkfest,
  promilleCapFor,
  promilleDamageMultiplier,
  promilleDriftScale,
  promilleFireRateMultiplier,
  promilleRequirementMet,
  promilleScreenDistortion,
  promilleTierName,
  promilleTierOf,
  promilleWobbleAmplitude,
  promilleSwayMagnitude,
} from './promille.js';
import { DOOR_SPAN, type RoomGeometry } from '../room/geometry.js';
import { createPlaygroundRoom } from '../room/playground.js';
import { compileStaircaseRoom, validateStaircaseTemplate } from '../room/staircase.js';
import {
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  compileRoomTemplate,
  doorCentre,
  type CompiledDoor,
  type RoomPlacement,
} from '../room/template.js';
import { TICKS_PER_SECOND } from '../time.js';
import { type SimTuning, createTuning } from '../tuning.js';
import { StatPipeline } from '../stats/cache.js';
import { DEFAULT_STAT_CAPS } from '../stats/caps.js';
import { StatId, type BaseStats } from '../stats/definition.js';
import type { StatModifier } from '../stats/modifiers.js';
import { type CollisionLayerId, CollisionLayer, collisionMaskFor } from '../collision/layers.js';
import { SpatialHash } from '../collision/spatial-hash.js';
import { EventQueue } from '../events/queue.js';
import { DamageNumberStore } from '../particle/damage-numbers.js';
import { DecalStore } from '../particle/decals.js';
import { ParticleStore } from '../particle/store.js';
import { ProjectileStore, ProjectileTeam } from '../projectile/store.js';
import { finalizeProjectileTags } from '../projectile/behavior.js';
import {
  addProjectileTag as grantProjectileTag,
  PROJECTILE_TAG_BY_NAME,
  type ProjectileTagName,
} from '../projectile/tags.js';
import { NO_SLOT } from '../pool/slot-pool.js';
import { vectorLength } from '../math.js';
import { addPush, stepPlayerMovement } from '../systems/movement.js';
import { stepBodies } from '../systems/bodies.js';
import { stepCollision } from '../systems/collision.js';
import { stepContacts } from '../systems/contact.js';
import { stepEnemyContacts } from '../systems/enemy-contact.js';
import {
  ENEMY_FLAG_ELITE,
  ENEMY_MOTION_STRIDE,
  ENEMY_STRIDE,
  stepEnemies,
  stepEnemyDeaths,
} from '../systems/enemy.js';
import { stepBombPlacement } from '../systems/bomb-placement.js';
import { stepBombs } from '../systems/bombs.js';
import { applyDamageAt, stepImpact, stepParticles } from '../systems/impact.js';
import { stepLootDrops } from '../systems/loot.js';
import {
  dispatchItemFloorStart,
  dispatchItemProjectileSpawn,
  dispatchItemRoomClear,
  stepItemTick,
} from '../systems/items.js';
import { stepPedestal } from '../systems/pedestal.js';
import { stepPickups } from '../systems/pickup.js';
import { stepPromille } from '../systems/promille.js';
import { stepProjectiles, stepShooting } from '../systems/shooting.js';
import {
  STATUS_BURN,
  STATUS_EFFECT_STRIDE,
  STATUS_FREEZE,
  STATUS_POISON,
  stepStatusEffects,
} from '../systems/status-effects.js';

/** Entity slots reserved up front. Sized well above M1's population. */
const DEFAULT_CAPACITY = 8192;

/** Collider radius of the player, in pixels. */
export const PLAYER_RADIUS = 7;

/** Collider radius of a training target — a mid-size body. */
export const TARGET_RADIUS = ENEMY_PROFILES[EnemySize.Mid].radius;

/** Collider radius of a placed Bierfassl. A small keg, not a mug. */
export const BOMB_RADIUS = 6;

/**
 * The largest collider the broadphase grid is sized for.
 *
 * Kept alongside the grid's cell size rather than discovered from the entities
 * in it: a body larger than this needs a coarser grid, which is a decision, not
 * something to find out about in the middle of a frame.
 */
export const MAX_COLLIDER_RADIUS = 16;

/** Hit points of a training target. Four shots, so a kill is a small commitment. */
export const TARGET_HEALTH = ENEMY_PROFILES[EnemySize.Mid].health;

/** Hit points the player starts a run with, in half-Maß. */
export const PLAYER_HEALTH = 6;

export { ENEMY_PROFILES, EnemySize, type EnemyProfile, type EnemySizeId } from '../enemy/size.js';

/** Ticks before a killed body on a spawn post comes back. Two and a half seconds. */
export const TARGET_RESPAWN_TICKS = 150;

/** A room transition is immediate in simulation and presented over this many frames. */
export const ROOM_TRANSITION_TICKS = 12;

/**
 * How long enemies stay inert after a room loads, in ticks (0.4s at 60
 * ticks/second) — long enough to register what just spawned before anything
 * moves or fires. See `stepEnemies` (`src/sim/systems/enemy.ts`), which
 * skips its whole loop while `roomWarmupTicks > 0`.
 */
export const ROOM_WARMUP_TICKS = 24;

/**
 * How far from the door the player just walked through a spawn has to be,
 * in room units, to be allowed to spawn at all — anything the room template
 * authored closer than this is dropped for that load rather than repositioned,
 * so a run never spawns something already touching the player on arrival.
 */
const DOOR_SPAWN_SAFETY_RADIUS = 48;

/**
 * Clearance a pedestal's authored placement is checked against before it
 * spawns — a pedestal carries no collider of its own (nothing pushes against
 * it), so this exists purely to keep `safeSpawnPoint` off a void cell, not to
 * describe a real physical size. Double a pickup's own radius (`RADIUS` in
 * `content/pickups/pickups.ts`), since a pedestal reads visually larger.
 */
const PEDESTAL_RADIUS = 8;

export type RoomDirection = 'north' | 'east' | 'south' | 'west';

/** Used only by `doorEntryPoint`'s staircase branch — see its doc comment. */
const OPPOSITE_ROOM_DIRECTION: Readonly<Record<RoomDirection, RoomDirection>> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

/**
 * Identifies one specific door — `(cellCol, cellRow, direction)` — rather
 * than just its direction. A multi-cell room (#100) can have two doors
 * sharing a direction on different cells (a `1x2`/`L`/`T`/`2x2` room's two
 * halves can each border a different neighbour to, say, the north); keying
 * by direction alone would treat both as the same door.
 */
function doorKey(door: Pick<CompiledDoor, 'direction' | 'cellCol' | 'cellRow'>): string {
  return `${door.direction}:${String(door.cellCol)},${String(door.cellRow)}`;
}

/** Preference order for `nextFloorExitDoor`'s free wall — arbitrary, just fixed so the same room always picks the same wall. */
const NEXT_FLOOR_DOOR_DIRECTIONS: readonly RoomDirection[] = ['south', 'east', 'west', 'north'];

/**
 * Where a boss room's dev-only "next floor" exit sits, once it has one: the
 * first wall in `NEXT_FLOOR_DOOR_DIRECTIONS` that none of the room's real
 * doors already occupy, centred on that whole wall (`geometry`'s bounding
 * box, not any one cell) the same way a staircase door's precomputed
 * `centre` bypasses the normal per-cell math in `doorCentre`. `null` only
 * when a boss room's real doors already cover all four walls, which no
 * authored boss template does today.
 */
function nextFloorExitDoor(
  geometry: RoomGeometry,
  doors: readonly CompiledDoor[],
): CompiledDoor | null {
  const used = new Set(doors.map((door) => door.direction));
  const direction = NEXT_FLOOR_DOOR_DIRECTIONS.find((candidate) => !used.has(candidate));
  if (direction === undefined) {
    return null;
  }
  const midX = (geometry.minX + geometry.maxX) / 2;
  const midY = (geometry.minY + geometry.maxY) / 2;
  const centre =
    direction === 'north'
      ? { x: midX, y: geometry.minY }
      : direction === 'south'
        ? { x: midX, y: geometry.maxY }
        : direction === 'west'
          ? { x: geometry.minX, y: midY }
          : { x: geometry.maxX, y: midY };
  // The whole wall, not `DOOR_SPAN`'s usual 24px: this door's `centre` sits
  // on the room's overall bounding box rather than on one authored cell, so
  // on a multi-cell boss room a narrow band can be a hundred-plus pixels
  // from wherever the player actually approaches that wall from — which
  // reads as a solid wall that swallows the room's own exit, not as a door.
  const span =
    direction === 'north' || direction === 'south'
      ? geometry.maxX - geometry.minX
      : geometry.maxY - geometry.minY;
  return { direction, cellCol: 0, cellRow: 0, centre, span };
}

/**
 * A live pedestal (#28): a spot a room's `decorativeProps` marked `pedestal`,
 * holding one item drawn from a pool at room-load time.
 *
 * Not an ECS entity — a room has at most a handful of these, `stepPedestal`
 * only ever needs the nearest one to the player, and none of it collides or
 * moves through the physics integrator, so the bookkeeping every ECS
 * component/mask buys elsewhere would cost more than it returns here. Held
 * on `GameSim` the same way `bombableWalls` is: plain per-room state,
 * rebuilt on every room load.
 */
interface PedestalRuntime {
  readonly x: number;
  readonly y: number;
  /** Registry index of the offered item, or -1 once taken or never filled (pool exhaustion). */
  itemIndex: number;
}

/**
 * What a room still owes the player, captured the moment they leave it —
 * see `GameSim.snapshotRoomLoot`. Restoring from this instead of re-rolling
 * the template is what makes loot (and a shop's stock, and an unclaimed
 * pedestal item) still there on a return trip, rather than gone the moment
 * the room unloads.
 */
interface RoomLootSnapshot {
  readonly pickups: readonly {
    readonly x: number;
    readonly y: number;
    readonly type: string;
    readonly price?: number;
  }[];
  readonly pedestals: readonly PedestalRuntime[];
}

/**
 * Which pool a room's pedestal draws from, by the room's own special role.
 *
 * `shop`/`supersecret` have no live pedestal spawn site today (no room JSON
 * places a `pedestal` prop in either) — the fallback below is defensive, not
 * reachable in practice, since live shop stocking from the `shop` pool is
 * its own follow-up (#28 only wires the pools that already have a room to
 * offer from: treasure, boss, secret).
 */
function pedestalPoolForRole(role: RoomSpecialRole | undefined): ItemPoolId {
  switch (role) {
    case 'boss':
      return 'boss';
    case 'secret':
    case 'supersecret':
      return 'secret';
    case 'treasure':
    case 'shop':
    default:
      return 'treasure';
  }
}

/**
 * What the room is populated with.
 *
 * Two placeholder rigs, both replaced by room templates in #18.
 *
 * `targets` is the impact-tuning rig: inert bodies that stand where they are
 * put and come back a couple of seconds after they are killed. Tuning impact
 * feel means killing the same thing several hundred times, and a target that
 * walks away mid-tune is a target that measures something else.
 *
 * `enemies` is the game: authored definitions out of `src/content/enemies/`,
 * behaving. It is what `npm run dev` starts, and what the milestone's question
 * — is it fun to shoot things — is actually asked of.
 *
 * `empty` is a room holding the player and nothing else, for a caller that
 * populates it itself. The performance stress scene is the one that does: its
 * whole point is a population stated exactly — 200 enemies, not 200 plus
 * whichever six bodies a placeholder rig happened to leave standing there.
 */
export type RoomPopulation = 'targets' | 'enemies' | 'empty';

export interface GameSimOptions {
  readonly seed?: number;
  readonly capacity?: number;
  readonly room?: RoomGeometry;
  /** Loads this authored room instead of the playground population. */
  readonly roomTemplate?: unknown;
  /**
   * The `roomTemplate`'s real floor-grid placement — which directions
   * actually have a neighbouring room, so its compiled doors match the
   * floor plan instead of falling back to every direction the template's
   * raw metadata allows. Omitted (the default `SINGLE_CELL_PLACEMENT`
   * `compileRoomTemplate` uses) is only correct for a template with no
   * doors that lead nowhere authored on it, or for a test that doesn't
   * care which doors compile.
   */
  readonly roomPlacement?: RoomPlacement;
  readonly floor?: number;
  /** Doors to load hidden — see `loadRoom`'s `hiddenDoors` parameter. */
  readonly hiddenDoors?: readonly Pick<CompiledDoor, 'direction' | 'cellCol' | 'cellRow'>[];
  /**
   * Loads `roomTemplate` with no enemies or pickups, whatever it authors —
   * a run's very first room reads as a quick, safe tutorial beat rather than
   * the first real encounter, without needing a separate authored template
   * or role for it. Never applies to `transitionTo`/`loadStaircaseRoom` —
   * only the room a fresh `GameSim` boots directly into.
   */
  readonly suppressRoomContent?: boolean;
  /** Projectile pool size. Lowered by tests that want to watch it overflow. */
  readonly projectileCapacity?: number;
  readonly particleCapacity?: number;
  /** Defaults to `targets`; see `RoomPopulation`. */
  readonly population?: RoomPopulation;
  /** Enemy data. Defaults to everything in `src/content/enemies/`. */
  readonly enemies?: readonly EnemyDefinition[];
  /** Item data. Defaults to everything in `src/content/items/`. */
  readonly items?: readonly ItemDefinition[];
  /**
   * The headline word the *previous* run's death screen showed, if any.
   *
   * Passed in rather than tracked as global state inside the sim: a run's own
   * death-word draw has to stay a pure function of its seed and this value, or
   * two runs sharing a seed would stop producing the same word. Cross-run
   * memory belongs to whatever is starting runs, not to the run itself.
   */
  readonly previousDeathWord?: string;
  /** Defaults to `true` — see `GameSim.promilleUnlocked`. */
  readonly promilleUnlocked?: boolean;
}

/**
 * One running game.
 *
 * Owns the world, the component storage, the room and the tuning, and advances
 * all of it by exactly one tick at a time. It reads a single `InputFrame` per
 * tick and nothing else — no clock, no DOM, no renderer — which is what makes a
 * run reproducible from a seed and an input log.
 */
export class GameSim {
  readonly world: World;
  readonly random: RunRandom;
  room: RoomGeometry;
  readonly tuning: SimTuning;
  readonly seed: number;
  /**
   * The stat pipeline (#25): `base → flat additions → multipliers → caps →
   * final`, cached and recomputed only when a source's modifiers change.
   * Today the only registered source is Promille (`syncPromilleModifiers`);
   * items, curses and character modifiers are later issues, and will register
   * the same way.
   */
  readonly stats: StatPipeline;
  /** The Promille tier `stats` last had modifiers built for. See `syncPromilleModifiers`. */
  private lastPromilleTier: PromilleTierId | null = null;
  /** Whether `stats` last had Kater's modifiers built in. See `syncKaterModifiers`. */
  private lastKaterActive = false;
  /**
   * Whether the `sober`/`rausch` item gate (#32) was open last tick — `null`
   * forces the first `syncItemPromilleGate` call to always run its check,
   * the same reasoning `lastPromilleTier` starting `null` already uses.
   * Two independent flags because a run can cross the sober boundary and the
   * rausch boundary on unrelated ticks (drinking down from Nüchtern first
   * passes through Angeheitert/Beduselt, neither of which is `rausch`).
   */
  private lastSoberGateActive: boolean | null = null;
  private lastRauschGateActive: boolean | null = null;
  /**
   * Scratch object `baseStats()` writes into and returns, rather than
   * allocating a fresh one. `baseStats()` runs on the firing path (twice a
   * shot, through `stats.value`), and `StatPipeline` already only reads it
   * to detect a change — handing it a new object every call would be exactly
   * the per-shot garbage the pipeline's cache exists to avoid.
   */
  private readonly baseStatsBuffer: Record<StatId, number> = {
    [StatId.Stammwuerze]: 0,
    [StatId.Schluckfrequenz]: 0,
    [StatId.Reichweite]: 0,
    [StatId.Wurfkraft]: 0,
    [StatId.Gschwindigkeit]: 0,
    [StatId.Dusel]: 0,
  };

  /** Position and the previous tick's position, for render interpolation. */
  readonly transform: Component<Float32Array>;
  /** Velocity in pixels per tick. */
  readonly velocity: Component<Float32Array>;
  /** Collider radius and mass. Mass is what knockback is divided by. */
  readonly body: Component<Float32Array>;
  /**
   * External impulses — firing kickback, and knockback once things can be hit.
   *
   * Kept out of velocity so that clamping a body to its top speed does not
   * silently eat every push the game applies to it.
   */
  readonly push: Component<Float32Array>;
  /** Collision layer and the mask of layers it interacts with. */
  readonly collision: Component<Uint16Array>;
  /** Current and maximum hit points. Maximum 0 means the body cannot be hurt. */
  readonly health: Component<Int16Array>;
  /** Damage dealt by touching a body. Zero on everything harmless. */
  readonly contactDamage: Component<Int16Array>;
  /**
   * Ticks left of the white hit flash.
   *
   * Presentation state, kept in the simulation on purpose: a replay that draws
   * a different flash than the run it recorded is not evidence of anything.
   */
  readonly flash: Component<Uint8Array>;
  /**
   * Which enemy definition, which of its states, how long it has been in it,
   * and the flags a transition reads — hit, and blocked by a wall.
   *
   * The tick counter is the only behaviour timer in the game. Telegraphs,
   * invulnerability windows, fire rates and burst spacing are all derived from
   * it, so there is never a second clock to keep in step with the first.
   */
  readonly enemy: Component<Int16Array>;
  /** Current heading, then the point the body was spawned at, for `orbitPoint`. */
  readonly enemyMotion: Component<Float32Array>;
  /**
   * Which spawn post a body belongs to, or -1.
   *
   * A post brings its body back a couple of seconds after it dies. Anything
   * that was not put there by one — a Schimmelfleck's spores, a future room's
   * reinforcements — carries -1 and stays dead.
   */
  readonly spawnPost: Component<Int16Array>;
  /** Index into `pickups` — which `PickupDefinition` a pickup entity is. */
  readonly pickupKind: Component<Int16Array>;
  /**
   * Biermarken cost. Present only on a priced pickup (a shop's stock) — its
   * absence, not a zero value, is what `sim/systems/pickup.ts`'s `collect`
   * reads as "free," the same optional-component convention `spawnBierfassl`
   * uses for `rolling`'s `velocity`.
   */
  readonly pickupPrice: Component<Int16Array>;
  /** Ticks left before a placed Bierfassl explodes. Only ever added to a Bierfassl. */
  readonly bombFuse: Component<Int16Array>;
  /** Ticks left of the cosmetic spawn-bounce, on every pickup. Render-only. */
  readonly spawnBounce: Component<Uint8Array>;
  /**
   * Burn/poison/freeze durations, in ticks — `[burnTicks, poisonTicks, freezeTicks]`
   * per slot (`sim/systems/status-effects.ts`'s `STATUS_*` constants).
   * Written by a `ProjectileTag` (#27) landing a hit, aged and spent by
   * `stepStatusEffects`. Indexed by slot directly, the same convention
   * `flash`/`spawnBounce` already use, rather than gated behind the ECS
   * component mask — nothing here needs to query "everything burning," only
   * to read three numbers for a slot a hit already named.
   */
  readonly statusEffect: Component<Int16Array>;

  /** Rebuilt from the position arrays every tick. */
  readonly broadphase: SpatialHash;

  /** Component mask an entity needs before the broadphase will index it. */
  readonly collidableMask: number;

  /** Component mask that marks a body as running an authored behaviour. */
  readonly enemyMask: number;

  /** Every enemy definition, validated and compiled once at construction. */
  readonly enemies: EnemyRegistry;

  /** Every pickup definition, validated and compiled once at construction. */
  readonly pickups: PickupRegistry;

  /** Every item definition, validated, sorted by id and compiled once at construction (#26). */
  readonly items: ItemRegistry;

  /** Which items this run holds, and their per-item runtime state. */
  readonly inventory: ItemInventory;

  /**
   * Registry indices whose `modifyStats` contribution needs to be re-folded
   * into the stat pipeline — set by `markItemStatsDirty`, drained by
   * `syncItemStatModifiers`. Sized to `items.count` and allocated once, the
   * same "fixed capacity, never grown" reasoning as everything else transient.
   */
  private readonly itemStatsDirty: Uint8Array;
  private readonly dirtyItemIndices: Int32Array;
  private dirtyItemCount = 0;

  /** The floor `dispatchItemFloorStart` was last fired for. 0 is not a real floor, so floor 1 still fires once. */
  private lastFloorStartDispatched = 0;

  /** Everything in flight. Pooled, fixed capacity, never grows. */
  readonly projectiles: ProjectileStore;

  /** Foam and splash. Pooled, and drawn from the seeded cosmetic stream. */
  readonly particles: ParticleStore;

  /** Floating damage numbers. Off by default — see the store for why. */
  readonly damageNumbers: DamageNumberStore;

  /** Splashes left where something died. They persist for the room. */
  readonly decals: DecalStore;

  /**
   * This tick's events.
   *
   * Cleared at the *start* of a step rather than the end, so that whatever ran
   * the step — a renderer, a test — can read what happened during it.
   */
  readonly events: EventQueue;

  /** The loaded room's stable content id, or empty for the tuning playground. */
  roomId = '';
  /** Ticks remaining in the presentation transition after a room load. */
  roomTransitionTicks = 0;
  roomTransitionDirection: RoomDirection | null = null;
  /** Ticks remaining before enemies loaded into the current room may act. */
  roomWarmupTicks = 0;

  /**
   * Ticks left of immunity to Floor 1's slick-puddle hazard (#35) —
   * Haferlschuh's grip, refreshed every tick it is held
   * (`content/items/haferlschuh.ts`'s `onTick`) rather than granted once, the
   * same "held near, not owned once" shape `slowEnemiesNear`'s aura already
   * uses. Read directly by `systems/movement.ts`'s `stepPlayerMovement`,
   * public for the same reason `roomWarmupTicks` is: a system, not a method.
   */
  puddleImmuneTicks = 0;

  /** Ticks until the player may fire again. */
  fireCooldown = 0;

  /**
   * Ticks the simulation is frozen for.
   *
   * Hitstop lives here rather than in the loop. Freezing the loop would stop
   * the clock and desynchronise the fixed timestep; freezing *inside* a tick
   * keeps ticks running at exactly 60 a second, keeps input frames being
   * consumed in lockstep, and keeps the whole thing a pure function of the
   * seed and the input log — so a replay freezes in the same places.
   */
  private hitstopTicks = 0;

  /** Current screenshake offset, in pixels, and the direction it points. */
  private shakeMagnitude = 0;
  private shakeDirectionX = 0;
  private shakeDirectionY = 0;

  /**
   * Accessibility scale on screenshake, 0 to 1.
   *
   * Reaches zero, and zero means no camera motion at all rather than a little
   * less of it. The full accessibility suite is #53; this one is here now
   * because shipping shake without an off switch is not a thing to do
   * temporarily.
   */
  screenShakeScale = 1;

  /**
   * Accessibility scale on controller rumble, 0 to 1.
   *
   * Same precedent as `screenShakeScale`: the full accessibility suite is
   * #53, and this is here now because shipping rumble without an off switch
   * is not a thing to do temporarily.
   */
  rumbleScale = 1;

  /**
   * Accessibility scale on Promille camera sway, 0 to 1.
   *
   * Same precedent as `screenShakeScale` and `rumbleScale`, and required by
   * #17's own acceptance criteria: sway has to be reducible to zero without
   * touching the damage/fire-rate bonuses, which is exactly what a separate
   * scale on a separate accumulator (see `swayX`/`swayY`) buys for free.
   */
  swayScale = 1;

  /**
   * No-drift mode (#33), part 1: accessibility scale on Promille's movement
   * drift, 0 to 1. Same precedent as `swayScale` — a plain field rather than
   * a `tuning` value, so a settings change never touches replay/determinism
   * state (see `docs/DECISIONS.md`) — but driven by a boolean toggle in
   * practice (`app/settings.ts`'s `noDrift`) rather than a slider: the issue
   * asks for an on/off "no-drift mode", not a drift intensity dial.
   *
   * Deliberately does *not* touch `promilleScreenDistortion` — the issue's
   * own words are "keeps the Promille stat bonuses and the visual language,
   * removes the movement and aim penalties," and the screen distortion is
   * the visual language, not a control penalty.
   */
  driftScale = 1;

  /** No-drift mode (#33), part 2: the same scale, on Promille's aim wobble. See `driftScale`. */
  wobbleScale = 1;

  /**
   * Ticks left of the Umgfalln knockdown — set by `addPromille` when a raise
   * crosses the top tier. Movement and firing both check this directly rather
   * than going through a generic "stunned" flag, since nothing else stuns the
   * player yet.
   */
  private umgfallnTicksValue = 0;

  /**
   * Ticks left of the Kater debuff — started by `tickUmgfalln` when the
   * knockdown ends, cleared early by eating (`GameSim.clearKater`, called
   * from the `food` pickup effect). Its own counter rather than a Promille
   * range, per the design doc: waking up short of sober is the Umgfalln
   * punish, Kater is a second, independent one that outlasts sobering up
   * faster than usual.
   */
  private katerTicksValue = 0;

  /**
   * Ticks left before the player may be hurt by contact again.
   *
   * Without it a body touching the player empties them at sixty damage a
   * second, which is not a difficulty setting, it is an instant death with
   * extra steps.
   */
  private invulnerableTicks = 0;

  /**
   * The player's soul and eternal pools, in half-Maß.
   *
   * Red health stays in the `health` component every entity carries, since
   * enemies and targets need it too. Soul and eternal are player-only, so they
   * live here instead of on a component the rest of the world never reads —
   * the same reasoning `screenShakeScale` and `invulnerableTicks` are plain
   * fields rather than components.
   */
  private soulHp = 0;
  private eternalHp = 0;

  /**
   * What the pickup toast (#26) is currently showing — the name and short
   * translation of the most recently collected pickup or item — and how many
   * ticks are left before it hides. Presentation state kept in the
   * simulation rather than a render-layer wall-clock timer, the same
   * reasoning DECISIONS.md #2 gives for the hit flash and screenshake: a
   * replay has to show the same toast for the same duration, not whatever a
   * setTimeout on the machine replaying it happens to produce.
   */
  private toastName = '';
  private toastDescription = '';
  private toastTicks = 0;

  /** Biermarken banked, Kellerschlüssel held, and Bierfassl in inventory — see #22. */
  private biermarkenCount = 0;
  private keysCount = 0;
  private bombsCount = 0;

  /**
   * Whether this run rolls the `promilled` half of every drop table, or the
   * `sober` half — see DECISIONS.md §9 and #85. Persisted unlock state does
   * not exist yet (#85 is M7); this defaults to unlocked so today's runs play
   * exactly as before, with the branch point already in place for #85 to set.
   */
  readonly promilleUnlocked: boolean;

  /** Set once, the tick every pool empties with no eternal heart to spend. */
  private playerDeadFlag = false;
  private playerDeathTick_ = -1;
  private deathWordValue: string | undefined;

  /** Carried in from `GameSimOptions`, and never written after construction. */
  private readonly previousDeathWord: string | undefined;

  /** Ticks run since construction. */
  private currentTick = 0;

  /** The floor `loadRoom` was last called with. Drives the Weißwurst rule. */
  private currentFloorValue = 1;

  /** The previous tick's button mask, for `isActionPressed` edges — see `stepBombPlacement`. */
  previousButtons = 0;

  private readonly playerHandle: Entity;

  /** Neutral input, used when a caller steps without supplying a frame. */
  private readonly idleInput = createInputFrame();

  /**
   * Where the room's bodies stand, and how long until a dead one returns.
   *
   * Respawning is a playground affordance, not a game rule. Tuning by feel
   * means killing the same thing several hundred times, and a room that empties
   * after three kills makes that a chore. Room content, and what actually
   * populates a room, is #19 and #35 — at which point posts go away and the
   * room template says what stands where.
   *
   * Only a body that a post put there comes back. Anything else — the spores a
   * Schimmelfleck leaves behind, whatever a future item summons — carries -1 in
   * its `spawnPost` and stays dead.
   */
  private readonly postX: number[] = [];
  private readonly postY: number[] = [];
  private readonly postRespawnAt: number[] = [];
  /** Size class a post brings back, when it holds no definition. */
  private readonly postSize: EnemySizeId[] = [];
  /** Enemy definition a post brings back, or -1 for a plain training target. */
  private readonly postDefinition: number[] = [];
  private roomEnemyCount = 0;
  private roomClearedIds = new Set<string>();
  private roomTemplateLoaded = false;
  /** Every real door the current room has (#100) — see the `doors` getter for the *visible* subset. */
  private roomDoors: readonly CompiledDoor[] = [];
  /**
   * The specific doors this room load hid (see `loadRoom`'s `hiddenDoors`)
   * that a nearby Bierfassl blast has not yet revealed, keyed by `doorKey`
   * so a multi-cell room (#100) hiding one door never also hides an
   * unrelated door that happens to share its direction on a different cell.
   * `revealBombableWalls` removes an entry the instant its wall opens;
   * cleared and rebuilt fresh on every `loadRoom`, since which walls are
   * bombable is per-instance (decided by the caller, not the template).
   */
  private readonly bombableWalls = new Map<string, CompiledDoor>();
  /** The loaded room's `metadata.specialRole`, or `undefined` for a normal room. */
  private roomSpecialRole: RoomSpecialRole | undefined = undefined;
  /**
   * A boss room's synthesised "next floor" exit (`nextFloorExitDoor`), or
   * `null` outside a boss room. Recomputed by every `applyCompiledRoom` call,
   * the same lifetime as `roomDoors` — only shown once the room is actually
   * cleared, via the `nextFloorDoor` getter below, not here.
   */
  private bossExitDoor: CompiledDoor | null = null;
  /** Every pedestal in the current room. Rebuilt on every room load — see `PedestalRuntime`. */
  private pedestalList: PedestalRuntime[] = [];
  /**
   * A boss room's own pedestal(s), authored in its `decorativeProps` the
   * same way any other room's are, held back from `spawnPedestal` until the
   * boss actually dies — `restoreOrSpawnRoomLoot`'s doc comment on why a
   * boss room is the one case that can't spawn its pedestal eagerly the way
   * every other room does: the reward for beating a boss should not already
   * be sitting on its plinth while the fight is still on. Populated by
   * `restoreOrSpawnRoomLoot` on a fresh boss-room visit, drained by `step`'s
   * room-clear check the tick the boss dies, and reset to empty on every
   * room load — a room already cleared restores its pedestal from
   * `roomLootSnapshots` instead, same as any other room's loot.
   */
  private pendingBossPedestals: { readonly x: number; readonly y: number }[] = [];
  /**
   * Leftover loot from a room the player has already left, keyed the same
   * way `roomClearedIds` is — by the authored template's own id, not a
   * per-instance floor-plan id (see `clearFloorProgress`'s doc comment for
   * why, and why this map is cleared there too). Written by
   * `snapshotRoomLoot`, read by `applyCompiledRoom` in place of re-rolling
   * the template once an entry exists.
   */
  private roomLootSnapshots = new Map<string, RoomLootSnapshot>();
  /**
   * Slot of the priced pickup currently touching the player, or -1. Written
   * once a tick by `sim/systems/pickup.ts`'s `stepPickups` (`setNearbyShopPickup`)
   * — a priced pickup is never auto-collected on touch, only queued here for
   * `shopPreview`/`stepPedestal`'s Use-button purchase (`attemptShopPurchase`).
   */
  private nearbyShopPickupSlot = -1;
  /**
   * Item ids this run has actually taken from a pedestal — #28's "no item
   * appears twice in a run." Populated only by `takePedestalItem`, never by
   * a mere offer, so refusing an offered item never removes it from future
   * pools. Not cleared on room load: it is run-scoped, the same lifetime as
   * `inventory`.
   */
  private readonly takenItemIds = new Set<string>();
  /** Ticks left showing the pedestal pickup/swap reveal panel. See `pedestalReveal`. */
  private pedestalRevealTicks = 0;
  private pedestalRevealName = '';
  private pedestalRevealDescription = '';
  /**
   * The Bierfassl just set down under the player, if any — `null` once the
   * player has stepped clear of it once.
   *
   * An `Entity` handle rather than a raw index: the handle's generation makes
   * a destroyed-and-recycled slot fail `isAlive` on its own, so this never
   * needs an explicit clear on every place a Bierfassl can stop existing
   * (fuse out, blown up early by another blast) — only the one place it
   * needs to start being ignored (`spawnBierfassl`) and the one place that
   * "ignored" ends (`stepContacts`, once the player is no longer touching it).
   */
  private freshBombEntity: Entity | null = null;

  constructor(options: GameSimOptions = {}) {
    this.seed = options.seed ?? 0;
    this.world = new World({ capacity: options.capacity ?? DEFAULT_CAPACITY });
    this.random = createRunRandom(this.seed);
    this.room = options.room ?? createPlaygroundRoom();
    this.tuning = createTuning();
    this.stats = new StatPipeline(() => this.baseStats(), DEFAULT_STAT_CAPS);
    this.previousDeathWord = options.previousDeathWord;

    this.transform = this.world.defineComponent('transform', Float32Array, 4);
    this.velocity = this.world.defineComponent('velocity', Float32Array, 2);
    this.body = this.world.defineComponent('body', Float32Array, 2);
    this.push = this.world.defineComponent('push', Float32Array, 2);
    this.collision = this.world.defineComponent('collision', Uint16Array, 2);
    this.health = this.world.defineComponent('health', Int16Array, 2);
    this.flash = this.world.defineComponent('flash', Uint8Array, 1);
    this.contactDamage = this.world.defineComponent('contactDamage', Int16Array, 1);
    this.enemy = this.world.defineComponent('enemy', Int16Array, ENEMY_STRIDE);
    this.enemyMotion = this.world.defineComponent('enemyMotion', Float32Array, ENEMY_MOTION_STRIDE);
    this.spawnPost = this.world.defineComponent('spawnPost', Int16Array, 1);
    this.pickupKind = this.world.defineComponent('pickupKind', Int16Array, 1);
    this.pickupPrice = this.world.defineComponent('pickupPrice', Int16Array, 1);
    this.bombFuse = this.world.defineComponent('bombFuse', Int16Array, 1);
    this.spawnBounce = this.world.defineComponent('spawnBounce', Uint8Array, 1);
    this.statusEffect = this.world.defineComponent(
      'statusEffect',
      Int16Array,
      STATUS_EFFECT_STRIDE,
    );
    this.collidableMask = this.world.maskOf(this.transform, this.body, this.collision);
    this.enemyMask = this.world.maskOf(this.enemy, this.enemyMotion);

    this.enemies = new EnemyRegistry(options.enemies ?? ENEMY_DEFINITIONS);
    this.pickups = new PickupRegistry(PICKUP_DEFINITIONS);
    this.items = new ItemRegistry(options.items ?? ITEM_DEFINITIONS);
    this.inventory = new ItemInventory(this.items);
    this.itemStatsDirty = new Uint8Array(this.items.count);
    this.dirtyItemIndices = new Int32Array(this.items.count);
    this.promilleUnlocked = options.promilleUnlocked ?? true;

    this.broadphase = new SpatialHash({
      // The grid spans the room from the origin. Coordinates outside it clamp
      // to an edge cell, so the margin only has to cover the largest collider.
      width: this.room.maxX + MAX_COLLIDER_RADIUS,
      height: this.room.maxY + MAX_COLLIDER_RADIUS,
      capacity: options.capacity ?? DEFAULT_CAPACITY,
      maxRadius: MAX_COLLIDER_RADIUS,
    });

    this.projectiles = new ProjectileStore(options.projectileCapacity);
    this.particles = new ParticleStore(options.particleCapacity);
    this.damageNumbers = new DamageNumberStore();
    this.decals = new DecalStore();
    this.events = new EventQueue();

    this.playerHandle = this.spawnPlayer();
    if (options.roomTemplate !== undefined) {
      this.loadRoom(
        options.roomTemplate,
        options.floor ?? 1,
        null,
        options.hiddenDoors ?? [],
        options.roomPlacement,
        { col: 0, row: 0 },
        options.suppressRoomContent ?? false,
      );
    } else {
      const population = options.population ?? 'targets';
      if (population === 'enemies') {
        this.spawnEnemyRoom();
      } else if (population === 'targets') {
        this.spawnTrainingTargets();
      }
    }
    this.world.flush();
  }

  get tick(): number {
    return this.currentTick;
  }

  get player(): Entity {
    return this.playerHandle;
  }

  get liveEnemyCount(): number {
    return this.roomEnemyCount;
  }

  get doorsLocked(): boolean {
    return this.roomTemplateLoaded && this.roomEnemyCount > 0;
  }

  /**
   * Every door the current room actually shows and allows walking through —
   * up to eight for a `2x2` room (#100), one per `(cell, wall)` pair that
   * borders a real neighbour. A hidden/bombable door (`bombableWalls`) is
   * excluded here — a solid wall, until `revealBombableWalls` opens it.
   */
  get doors(): readonly CompiledDoor[] {
    const real =
      this.bombableWalls.size === 0
        ? this.roomDoors
        : this.roomDoors.filter((door) => !this.bombableWalls.has(doorKey(door)));
    const exit = this.nextFloorDoor;
    return exit === null ? real : [...real, exit];
  }

  /**
   * The cleared boss room's dev-only "next floor" exit — `null` outside a
   * boss room, or before its enemies are down. Distinct from every other
   * entry in `doors`: it has no matching neighbour in the floor plan, so
   * `app/main.ts`'s `enterNeighbor` checks for it (by identity — the same
   * `CompiledDoor` instance `doorContact` would report back) before falling
   * through to the normal floor-plan door lookup, and calls `loadRoom`
   * directly with a freshly generated floor rather than `transitionTo`.
   */
  get nextFloorDoor(): CompiledDoor | null {
    return this.roomSpecialRole === 'boss' && !this.doorsLocked ? this.bossExitDoor : null;
  }

  /**
   * Combined current/max health across every enemy still counted toward
   * `roomEnemyCount` in a boss room — `null` outside one, or once it is
   * cleared. The same "presence locks the door" rule read as "presence
   * fills the bar," which is what makes this framework-level rather than
   * Die Große Kellerassel's own: a boss with no split at all, one that
   * splits into a single mounted phase two (#38's Stier), or one with
   * several segments alive at once all just sum correctly, with nothing
   * here naming any of them.
   *
   * Not cached — `render/boss-health-hud.ts`'s `sync` is the only caller,
   * once a frame, and a boss room never holds enough bodies for the walk to
   * register.
   */
  get bossHealth(): { readonly current: number; readonly max: number } | null {
    if (this.roomSpecialRole !== 'boss') {
      return null;
    }
    let current = 0;
    let max = 0;
    let any = false;
    const states = this.world.states;
    const masks = this.world.masks;
    for (let index = 0; index < this.world.highWater; index++) {
      if (states[index] !== World.ALIVE) {
        continue;
      }
      if (((masks[index] ?? 0) & this.enemyMask) !== this.enemyMask) {
        continue;
      }
      const definition = this.enemies.at(this.enemy.data[index * ENEMY_STRIDE] ?? 0);
      if (!definition.locksRoom) {
        continue;
      }
      any = true;
      current += this.health.data[index * 2] ?? 0;
      max += this.health.data[index * 2 + 1] ?? 0;
    }
    return any ? { current, max } : null;
  }

  /**
   * Opens any bombable wall within `radius` of `(x, y)`. Called once per
   * explosion by `stepBombs` (`sim/systems/bombs.ts`) with the blast's own
   * position and radius — "close enough to reveal" is exactly "close enough
   * to damage," the same blast, no separate concept of range.
   *
   * A wall's distance is measured to the point on the room boundary its door
   * gap is centred on (`render/room.ts`'s `createDoorView` draws the same
   * point), not to the room's centre — a boss-sized room makes the far wall
   * of a `2x2` slot unreachable by a blast measured from the middle.
   */
  revealBombableWalls(x: number, y: number, radius: number): void {
    if (this.bombableWalls.size === 0) {
      return;
    }
    for (const [key, door] of this.bombableWalls) {
      const point = doorCentre(this.room, door);
      const dx = point.x - x;
      const dy = point.y - y;
      if (dx * dx + dy * dy <= radius * radius) {
        this.bombableWalls.delete(key);
      }
    }
  }

  /**
   * Forgets every room this `GameSim` has ever marked cleared
   * (`roomClearedIds`) — call this once, before loading the first room of a
   * freshly *generated* floor layout, never for an ordinary same-floor
   * `loadRoom`/`transitionTo`.
   *
   * `roomId` (and so `roomClearedIds`'s key) is the *authored template's*
   * own id (`compiled.source.id` in `loadRoom`/`applyCompiledRoom`), not a
   * per-instance id from the floor plan — two different physical rooms that
   * happen to draw the same template share one `roomClearedIds` entry.
   * Every floor a normal run generates draws from a different `floorTag`'s
   * template pool, so that collision stays rare; the dev-only endless loop
   * (`app/main.ts`'s `advanceFloor`) always regenerates from the *same*
   * `floorConfig(1)` pool — currently just the ~14 "cellar"/"rural"
   * templates — onto this same `GameSim`, so `roomClearedIds` only grows.
   * By the second or third loop most of that small pool has already been
   * used somewhere and is wrongly treated as pre-cleared: `applyCompiledRoom`
   * skips spawning enemies/pickups/props for it, and `step` skips its clear
   * loot too. Without a reset, "the further a run goes, the fewer enemies
   * spawn" is exactly what falls out of this.
   */
  clearFloorProgress(): void {
    this.roomClearedIds.clear();
    // Same reasoning as `roomClearedIds` above, and the same key — leftover
    // loot from a room on the *previous* floor's draw of this template must
    // not leak into a different physical room that happens to reuse it.
    this.roomLootSnapshots.clear();
  }

  /**
   * The door the player is currently standing in the gap of, or `null`.
   *
   * The player is always clamped to the room's interior rectangle (see
   * `resolveAxis` in `systems/motion.ts`) — there is no physical gap in the
   * wall to walk through — so "walking through a door" is this: touching the
   * boundary at the point a door is drawn (`render/room.ts`'s `DOOR_SPAN`
   * band, centred on that door's own cell), with that door unlocked. The
   * caller (the app layer, which owns the floor plan and room templates)
   * polls this once a tick and calls `transitionTo` when it isn't `null` —
   * the same call the dev "N" shortcut in `main.ts` already makes.
   */
  get doorContact(): CompiledDoor | null {
    if (!this.roomTemplateLoaded || this.doorsLocked) {
      return null;
    }
    const index = this.playerIndex;
    const x = this.positionX(index);
    const y = this.positionY(index);

    for (const door of this.doors) {
      const centre = doorCentre(this.room, door);
      const half = (door.span ?? DOOR_SPAN) / 2;
      switch (door.direction) {
        case 'north':
          if (y <= this.room.minY + PLAYER_RADIUS && Math.abs(x - centre.x) <= half) {
            return door;
          }
          break;
        case 'south':
          if (y >= this.room.maxY - PLAYER_RADIUS && Math.abs(x - centre.x) <= half) {
            return door;
          }
          break;
        case 'west':
          if (x <= this.room.minX + PLAYER_RADIUS && Math.abs(y - centre.y) <= half) {
            return door;
          }
          break;
        case 'east':
          if (x >= this.room.maxX - PLAYER_RADIUS && Math.abs(y - centre.y) <= half) {
            return door;
          }
          break;
      }
    }
    return null;
  }

  get roomCleared(): boolean {
    return (
      this.roomTemplateLoaded && (this.roomEnemyCount === 0 || this.roomClearedIds.has(this.roomId))
    );
  }

  /**
   * Loads one room, preserving the player and run state while replacing its
   * contents.
   *
   * `hiddenDoors` — specific doors the template itself has, but which load
   * closed and solid rather than open, and remembered in `bombableWalls` so
   * a nearby Bierfassl blast can reveal them (`revealBombableWalls`, called
   * from `sim/systems/bombs.ts`). This is how a secret/supersecret room
   * connects: not a different door shape, the same door drawn shut until
   * bombed. The caller (`app/main.ts`, which owns the floor plan) decides
   * which doors those are for the room it's loading — `GameSim` only knows
   * one room's template at a time. Identified by `(cellCol, cellRow,
   * direction)`, not direction alone: a multi-cell room (#100) can have two
   * doors sharing a direction on different cells, and hiding one must never
   * hide the other.
   *
   * `placement` and `entryCell` only matter for a multi-cell room (#100): the
   * app layer, which owns the floor plan, resolves the real floor-grid
   * layout into `placement` (so `compileRoomTemplate` glues the right
   * sub-rooms at the right positions with the right real doors) and picks
   * `entryCell` (so the player lands on the correct sub-room's wall when
   * walking in through a specific door, not always the room's first cell).
   * Both default to the single-cell case, which is every `1x1` room.
   */
  loadRoom(
    template: unknown,
    floor = 1,
    direction: RoomDirection | null = null,
    hiddenDoors: readonly Pick<CompiledDoor, 'direction' | 'cellCol' | 'cellRow'>[] = [],
    placement?: RoomPlacement,
    entryCell: { readonly col: number; readonly row: number } = { col: 0, row: 0 },
    suppressContent = false,
  ): void {
    const compiled = compileRoomTemplate(
      template,
      floor,
      'room template',
      ENEMY_DEFINITIONS,
      placement,
      // Real per-run variety (#156) for a `count: 1` group with more than
      // one enemy simultaneously eligible for this floor — drawn from the
      // enemy stream, and only the enemy stream, same reasoning as
      // `wander`'s own turn direction: pulling from the shared generator
      // here would shift every floor layout in the game.
      (count) => Math.floor(this.random.enemies.nextFloat() * count),
    );
    this.applyCompiledRoom(
      {
        geometry: compiled.geometry,
        id: compiled.source.id,
        specialRole: compiled.source.metadata.specialRole,
        doors: compiled.doors,
        enemySpawns: suppressContent ? [] : compiled.enemySpawns,
        pickupSpawns: suppressContent ? [] : compiled.pickupSpawns,
        decorativeProps: compiled.decorativeProps,
      },
      floor,
      direction,
      hiddenDoors,
      entryCell,
    );
  }

  /**
   * Loads the next room only when its matching door exists, this room is
   * clear, and — for a key-locked treasure room — a Kellerschlüssel is spent
   * to open it. The key is spent only once every other check has passed, so
   * a blocked transition (wrong direction, enemies still up, no key) never
   * costs one.
   */
  transitionTo(
    template: unknown,
    floor: number,
    direction: RoomDirection,
    hiddenDoors: readonly Pick<CompiledDoor, 'direction' | 'cellCol' | 'cellRow'>[] = [],
    placement?: RoomPlacement,
    entryCell?: { readonly col: number; readonly row: number },
  ): boolean {
    if (!this.roomTemplateLoaded || this.doorsLocked || !this.hasDoor(direction)) {
      return false;
    }
    const destination = compileRoomTemplate(
      template,
      floor,
      'room template',
      ENEMY_DEFINITIONS,
      placement,
    );
    if (destination.source.metadata.keyLocked === true && !this.spendKeys(1)) {
      return false;
    }
    this.roomClearedIds.add(this.roomId);
    this.loadRoom(template, floor, direction, hiddenDoors, placement, entryCell);
    return true;
  }

  /**
   * `loadRoom`'s staircase counterpart (#112) — a staircase is never a
   * `RoomTemplate` (`docs/DECISIONS.md` #11/#12), so it compiles through
   * `compileStaircaseRoom` instead, and it never carries a `RoomPlacement`
   * or a non-default `entryCell` (it is never a multi-cell *shape*-family
   * room and always has exactly one door per direction). Its two doors are
   * synthesised as `CompiledDoor`s with a precomputed `centre` — see
   * `CompiledDoor.centre`'s doc comment — so every other door-facing system
   * (`doors`, `doorContact`, rendering) needs no staircase-specific branch of
   * its own.
   */
  loadStaircaseRoom(
    template: unknown,
    floor = 1,
    direction: RoomDirection | null = null,
    hiddenDoors: readonly Pick<CompiledDoor, 'direction' | 'cellCol' | 'cellRow'>[] = [],
  ): void {
    const compiled = compileStaircaseRoom(
      validateStaircaseTemplate(template, 'staircase template'),
    );
    this.applyCompiledRoom(
      {
        geometry: compiled.geometry,
        id: compiled.source.id,
        specialRole: undefined,
        doors: [
          {
            direction: compiled.startDoor.direction,
            cellCol: 0,
            cellRow: 0,
            centre: { x: compiled.startDoor.x, y: compiled.startDoor.y },
          },
          {
            direction: compiled.endDoor.direction,
            cellCol: 0,
            cellRow: 0,
            centre: { x: compiled.endDoor.x, y: compiled.endDoor.y },
          },
        ],
        enemySpawns: compiled.enemySpawns,
        pickupSpawns: compiled.pickupSpawns,
        decorativeProps: compiled.decorativeProps,
      },
      floor,
      direction,
      hiddenDoors,
      { col: 0, row: 0 },
    );
  }

  /** `transitionTo`'s staircase counterpart — see `loadStaircaseRoom`. No staircase is ever key-locked (none is authored with any content yet). */
  transitionToStaircase(
    template: unknown,
    floor: number,
    direction: RoomDirection,
    hiddenDoors: readonly Pick<CompiledDoor, 'direction' | 'cellCol' | 'cellRow'>[] = [],
  ): boolean {
    if (!this.roomTemplateLoaded || this.doorsLocked || !this.hasDoor(direction)) {
      return false;
    }
    this.roomClearedIds.add(this.roomId);
    this.loadStaircaseRoom(template, floor, direction, hiddenDoors);
    return true;
  }

  /**
   * Shared by `loadRoom` and `loadStaircaseRoom`: applies a compiled room's
   * geometry/doors/content, whatever compiled it, preserving the player and
   * run state while replacing the room's contents.
   *
   * `hiddenDoors` — specific doors the template itself has, but which load
   * closed and solid rather than open, and remembered in `bombableWalls` so
   * a nearby Bierfassl blast can reveal them (`revealBombableWalls`, called
   * from `sim/systems/bombs.ts`). This is how a secret/supersecret room
   * connects: not a different door shape, the same door drawn shut until
   * bombed. The caller (`app/main.ts`, which owns the floor plan) decides
   * which doors those are for the room it's loading — `GameSim` only knows
   * one room's template at a time. Identified by `(cellCol, cellRow,
   * direction)`, not direction alone: a multi-cell room (#100) can have two
   * doors sharing a direction on different cells, and hiding one must never
   * hide the other.
   *
   * `entryCell` only matters for a multi-cell `RoomShape` room (#100): the
   * app layer, which owns the floor plan, picks it so the player lands on
   * the correct sub-room's wall when walking in through a specific door, not
   * always the room's first cell. `{ col: 0, row: 0 }` for every other room,
   * staircase included.
   */
  private applyCompiledRoom(
    compiled: {
      readonly geometry: RoomGeometry;
      readonly id: string;
      readonly specialRole: RoomSpecialRole | undefined;
      readonly doors: readonly CompiledDoor[];
      readonly enemySpawns: readonly {
        readonly x: number;
        readonly y: number;
        readonly enemyId: string;
      }[];
      readonly pickupSpawns: readonly {
        readonly x: number;
        readonly y: number;
        readonly type: string;
        readonly price?: number;
      }[];
      readonly decorativeProps: readonly {
        readonly x: number;
        readonly y: number;
        readonly type: string;
        readonly rotation?: number;
      }[];
    },
    floor: number,
    direction: RoomDirection | null,
    hiddenDoors: readonly Pick<CompiledDoor, 'direction' | 'cellCol' | 'cellRow'>[],
    entryCell: { readonly col: number; readonly row: number },
  ): void {
    if (this.roomTemplateLoaded) {
      this.snapshotRoomLoot();
    }
    this.clearRoomEntities();
    this.room = compiled.geometry;
    this.roomId = compiled.id;
    this.roomDoors = compiled.doors;
    this.bombableWalls.clear();
    this.pedestalList = [];
    this.pendingBossPedestals = [];
    this.nearbyShopPickupSlot = -1;
    for (const hidden of hiddenDoors) {
      const match = this.roomDoors.find(
        (door) =>
          door.direction === hidden.direction &&
          door.cellCol === hidden.cellCol &&
          door.cellRow === hidden.cellRow,
      );
      if (match !== undefined) {
        this.bombableWalls.set(doorKey(match), match);
      }
    }
    this.roomSpecialRole = compiled.specialRole;
    this.bossExitDoor =
      compiled.specialRole === 'boss' ? nextFloorExitDoor(compiled.geometry, compiled.doors) : null;
    this.roomTemplateLoaded = true;
    this.roomTransitionTicks = direction === null ? 0 : ROOM_TRANSITION_TICKS;
    this.roomTransitionDirection = direction;
    this.roomWarmupTicks = ROOM_WARMUP_TICKS;
    if (floor !== this.lastFloorStartDispatched) {
      this.lastFloorStartDispatched = floor;
      dispatchItemFloorStart(this, floor);
    }
    this.currentFloorValue = floor;
    this.roomEnemyCount = 0;
    const alreadyCleared = this.roomClearedIds.has(this.roomId);
    this.positionPlayerAtDoor(direction, entryCell);
    if (!alreadyCleared) {
      // A room entered through a door (not the run's very first room) never
      // spawns something already touching the player at the door they just
      // walked through — that door is the one entry point every run of this
      // room is guaranteed to arrive at, so it is the one spot an author's
      // spawn placement can't account for the player already standing on.
      const entry = direction === null ? null : this.doorEntryPoint(direction, entryCell);
      // Elites (#156) only ever roll for an ordinary room's own roster —
      // never a boss, treasure, shop or secret encounter, each of which is
      // already authored to be its own kind of harder.
      const eliteChance = compiled.specialRole === undefined ? this.eliteChanceForFloor(floor) : 0;
      for (const spawn of compiled.enemySpawns) {
        if (entry !== null) {
          const dx = spawn.x - entry.x;
          const dy = spawn.y - entry.y;
          if (dx * dx + dy * dy < DOOR_SPAWN_SAFETY_RADIUS * DOOR_SPAWN_SAFETY_RADIUS) {
            continue;
          }
        }
        const definition = this.enemies.indexOf(spawn.enemyId);
        if (definition < 0) {
          throw new Error(`room template enemy "${spawn.enemyId}" is not registered`);
        }
        const elite = eliteChance > 0 && this.random.enemies.nextFloat() < eliteChance;
        this.spawnEnemyKind(definition, spawn.x, spawn.y, elite);
      }
      // Decorative props are art (#18) except a barrel, a destructible
      // obstacle a room author drops a Bierfassl at for free — `npm run dev`
      // always has something to demonstrate that on. A barrel is not loot:
      // once broken (or the room otherwise cleared), it does not come back,
      // the same as an enemy doesn't. Pedestals are handled below, in
      // `restoreOrSpawnRoomLoot` — they're loot, not decoration.
      //
      // `maypole` (#38, `content/rooms/dorf-boss.json`) is the same
      // destructible-obstacle shape as `barrel`, not a new one: Der Stier's
      // arena cover, breakable by player fire or by his own charge slamming
      // into it, needed nothing from the engine beyond a second prop type
      // reusing the path `barrel` already established.
      for (const prop of compiled.decorativeProps) {
        if (prop.type === 'barrel' || prop.type === 'maypole') {
          this.spawnTarget(prop.x, prop.y, TARGET_RADIUS);
        }
      }
    }
    this.restoreOrSpawnRoomLoot(compiled);
    if (this.roomEnemyCount === 0) {
      this.roomClearedIds.add(this.roomId);
    }
    this.world.flush();
  }

  /**
   * Puts back whatever loot the player left behind on a previous visit
   * (`roomLootSnapshots`), or — on a genuine first visit — rolls it fresh
   * from the template. Deliberately independent of `roomClearedIds`/
   * `alreadyCleared`: a room being "cleared" (its enemies handled) says
   * nothing about whether its loot was collected, and unlike enemies, loot
   * left on the floor should still be there next time.
   *
   * Restoring a pedestal from the snapshot, rather than calling
   * `spawnPedestal` again, matters beyond not losing the item: `spawnPedestal`
   * draws from `this.random.items`, so calling it a second time for the same
   * room would advance that stream and hand back a *different* item than the
   * one already offered — breaking "same seed, same route, same offers."
   */
  private restoreOrSpawnRoomLoot(compiled: {
    readonly pickupSpawns: readonly {
      readonly x: number;
      readonly y: number;
      readonly type: string;
      readonly price?: number;
    }[];
    readonly decorativeProps: readonly {
      readonly x: number;
      readonly y: number;
      readonly type: string;
      readonly rotation?: number;
    }[];
  }): void {
    const snapshot = this.roomLootSnapshots.get(this.roomId);
    if (snapshot !== undefined) {
      for (const pickup of snapshot.pickups) {
        if (this.pickups.indexOf(pickup.type) < 0) {
          continue;
        }
        this.spawnPickup(pickup.type, pickup.x, pickup.y, pickup.price);
      }
      this.pedestalList = snapshot.pedestals.map((pedestal) => ({ ...pedestal }));
      return;
    }
    if (this.roomClearedIds.has(this.roomId)) {
      // Cleared before this feature existed, or never held loot in the
      // first place — nothing to roll and nothing to restore.
      return;
    }
    for (const pickup of compiled.pickupSpawns) {
      const definition = this.pickups.indexOf(pickup.type);
      if (definition < 0) {
        throw new Error(`room template pickup "${pickup.type}" is not registered`);
      }
      const safe = this.safeSpawnPoint(pickup.x, pickup.y, this.pickups.at(definition).radius);
      this.spawnPickup(pickup.type, safe.x, safe.y, pickup.price);
    }
    // A pedestal (#28) draws a real item from a pool chosen by the room's
    // own special role (`pedestalPoolForRole`) rather than sitting inert —
    // except in a boss room, where it is the boss's own reward and has to
    // wait for the boss to actually die (`pendingBossPedestals`'s doc
    // comment). `roomEnemyCount` already reflects the boss just spawned
    // above in `applyCompiledRoom`, so this is "boss room, still up," not
    // "boss room, already cleared" — that case never reaches here at all
    // (the `roomClearedIds.has` branch above returns before this point).
    for (const prop of compiled.decorativeProps) {
      if (prop.type !== 'pedestal') {
        continue;
      }
      // An authored coordinate is only ever checked against the room's outer
      // walls at compile time (`validateRoomTemplate` has no per-cell
      // walkability check) — in an `L`/`T` room it can land inside the void
      // cell the shape drops, same failure `pickupSpawns` above is already
      // guarded against. Route through the same `safeSpawnPoint` nudge rather
      // than trusting the authored point outright.
      const safe = this.safeSpawnPoint(prop.x, prop.y, PEDESTAL_RADIUS);
      if (this.roomSpecialRole === 'boss' && this.roomEnemyCount > 0) {
        this.pendingBossPedestals.push({ x: safe.x, y: safe.y });
      } else {
        this.spawnPedestal(safe.x, safe.y);
      }
    }
  }

  /**
   * Captures whatever loot the room being left still has on the ground —
   * pickups of any origin (template-authored, an enemy's own drop, the
   * room-clear roll) and pedestal state alike — so `restoreOrSpawnRoomLoot`
   * can put it back exactly as left, rather than the room quietly voiding it
   * the moment `clearRoomEntities` runs. Called from `applyCompiledRoom`
   * before that happens, while `this.roomId`/`this.pedestalList` still name
   * the *outgoing* room.
   */
  private snapshotRoomLoot(): void {
    const pickups: { x: number; y: number; type: string; price?: number }[] = [];
    this.world.forEach(this.pickupKind.bit, (index) => {
      const definitionIndex = this.pickupKind.data[index] ?? -1;
      if (definitionIndex < 0) {
        return;
      }
      const priced = ((this.world.masks[index] ?? 0) & this.pickupPrice.bit) !== 0;
      pickups.push({
        x: this.positionX(index),
        y: this.positionY(index),
        type: this.pickups.at(definitionIndex).id,
        ...(priced ? { price: this.pickupPrice.data[index] ?? 0 } : {}),
      });
    });
    this.roomLootSnapshots.set(this.roomId, {
      pickups,
      pedestals: this.pedestalList.map((pedestal) => ({ ...pedestal })),
    });
  }

  private hasDoor(direction: RoomDirection): boolean {
    return this.doors.some((door) => door.direction === direction);
  }

  private clearRoomEntities(): void {
    for (let index = 0; index < this.world.highWater; index++) {
      if (index === this.playerIndex || !this.world.isAlive(this.world.entityAt(index))) {
        continue;
      }
      this.world.destroy(this.world.entityAt(index));
    }
    this.world.flush();
    this.projectiles.clear();
    this.particles.clear();
    this.damageNumbers.clear();
    this.decals.clear();
    this.events.clear();
    this.postX.length = 0;
    this.postY.length = 0;
    this.postRespawnAt.length = 0;
    this.postSize.length = 0;
    this.postDefinition.length = 0;
  }

  /**
   * Where the player (and, via `DOOR_SPAWN_SAFETY_RADIUS`, nothing else)
   * lands when entering the room from `direction` — the door on
   * `entryCell`'s wall facing `direction`, or the room's centre (nudged off
   * a block, if the centre itself sits on one — `findPlayerSpawnPoint`) for
   * the very first room of a run (`direction === null`, no door was walked
   * through).
   *
   * `entryCell` only matters once a room can have more than one door per
   * wall (#100): it says which of them the player is arriving through, the
   * same way `doorContact` reports which one they left the old room by.
   */
  private doorEntryPoint(
    direction: RoomDirection | null,
    entryCell: { readonly col: number; readonly row: number },
  ): { x: number; y: number } {
    if (direction === null) {
      return this.findPlayerSpawnPoint(PLAYER_RADIUS);
    }
    if (this.room.stepRects.length > 0) {
      // A staircase (#112) has no floor-grid cell of its own for the normal
      // `entryCell`-relative math below to land on — its own door already
      // carries its exact position (`loadStaircaseRoom`'s `centre`), so use
      // that directly. The door on the wall the player is walking *in*
      // through faces the opposite compass way from `direction` (moving
      // north means entering through this room's *south*-facing door) —
      // same convention `doorCentre`'s own north/south/east/west cases use.
      const wallDirection = OPPOSITE_ROOM_DIRECTION[direction];
      const door = this.roomDoors.find((candidate) => candidate.direction === wallDirection);
      if (door?.centre !== undefined) {
        switch (wallDirection) {
          case 'north':
            return { x: door.centre.x, y: door.centre.y + PLAYER_RADIUS + 1 };
          case 'south':
            return { x: door.centre.x, y: door.centre.y - PLAYER_RADIUS - 1 };
          case 'east':
            return { x: door.centre.x - PLAYER_RADIUS - 1, y: door.centre.y };
          case 'west':
            return { x: door.centre.x + PLAYER_RADIUS + 1, y: door.centre.y };
        }
      }
    }
    const cellCentreX = this.room.minX + entryCell.col * SCREEN_WIDTH + SCREEN_WIDTH / 2;
    const cellCentreY = this.room.minY + entryCell.row * SCREEN_HEIGHT + SCREEN_HEIGHT / 2;
    switch (direction) {
      case 'north':
        return { x: cellCentreX, y: this.room.maxY - PLAYER_RADIUS - 1 };
      case 'east':
        return { x: this.room.minX + PLAYER_RADIUS + 1, y: cellCentreY };
      case 'south':
        return { x: cellCentreX, y: this.room.minY + PLAYER_RADIUS + 1 };
      case 'west':
        return { x: this.room.maxX - PLAYER_RADIUS - 1, y: cellCentreY };
    }
  }

  private positionPlayerAtDoor(
    direction: RoomDirection | null,
    entryCell: { readonly col: number; readonly row: number },
  ): void {
    const { x, y } = this.doorEntryPoint(direction, entryCell);
    const index = this.playerIndex;
    this.transform.data[index * 4] = x;
    this.transform.data[index * 4 + 1] = y;
    this.transform.data[index * 4 + 2] = x;
    this.transform.data[index * 4 + 3] = y;
    this.velocity.data[index * 2] = 0;
    this.velocity.data[index * 2 + 1] = 0;
    this.push.data[index * 2] = 0;
    this.push.data[index * 2 + 1] = 0;
  }

  /** The player's storage slot. Stable for the lifetime of the run. */
  get playerIndex(): number {
    return entityIndex(this.playerHandle);
  }

  /** Advances the simulation exactly one tick. */
  /** Ticks left of the player's contact invulnerability. Zero means they can be hurt. */
  get playerInvulnerableTicks(): number {
    return this.invulnerableTicks;
  }

  /** Ages the invulnerability by one tick. Called once a tick by the contact system. */
  tickPlayerInvulnerability(): void {
    if (this.invulnerableTicks > 0) {
      this.invulnerableTicks -= 1;
    }
  }

  /** Starts the player's invulnerability window. Never shortens one already running. */
  makePlayerInvulnerable(ticks: number): void {
    if (ticks > this.invulnerableTicks) {
      this.invulnerableTicks = ticks;
    }
  }

  /** Red Maß, current and max — the pool every other entity's `health` also carries. */
  get playerHealth(): number {
    return this.health.data[this.playerIndex * 2] ?? 0;
  }

  /** Weißbier, in half-Maß. Spent before red. */
  get playerSoulHealth(): number {
    return this.soulHp;
  }

  /** Schwarzbier banked. Not spent by ordinary damage — see `applyPlayerDamage`. */
  get playerEternalHealth(): number {
    return this.eternalHp;
  }

  /** Grants soul hearts (Weißbier) — collected via `spawnPickup`, or called directly by tests. */
  addSoulHealth(amount: number): void {
    if (amount > 0) {
      this.soulHp += amount;
    }
  }

  /** Grants eternal hearts (Schwarzbier). Same caveat as `addSoulHealth`. */
  addEternalHealth(amount: number): void {
    if (amount > 0) {
      this.eternalHp += amount;
    }
  }

  /** Heals red Maß, clamped to the pool's max. The Maß/food half of the pickup economy. */
  addPlayerHealth(amount: number): void {
    if (amount <= 0) {
      return;
    }
    const health = this.health.data;
    const index = this.playerIndex;
    const max = health[index * 2 + 1] ?? 0;
    health[index * 2] = Math.min(max, (health[index * 2] ?? 0) + amount);
  }

  /**
   * The pickup toast currently on screen, or `null` once it has aged out —
   * see `toastTicks`'s doc comment. Read by the render layer once a frame,
   * the same pattern `roomWarmupTicks`/the boss banner already use.
   */
  get pickupToast(): { readonly name: string; readonly description: string } | null {
    if (this.toastTicks <= 0) {
      return null;
    }
    return { name: this.toastName, description: this.toastDescription };
  }

  /**
   * Starts (or restarts) the pickup toast — called once per collection, by
   * `sim/systems/pickup.ts`'s `collect` for an ordinary pickup and by
   * `pickUpItem` for an item. A second collection while one toast is still
   * showing replaces it outright rather than queuing, the same "newest wins"
   * choice `addShake` already makes for screenshake direction.
   */
  reportCollected(name: string, description: string): void {
    this.toastName = name;
    this.toastDescription = description;
    this.toastTicks = Math.round(this.tuning.pickup.toastTicks);
  }

  /** Biermarken banked. */
  get biermarken(): number {
    return this.biermarkenCount;
  }

  /** Slot of the priced pickup currently touching the player, or -1. */
  get nearbyShopPickup(): number {
    return this.nearbyShopPickupSlot;
  }

  /** Written once a tick by `stepPickups` — not meant to be called from anywhere else. */
  setNearbyShopPickup(slot: number): void {
    this.nearbyShopPickupSlot = slot;
  }

  /**
   * What to show for the priced pickup the player is currently touching —
   * "here is what this is," the half of a shop purchase that used to be
   * skipped straight past on the way to spending the player's Biermarken for
   * them. `null` while nothing priced is underfoot.
   */
  get shopPreview(): {
    readonly name: string;
    readonly description: string;
    readonly price: number;
    readonly affordable: boolean;
  } | null {
    const slot = this.nearbyShopPickupSlot;
    if (slot < 0) {
      return null;
    }
    const definitionIndex = this.pickupKind.data[slot] ?? -1;
    if (definitionIndex < 0) {
      return null;
    }
    const definition = this.pickups.at(definitionIndex);
    const price = this.pickupPrice.data[slot] ?? 0;
    return {
      name: definition.name,
      description: definition.description,
      price,
      affordable: this.biermarkenCount >= price,
    };
  }

  addBiermarken(amount: number): void {
    if (amount > 0) {
      this.biermarkenCount += amount;
    }
  }

  /** Spends Biermarken — a shop purchase. False, spending nothing, if there were not enough. */
  spendBiermarken(amount: number): boolean {
    if (amount <= 0 || this.biermarkenCount < amount) {
      return false;
    }
    this.biermarkenCount -= amount;
    return true;
  }

  /** Kellerschlüssel held. */
  get keys(): number {
    return this.keysCount;
  }

  addKeys(amount: number): void {
    if (amount > 0) {
      this.keysCount += amount;
    }
  }

  /** Spends Kellerschlüssel — a locked door. False, spending nothing, if there were not enough. */
  spendKeys(amount: number): boolean {
    if (amount <= 0 || this.keysCount < amount) {
      return false;
    }
    this.keysCount -= amount;
    return true;
  }

  /** Bierfassl in inventory, ready to place — distinct from one already ticking in the room. */
  get bombs(): number {
    return this.bombsCount;
  }

  addBombs(amount: number): void {
    if (amount > 0) {
      this.bombsCount += amount;
    }
  }

  /** Spends one Bierfassl from inventory. False if there was none to spend. */
  spendBomb(): boolean {
    if (this.bombsCount <= 0) {
      return false;
    }
    this.bombsCount -= 1;
    return true;
  }

  /** The floor the current room was loaded on. Drives the Weißwurst rule. */
  get currentFloor(): number {
    return this.currentFloorValue;
  }

  /** True once every pool has emptied with no eternal heart left to spend. */
  get playerDead(): boolean {
    return this.playerDeadFlag;
  }

  /** The tick death happened on, or -1 while the player is alive. */
  get playerDeathTick(): number {
    return this.playerDeathTick_;
  }

  /**
   * The game-over screen's headline word, drawn once at the moment of death
   * and memoised — the pool draw is a real consumption of the cosmetic
   * stream, so reading this twice must not draw twice.
   */
  get deathWord(): string | undefined {
    return this.deathWordValue;
  }

  /**
   * Applies damage to the player, spending soul before red and reaching for an
   * eternal heart only when the hit would otherwise be lethal.
   *
   * This is the one place player health changes. `applyContact` and the
   * player branch of `applyHit` (`src/sim/systems/impact.ts`) both route
   * through it rather than writing `health.data` directly, which is what
   * makes the soul-before-red-before-eternal order (and the death check)
   * apply the same way regardless of what caused the hit.
   */
  applyPlayerDamage(amount: number): void {
    if (amount <= 0 || this.playerDeadFlag) {
      return;
    }

    const health = this.health.data;
    const index = this.playerIndex;
    const red = health[index * 2] ?? 0;

    // Reaching exactly zero is lethal, same as going below it — a hit does
    // not need to overkill to end a run, it only needs to use up what is left.
    if (amount >= this.soulHp + red) {
      if (this.eternalHp > 0) {
        // A killing blow with a heart banked: the heart is spent instead of
        // the run, and comes back as the one half-Maß a player needs to keep
        // standing rather than as a full refill — an eternal heart is a save,
        // not a heal.
        this.eternalHp -= 1;
        this.soulHp = 0;
        health[index * 2] = 1;
      } else {
        this.soulHp = 0;
        health[index * 2] = 0;
        this.playerDeadFlag = true;
        this.playerDeathTick_ = this.currentTick;
        this.deathWordValue = drawDeathWord(this.random.cosmetic, this.previousDeathWord);
      }
      return;
    }

    let remaining = amount;
    if (this.soulHp > 0) {
      const spend = Math.min(this.soulHp, remaining);
      this.soulHp -= spend;
      remaining -= spend;
    }
    if (remaining > 0) {
      health[index * 2] = red - remaining;
    }
  }

  /** Current Promille, 0–5 at baseline Trinkfest, higher once it is raised. Backed by `tuning.promille.current` — see `tuning.ts`. */
  get promille(): number {
    return this.tuning.promille.current;
  }

  /**
   * Trinkfest (#92): tolerance. 0 is baseline; see `PromilleTuning.trinkfest`
   * for the full shape and `raiseTrinkfest`/`lowerTrinkfest` for the only two
   * places gameplay is meant to move it.
   */
  get trinkfest(): number {
    return this.tuning.promille.trinkfest;
  }

  get promilleTier(): PromilleTierId {
    return promilleTierOf(this.promille, this.trinkfest, this.tuning.promille);
  }

  /** Ticks left of the Umgfalln knockdown. Zero means the player can move and fire. */
  get umgfallnTicks(): number {
    return this.umgfallnTicksValue;
  }

  /** Ticks left of the Kater debuff. Zero means it isn't active. */
  get katerTicks(): number {
    return this.katerTicksValue;
  }

  get hasKater(): boolean {
    return this.katerTicksValue > 0;
  }

  get promilleDriftScale(): number {
    return promilleDriftScale(this.promille, this.tuning.promille) * this.driftScale;
  }

  get promilleWobbleAmplitude(): number {
    return promilleWobbleAmplitude(this.promille, this.tuning.promille) * this.wobbleScale;
  }

  /** The screen-distortion penalty (#92) — see `promilleScreenDistortion`. Read by `render/vignette.ts`. */
  get promilleScreenDistortion(): number {
    return promilleScreenDistortion(this.promille, this.tuning.promille);
  }

  /**
   * The stat pipeline's starting point (#25): today just what `tuning` says
   * before any modifier runs. `Dusel` has no design-doc default yet — nothing
   * reads it — so it starts at zero rather than a number invented for it.
   */
  private baseStats(): BaseStats {
    const buffer = this.baseStatsBuffer;
    buffer[StatId.Stammwuerze] = this.tuning.shooting.shotDamage;
    buffer[StatId.Schluckfrequenz] = this.tuning.shooting.fireDelayTicks;
    buffer[StatId.Reichweite] = this.tuning.shooting.shotLifetimeTicks;
    buffer[StatId.Wurfkraft] = this.tuning.shooting.shotSpeed;
    buffer[StatId.Gschwindigkeit] = this.tuning.movement.maxSpeed;
    buffer[StatId.Dusel] = 0;
    return buffer;
  }

  /**
   * Registers Promille's contribution to the stat pipeline as a source named
   * `'promille'`, replacing it whenever the tier actually changes — a cheap
   * check every tick, a rebuild only on the rare tick a tier boundary is
   * crossed. `promilleFireRateMultiplier` is a rate; Schluckfrequenz is a
   * delay, so its factor is inverted (a 1.5x rate multiplier is a 1/1.5
   * delay multiplier) rather than teaching the pipeline to divide.
   *
   * Called at the top of `step()`, after `stepPromille` has settled this
   * tick's tier — including the case where the debug slider or a test wrote
   * `tuning.promille.current` directly rather than going through
   * `addPromille`/`decayPromille`.
   */
  private syncPromilleModifiers(): void {
    const tier = this.promilleTier;
    if (tier === this.lastPromilleTier) {
      return;
    }
    this.lastPromilleTier = tier;

    if (tier === PromilleTier.Nuchtern) {
      this.stats.clearSource('promille');
      return;
    }

    const source = {
      kind: 'promille' as const,
      id: promilleTierName(tier),
      label: promilleTierName(tier),
    };
    const modifiers: StatModifier[] = [
      {
        stat: StatId.Stammwuerze,
        op: 'multiply',
        value: promilleDamageMultiplier(tier, this.tuning.promille),
        source,
      },
      {
        stat: StatId.Schluckfrequenz,
        op: 'multiply',
        value: 1 / promilleFireRateMultiplier(tier, this.tuning.promille),
        source,
      },
    ];
    this.stats.setSourceModifiers('promille', modifiers);
  }

  /**
   * Registers or clears Kater's stat contribution, as its own source — kept
   * separate from `syncPromilleModifiers` because Kater's on/off edge is
   * "did `katerTicksValue` reach zero," not a tier boundary, and the two can
   * be true or false in any combination (hungover and freshly sober is the
   * whole point of the debuff).
   */
  private syncKaterModifiers(): void {
    const active = this.hasKater;
    if (active === this.lastKaterActive) {
      return;
    }
    this.lastKaterActive = active;

    if (!active) {
      this.stats.clearSource('kater');
      return;
    }

    const tuning = this.tuning.promille;
    const source = { kind: 'kater' as const, id: 'kater', label: 'Kater' };
    const modifiers: StatModifier[] = [
      {
        stat: StatId.Stammwuerze,
        op: 'multiply',
        value: tuning.katerStammwuerzeMultiplier,
        source,
      },
      {
        stat: StatId.Gschwindigkeit,
        op: 'multiply',
        value: tuning.katerGschwindigkeitMultiplier,
        source,
      },
    ];
    this.stats.setSourceModifiers('kater', modifiers);
  }

  /**
   * The `modifyStats` half of #32's generic Promille gate: marks every held
   * `sober`/`rausch` item's stat contribution dirty the tick its gate
   * actually flips, so `syncItemStatModifiers`'s own per-item check (which is
   * what makes the contribution disappear) gets a chance to re-run even
   * though nothing about the item itself changed — only the meter did.
   *
   * Every *other* held item's hook (`onTick`, `onShoot`, `onKill`, ...) is
   * gated live, at the moment `sim/systems/items.ts` dispatches it, because
   * those are called every time anyway. `modifyStats` is the one exception:
   * it is cached (`itemStatsDirty`) and only re-read when something marks it
   * dirty, so without this, an item picked up while its requirement was met
   * would keep contributing its stat bonus forever after the meter moved on,
   * with nothing ever telling `syncItemStatModifiers` to look again. Same
   * "cheap check every tick, rebuild only on the rare tick a boundary is
   * crossed" shape `syncPromilleModifiers` already uses just above.
   */
  private syncItemPromilleGate(): void {
    const tier = this.promilleTier;
    const soberActive = tier === PromilleTier.Nuchtern;
    const rauschActive = tier >= PromilleTier.Vollrausch;
    const soberChanged = soberActive !== this.lastSoberGateActive;
    const rauschChanged = rauschActive !== this.lastRauschGateActive;
    if (!soberChanged && !rauschChanged) {
      return;
    }
    this.lastSoberGateActive = soberActive;
    this.lastRauschGateActive = rauschActive;

    const count = this.items.count;
    for (let index = 0; index < count; index++) {
      if (!this.inventory.has(index)) {
        continue;
      }
      const item = this.items.at(index);
      if (item.hooks.modifyStats === undefined) {
        continue;
      }
      if (
        (item.promilleRequirement === 'sober' && soberChanged) ||
        (item.promilleRequirement === 'rausch' && rauschChanged)
      ) {
        this.markItemStatsDirty(index);
      }
    }
  }

  /**
   * Raises Promille, clamped at `promilleCapFor(trinkfest)` — `PROMILLE_MAX`
   * itself at baseline Trinkfest, further out once it is raised (#92). The
   * one place it goes up — beer pickups (#17) and the debug slider (which
   * writes `tuning.promille.current` directly, bypassing this) are the only
   * sources today.
   *
   * Crossing the Umgfalln threshold starts the knockdown via
   * `maybeStartUmgfalln` rather than in whatever called this, the same
   * reason `applyPlayerDamage` owns the death check: one chokepoint, so
   * every raise — pickup or otherwise — behaves the same way.
   */
  addPromille(amount: number): void {
    if (amount <= 0) {
      return;
    }
    const tuning = this.tuning.promille;
    tuning.current = Math.min(promilleCapFor(tuning.trinkfest, tuning), tuning.current + amount);
    this.maybeStartUmgfalln();
  }

  /**
   * Raises Trinkfest (#92), clamped to `[TRINKFEST_MIN, TRINKFEST_MAX]`.
   * Never itself risks *triggering* Umgfalln — raising tolerance only ever
   * pushes the threshold further away — so unlike `lowerTrinkfest` it does
   * not need to re-check the knockdown.
   */
  raiseTrinkfest(amount: number): void {
    if (amount <= 0) {
      return;
    }
    const tuning = this.tuning.promille;
    tuning.trinkfest = clampTrinkfest(tuning.trinkfest + amount);
  }

  /**
   * Lowers Trinkfest (#92), clamped the same way `raiseTrinkfest` is.
   *
   * Unlike raising it, this *can* pull the Umgfalln threshold down past the
   * player's current Promille — dropping tolerance mid-binge is exactly the
   * "make Umgfalln arrive sooner" acceptance criterion — so it has to run
   * the same knockdown check `addPromille` does. Without it the player would
   * sit at a Promille the new threshold says is Umgfalln without ever
   * actually falling over: the corrupted-state failure mode #92 calls out
   * by name ("Trinkfest changing mid-run must not corrupt Umgfalln/Kater
   * state").
   */
  lowerTrinkfest(amount: number): void {
    if (amount <= 0) {
      return;
    }
    const tuning = this.tuning.promille;
    tuning.trinkfest = clampTrinkfest(tuning.trinkfest - amount);
    this.maybeStartUmgfalln();
  }

  /**
   * Starts the Umgfalln knockdown if the current tier is Umgfalln and one
   * is not already running. Shared by every path that can push the player
   * into the tier without an intervening `step()` — a Promille raise, or
   * Trinkfest dropping out from under an already-elevated Promille.
   *
   * `umgfallnTicksValue > 0` is the re-entry guard: while a knockdown is
   * already running, `tuning.current` sits unchanged at whatever it was
   * (`stepPromille` skips `decayPromille` for the duration), so the tier
   * stays Umgfalln the whole time and this must not restart the countdown.
   */
  private maybeStartUmgfalln(): void {
    if (this.umgfallnTicksValue > 0) {
      return;
    }
    if (this.promilleTier !== PromilleTier.Umgfalln) {
      return;
    }
    this.umgfallnTicksValue = Math.round(this.tuning.promille.umgfallnKnockdownTicks);
    this.makePlayerInvulnerable(this.umgfallnTicksValue);
  }

  /**
   * Lowers Promille, clamped at zero. Food's other half — Brezn, Obazda and
   * Radi all heal *and* call this. Inert in a sober run only in effect, not in
   * mechanism: Promille sits at zero the whole run, so subtracting from it
   * does nothing to observe — no separate gate is needed here.
   */
  lowerPromille(amount: number): void {
    if (amount <= 0) {
      return;
    }
    const tuning = this.tuning.promille;
    tuning.current = Math.max(0, tuning.current - amount);
  }

  /** Ages the Umgfalln knockdown by one tick. Called once a tick by `stepPromille`. */
  tickUmgfalln(): void {
    if (this.umgfallnTicksValue <= 0) {
      return;
    }
    this.umgfallnTicksValue -= 1;
    if (this.umgfallnTicksValue === 0) {
      // Woken up short of sober — the whole point of a knockdown is that it
      // costs you the drink, not that it costs you the tier.
      this.tuning.promille.current = this.tuning.promille.umgfallnWakePromille;
      this.startKater();
    }
  }

  /** Decays Promille toward zero. Called once a tick by `stepPromille`, skipped during knockdown. */
  decayPromille(): void {
    const tuning = this.tuning.promille;
    tuning.current = Math.max(0, tuning.current - tuning.decayPerSecond / TICKS_PER_SECOND);
  }

  /** Starts (or restarts) the Kater debuff. Called by `tickUmgfalln` on waking. */
  private startKater(): void {
    this.katerTicksValue = Math.round(this.tuning.promille.katerDurationTicks);
  }

  /**
   * Ages the Kater debuff by one tick, independent of the Umgfalln/decay
   * branch in `stepPromille` — Kater keeps counting down through both a
   * still-running knockdown (there is none, by construction: it only starts
   * once the knockdown ends) and ordinary post-wake decay.
   */
  tickKater(): void {
    if (this.katerTicksValue <= 0) {
      return;
    }
    this.katerTicksValue -= 1;
  }

  /** Clears the Kater debuff early. Called by the `food` pickup effect — "cleared by eating". */
  clearKater(): void {
    this.katerTicksValue = 0;
  }

  /** Whether the run currently holds at least one copy of an item. */
  hasItem(id: string): boolean {
    const index = this.items.indexOf(id);
    return index >= 0 && this.inventory.has(index);
  }

  /** An item's runtime state (stack count, active charge). Throws for an unknown id. */
  itemState(id: string): ItemRuntimeState {
    const index = this.items.indexOf(id);
    if (index < 0) {
      throw new Error(`No item definition with id "${id}"`);
    }
    return this.inventory.stateOf(index);
  }

  /**
   * Adds one copy of an item to the run: bumps its stack count, folds its
   * `modifyStats` output into the stat pipeline under its own source key
   * (`itemStatSourceKey`), and fires `onPickup` once. Pairs with
   * `removeItem` — see #26's "picking up and losing an item returns the
   * player to exactly the prior state" acceptance criterion.
   */
  pickUpItem(id: string): ItemRuntimeState {
    const index = this.items.indexOf(id);
    if (index < 0) {
      throw new Error(`No item definition with id "${id}"`);
    }
    const state = this.inventory.pickUp(index);
    this.markItemStatsDirty(index);
    this.syncItemStatModifiers();
    const item = this.items.at(index);
    this.reportCollected(item.name, item.description);
    item.hooks.onPickup?.({ sim: this, itemId: id, state });
    return state;
  }

  /**
   * Removes one copy. Only once the last copy of a stack leaves does this
   * clear the item's stat-pipeline source and fire `onRemove` — a stack of
   * three losing one copy is still held, and its stat contribution (if
   * `modifyStats` reads `state.count`) is re-resolved, not zeroed.
   *
   * Returns whether the item is still held afterward.
   */
  removeItem(id: string): boolean {
    const index = this.items.indexOf(id);
    if (index < 0) {
      throw new Error(`No item definition with id "${id}"`);
    }
    const item = this.items.at(index);
    const state = this.inventory.stateOf(index);
    const stillHeld = this.inventory.remove(index);
    this.markItemStatsDirty(index);
    this.syncItemStatModifiers();
    if (!stillHeld) {
      item.hooks.onRemove?.({ sim: this, itemId: id, state });
    }
    return stillHeld;
  }

  /** Adds charge to a held active item, capped at its `maxCharge`. A no-op for an item that is not held or not active. */
  chargeActiveItem(id: string, amount: number): void {
    if (amount <= 0) {
      return;
    }
    const index = this.items.indexOf(id);
    if (index < 0 || !this.inventory.has(index)) {
      return;
    }
    const active = this.items.at(index).active;
    if (active === undefined) {
      return;
    }
    const state = this.inventory.stateOf(index);
    state.charge = Math.min(active.maxCharge, state.charge + amount);
  }

  /**
   * Spends a fully-charged active item: resets its charge to zero and runs
   * `onActivate`. A `consumable` item is removed from the inventory the same
   * call, through `removeItem`, so a single-use item leaves no charge and no
   * stat contribution behind. Returns `false` without effect if the item is
   * not held, is not active, or has not reached `maxCharge`.
   */
  useActiveItem(id: string): boolean {
    const index = this.items.indexOf(id);
    if (index < 0 || !this.inventory.has(index)) {
      return false;
    }
    const item = this.items.at(index);
    const active = item.active;
    if (active === undefined) {
      return false;
    }
    // #32: a `rausch` active item cannot be fired while sober, and vice
    // versa — the same gate every other hook respects, applied here because
    // `onActivate` is a direct call from this method rather than something
    // `sim/systems/items.ts` broadcasts. Charge is left exactly where it was:
    // pressing the button while dormant is a no-op, not a wasted charge.
    if (!promilleRequirementMet(item.promilleRequirement, this.promilleTier)) {
      return false;
    }
    const state = this.inventory.stateOf(index);
    if (state.charge < active.maxCharge) {
      return false;
    }
    state.charge = 0;
    item.hooks.onActivate?.({ sim: this, itemId: id, state });
    if (active.consumable === true) {
      this.removeItem(id);
    }
    return true;
  }

  /**
   * Bans an item id from ever being offered again this run — the same
   * exclusion `takePedestalItem` already applies to whatever it hands the
   * player (`takenItemIds`), exposed as its own entry point for #29's
   * Reinheitsgebot 1516, which needs to close off a whole *category* of
   * items — every "impure" one — the instant it is picked up, rather than
   * one pedestal at a time.
   */
  banItemFromPool(id: string): void {
    this.takenItemIds.add(id);
  }

  /**
   * Re-resolves one item's `modifyStats` output immediately, rather than
   * waiting for the next tick's `syncItemStatModifiers` pass to notice it is
   * dirty.
   *
   * `markItemStatsDirty` only ever ran from `pickUpItem`/`removeItem`
   * because `state.count` — the one thing #26's three items' `modifyStats`
   * hooks read — only ever changed there. #29 is where the first items whose
   * `modifyStats` output depends on something a *hook* changes mid-run
   * showed up: a stacking buff that grows on a kill, a charge that ticks
   * toward a timed burst. `ctx.sim` is all a hook body may call back into
   * (`content-is-data`, `tools/eslint/architecture.js`), so this is the
   * content-safe way for one of them to say "read me again" the moment its
   * own state changes, instead of a stale value surviving up to a tick late.
   */
  refreshItemStats(id: string): void {
    const index = this.items.indexOf(id);
    if (index < 0) {
      return;
    }
    this.markItemStatsDirty(index);
    this.syncItemStatModifiers();
  }

  /**
   * Grants a projectile tag by name (#27, #29) — the content-safe entry
   * point `sim/projectile/tags.ts`'s `addProjectileTag` was documented as
   * existing for, before `content-is-data` turned out to also block the
   * value import that would have taken. An item's `onProjectileSpawn` hook
   * reaches for this instead of the bit itself.
   */
  addProjectileTag(projectile: number, tag: ProjectileTagName): void {
    grantProjectileTag(this.projectiles, projectile, PROJECTILE_TAG_BY_NAME[tag]);
  }

  /**
   * Spawns an ordinary player-team projectile at an explicit origin, run
   * through the same item-hook/tag pipeline `sim/systems/shooting.ts`'s
   * `fire` uses for the shot it spawns directly (#29) — the primitive a
   * multi-shot item (Spezi's second, diverging shot) or a detonation item
   * (Fassldauben's staves) reaches for from its own hook, rather than
   * duplicating `fire`'s muzzle/tag bookkeeping in content. Damage defaults
   * to the resolved Stammwürze; direction is normalised, so a caller handing
   * in a unit vector or a raw offset both work. Returns the projectile's
   * slot, or `NO_SLOT` if the pool was full.
   */
  spawnItemProjectile(
    x: number,
    y: number,
    directionX: number,
    directionY: number,
    options: {
      readonly damage?: number;
      readonly speedScale?: number;
      readonly radiusScale?: number;
      readonly lifetimeScale?: number;
    } = {},
  ): number {
    const tuning = this.tuning.shooting;
    const length = vectorLength(directionX, directionY) || 1;
    const dirX = directionX / length;
    const dirY = directionY / length;
    const speedScale = options.speedScale ?? 1;
    const damage = options.damage ?? Math.round(this.stats.value(StatId.Stammwuerze));
    const slot = this.projectiles.spawn(
      x,
      y,
      dirX * tuning.shotSpeed * speedScale,
      dirY * tuning.shotSpeed * speedScale,
      tuning.shotRadius * (options.radiusScale ?? 1),
      damage,
      Math.max(1, Math.round(tuning.shotLifetimeTicks * (options.lifetimeScale ?? 1))),
      ProjectileTeam.Player,
    );
    if (slot === NO_SLOT) {
      return NO_SLOT;
    }
    dispatchItemProjectileSpawn(this, slot);
    // After the hook, not before — same ordering `fire` itself uses, and for
    // the same reason: an item can still add a tag to this shot from
    // `onProjectileSpawn`, and the counters `finalizeProjectileTags` derives
    // have to be derived from the mask the shot actually ends up carrying.
    finalizeProjectileTags(this, slot);
    return slot;
  }

  /**
   * Area damage centred on a point, through the same `applyDamageAt`
   * chokepoint a Bierfassl blast uses (`systems/bombs.ts`'s `blastCandidate`)
   * — an item's own splash, bite or shatter (#29) landing the exact same
   * flash/knockback/kill package a real hit does, rather than a second,
   * poorer copy of it. `excludeIndex` is skipped entirely — the target a
   * shot already hit directly, say, so a splash never double-counts its own
   * trigger.
   */
  applySplashDamage(x: number, y: number, radius: number, damage: number, excludeIndex = -1): void {
    if (damage <= 0 || radius <= 0) {
      return;
    }
    const mask = CollisionLayer.Enemy | CollisionLayer.Obstacle | CollisionLayer.Player;
    this.broadphase.query(x, y, radius, (index) => {
      if (index === excludeIndex) {
        return;
      }
      const layer = this.collision.data[index * 2] ?? 0;
      if ((layer & mask) === 0) {
        return;
      }
      if ((this.health.data[index * 2] ?? 0) <= 0) {
        return;
      }
      if (index === this.playerIndex && this.playerInvulnerableTicks > 0) {
        return;
      }
      const otherX = this.positionX(index);
      const otherY = this.positionY(index);
      const dx = otherX - x;
      const dy = otherY - y;
      const distance = vectorLength(dx, dy);
      const normalX = distance > 0 ? dx / distance : 0;
      const normalY = distance > 0 ? dy / distance : -1;
      applyDamageAt(this, index, damage, otherX, otherY, normalX, normalY, excludeIndex);
    });
  }

  /**
   * Sets (or refreshes) a status duration directly — burn, poison or freeze
   * — bypassing the tag-on-hit path (`applyStatusTagsOnHit`,
   * `sim/projectile/behavior.ts`) that normally sets one, for an item (#29)
   * that applies a status without a shot landing at all: a continuous aura,
   * a self-inflicted burn. Never shortens an existing duration, same as the
   * tag-on-hit path.
   */
  applyStatusEffect(target: number, status: 'burn' | 'poison' | 'freeze', ticks: number): void {
    if (ticks <= 0) {
      return;
    }
    const data = this.statusEffect.data;
    const base = target * STATUS_EFFECT_STRIDE;
    const slot =
      status === 'burn' ? STATUS_BURN : status === 'poison' ? STATUS_POISON : STATUS_FREEZE;
    data[base + slot] = Math.max(data[base + slot] ?? 0, Math.round(ticks));
  }

  /**
   * Applies `freeze` (#27's slow) to every enemy within `radius` of a point
   * — an item's continuous aura (#29's Obazda) rather than the one-shot
   * duration a hit's own tag sets.
   *
   * Matches on `Enemy | Obstacle`, not `Enemy` alone — the same mask
   * `systems/bombs.ts`'s blast and `findNearestTarget`
   * (`sim/projectile/behavior.ts`) already use. Every enemy in the game
   * today is spawned through `spawnTarget`, which tags it `Obstacle`
   * (`CollisionLayer.Enemy` is reserved but nothing sets it yet); matching
   * `Enemy` alone would make this a no-op against every enemy that exists.
   */
  slowEnemiesNear(x: number, y: number, radius: number, ticks: number): void {
    if (ticks <= 0 || radius <= 0) {
      return;
    }
    const mask = CollisionLayer.Enemy | CollisionLayer.Obstacle;
    this.broadphase.query(x, y, radius, (index) => {
      const layer = this.collision.data[index * 2] ?? 0;
      if ((layer & mask) === 0) {
        return;
      }
      if ((this.health.data[index * 2] ?? 0) <= 0) {
        return;
      }
      this.applyStatusEffect(index, 'freeze', ticks);
    });
  }

  /**
   * Pushes every enemy within `radius` of a point directly away from it
   * (#29's Der Ordner) — through the same `push` component a hit's own
   * knockback already uses (`addPush`, `systems/movement.js`), so it bleeds
   * off the same way and stacks with everything else pushing that enemy.
   *
   * Same `Enemy | Obstacle` mask as `slowEnemiesNear`, for the same reason.
   */
  pushEnemiesNear(x: number, y: number, radius: number, strength: number): void {
    if (strength <= 0 || radius <= 0) {
      return;
    }
    const mask = CollisionLayer.Enemy | CollisionLayer.Obstacle;
    this.broadphase.query(x, y, radius, (index) => {
      const layer = this.collision.data[index * 2] ?? 0;
      if ((layer & mask) === 0) {
        return;
      }
      const otherX = this.positionX(index);
      const otherY = this.positionY(index);
      const dx = otherX - x;
      const dy = otherY - y;
      const distance = vectorLength(dx, dy);
      const dirX = distance > 0 ? dx / distance : 1;
      const dirY = distance > 0 ? dy / distance : 0;
      addPush(this, index, dirX * strength, dirY * strength);
    });
  }

  /**
   * Pulls every enemy within `radius` of a point directly toward it (#59's
   * Fingerhakeln — Bavarian finger-wrestling, an item about dragging your
   * opponent in rather than shoving them off). The exact mirror of
   * `pushEnemiesNear`: same mask, same `addPush` chokepoint, only the
   * direction sign flips, so a pull bleeds off and stacks with other pushes
   * on the same enemy exactly the way a push does.
   */
  pullEnemiesNear(x: number, y: number, radius: number, strength: number): void {
    if (strength <= 0 || radius <= 0) {
      return;
    }
    const mask = CollisionLayer.Enemy | CollisionLayer.Obstacle;
    this.broadphase.query(x, y, radius, (index) => {
      const layer = this.collision.data[index * 2] ?? 0;
      if ((layer & mask) === 0) {
        return;
      }
      const otherX = this.positionX(index);
      const otherY = this.positionY(index);
      const dx = otherX - x;
      const dy = otherY - y;
      const distance = vectorLength(dx, dy);
      const dirX = distance > 0 ? dx / distance : 1;
      const dirY = distance > 0 ? dy / distance : 0;
      addPush(this, index, -dirX * strength, -dirY * strength);
    });
  }

  /**
   * Draws one item from `pool` (`sim/item/pool.ts`'s `selectItemOffer`) and
   * places it on a new pedestal at `(x, y)` — called from `applyCompiledRoom`
   * for every `decorativeProps` entry of type `'pedestal'`, which room
   * templates author positioned but never filled (#28 is what fills them).
   *
   * Draws from `random.items`, the stream `sim/rng/streams.ts` reserves for
   * exactly this — which, together with `taken` only ever growing through
   * `takePedestalItem`, is the whole mechanism behind "the same seed with the
   * same route yields identical item offers": the draw depends on nothing
   * but the run's own deterministic state at the moment the room loads.
   *
   * Pool exhaustion (`selectItemOffer` returning `undefined`) is not an
   * error here either — the pedestal is simply created empty (`itemIndex:
   * -1`), which `activePedestals`/rendering already treat as "nothing to
   * show."
   */
  private spawnPedestal(x: number, y: number): void {
    const pool = pedestalPoolForRole(this.roomSpecialRole);
    const offer = selectItemOffer(
      this.items,
      pool,
      {
        promilleUnlocked: this.promilleUnlocked,
        floor: this.currentFloorValue,
        dusel: this.stats.value(StatId.Dusel),
        taken: this.takenItemIds,
      },
      this.tuning.itemPool,
      this.random.items,
    );
    this.pedestalList.push({
      x,
      y,
      itemIndex: offer === undefined ? -1 : this.items.indexOf(offer.id),
    });
  }

  /** Every pedestal in the current room, for rendering. Read-only — mutate through `takePedestalItem`. */
  get activePedestals(): readonly PedestalRuntime[] {
    return this.pedestalList;
  }

  /**
   * The pedestal/pickup name+description reveal panel, or `null` once it has
   * aged out — set by `takePedestalItem`, decremented in `decayPresentation`
   * the same way `pickupToast` is, and deliberately separate from it: a
   * pedestal's reveal is a longer, deliberate beat (#28's "brief pause, the
   * item held aloft"), not the quick float-past-loot toast every ordinary
   * pickup gets.
   */
  get pedestalReveal(): { readonly name: string; readonly description: string } | null {
    if (this.pedestalRevealTicks <= 0) {
      return null;
    }
    return { name: this.pedestalRevealName, description: this.pedestalRevealDescription };
  }

  /**
   * The index into `activePedestals` of the nearest pedestal within
   * `tuning.itemPool.interactRadius` that still holds an item, or -1.
   *
   * A plain linear scan rather than a broadphase query: a room holds at most
   * a handful of pedestals, this only runs once a tick (`stepPedestal`), and
   * pedestals don't have colliders for the broadphase to index in the first
   * place (see `PedestalRuntime`'s doc comment).
   */
  nearestAvailablePedestal(): number {
    const playerX = this.positionX(this.playerIndex);
    const playerY = this.positionY(this.playerIndex);
    const radius = this.tuning.itemPool.interactRadius;
    const radiusSq = radius * radius;
    let best = -1;
    let bestDistanceSq = radiusSq;
    for (let index = 0; index < this.pedestalList.length; index++) {
      const pedestal = this.pedestalList[index];
      if (pedestal === undefined || pedestal.itemIndex < 0) {
        continue;
      }
      const dx = pedestal.x - playerX;
      const dy = pedestal.y - playerY;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = index;
      }
    }
    return best;
  }

  /**
   * The id of whichever active item the run currently holds, or `null`.
   *
   * At most one is ever held in practice — `takePedestalItem` removes the
   * old one before adding a new one (#28's "swapping active items") — so a
   * plain forward walk that returns the first match is exact, not just an
   * approximation of "the" active item.
   */
  heldActiveItemId(): string | null {
    let found: string | null = null;
    this.inventory.forEachHeld((index) => {
      if (found !== null) {
        return;
      }
      if (this.items.at(index).active !== undefined) {
        found = this.items.at(index).id;
      }
    });
    return found;
  }

  /**
   * Takes (or swaps for) the item on pedestal `pedestalIndex` — `use` near
   * an available pedestal, dispatched by `sim/systems/pedestal.ts`. A no-op
   * if the pedestal has no item (already taken, or spawned empty).
   *
   * An active item already held is removed outright first — the swap loses
   * it rather than returning it to the pedestal or any pool, the same
   * footing as any other choice a run makes under pressure. Never marks the
   * *old* item as "taken": it was taken once already, when it was first
   * picked up, and swapping it away does not put it back in circulation for
   * this run to draw again.
   */
  takePedestalItem(pedestalIndex: number): void {
    const pedestal = this.pedestalList[pedestalIndex];
    if (pedestal === undefined || pedestal.itemIndex < 0) {
      return;
    }
    const item = this.items.at(pedestal.itemIndex);
    if (item.active !== undefined) {
      const held = this.heldActiveItemId();
      if (held !== null && held !== item.id) {
        this.removeItem(held);
      }
    }
    this.pickUpItem(item.id);
    this.takenItemIds.add(item.id);
    pedestal.itemIndex = -1;
    // `pickUpItem` already started the ordinary quick toast — suppressed
    // here in favour of the pedestal's own longer, more deliberate reveal
    // below, which says the same name and description. Showing both at once
    // reads as a UI glitch, not as two separate pieces of news. No hitstop:
    // a pedestal pickup/swap used to freeze the sim for `pickupPauseTicks`
    // while the reveal panel came up, but playtesting found the pause itself
    // read as friction rather than as a beat worth noticing — the panel
    // alone, held up longer, does that job instead.
    this.toastTicks = 0;
    this.pedestalRevealName = item.name;
    this.pedestalRevealDescription = item.description;
    this.pedestalRevealTicks = Math.round(this.tuning.itemPool.revealHoldTicks);
  }

  /** Marks an item's `modifyStats` output stale — drained by `syncItemStatModifiers`. */
  private markItemStatsDirty(index: number): void {
    if ((this.itemStatsDirty[index] ?? 0) !== 0) {
      return;
    }
    this.itemStatsDirty[index] = 1;
    this.dirtyItemIndices[this.dirtyItemCount] = index;
    this.dirtyItemCount += 1;
  }

  /**
   * Re-resolves every dirty item's contribution to the stat pipeline.
   *
   * A no-op source (no `modifyStats` hook, or the item is no longer held)
   * clears its source outright rather than registering an empty modifier
   * list — cheaper for `StatPipeline` to skip entirely, and what makes losing
   * an item's stat effect exact: the source disappears, rather than staying
   * registered with nothing in it.
   */
  private syncItemStatModifiers(): void {
    for (let cursor = 0; cursor < this.dirtyItemCount; cursor++) {
      const index = this.dirtyItemIndices[cursor] ?? 0;
      this.itemStatsDirty[index] = 0;
      const item = this.items.at(index);
      const key = itemStatSourceKey(item.id);
      if (
        !this.inventory.has(index) ||
        item.hooks.modifyStats === undefined ||
        // #32: a `sober`/`rausch` item's stat bonus is gone entirely outside
        // its tier, the same as every other hook — see `syncItemPromilleGate`
        // for what marks this dirty again the moment that stops being true.
        !promilleRequirementMet(item.promilleRequirement, this.promilleTier)
      ) {
        this.stats.clearSource(key);
        continue;
      }
      const state = this.inventory.stateOf(index);
      const source = { kind: 'item' as const, id: item.id, label: item.name };
      const modifiers: StatModifier[] = item.hooks
        .modifyStats(state)
        .map((modifier) => ({ ...modifier, source }));
      if (modifiers.length === 0) {
        this.stats.clearSource(key);
      } else {
        this.stats.setSourceModifiers(key, modifiers);
      }
    }
    this.dirtyItemCount = 0;
  }

  /** True while the simulation is frozen by hitstop. */
  get frozen(): boolean {
    return this.hitstopTicks > 0;
  }

  get hitstop(): number {
    return this.hitstopTicks;
  }

  /** Camera offset for this tick, after the accessibility scale. */
  get shakeX(): number {
    return this.shakeDirectionX * this.shakeMagnitude * this.screenShakeScale;
  }

  get shakeY(): number {
    return this.shakeDirectionY * this.shakeMagnitude * this.screenShakeScale;
  }

  /** Unscaled shake magnitude, for the debug overlay. */
  get shake(): number {
    return this.shakeMagnitude;
  }

  /**
   * Promille camera sway, in pixels — additive alongside `shakeX`/`shakeY`
   * (`render/view.ts` sums both into one camera offset) but with its own
   * accumulator and its own accessibility scale, so `swayScale = 0` never
   * touches a hit's shake.
   *
   * A fixed sinusoid off the tick count rather than anything random: sway is
   * cosmetic but still has to replay identically, and a sine needs no RNG
   * stream to do that.
   */
  get swayX(): number {
    return Math.cos(this.swayPhase()) * this.swayMagnitude();
  }

  get swayY(): number {
    // Same phase, same frequency as X — a sine/cosine pair traces a circle at
    // constant angular speed, so the camera drifts in one continuous loop
    // rather than a two-frequency Lissajous figure whose direction reverses
    // sharply at the crossing points. That reversal read as clunky; a plain
    // circle reads as swaying. Flattened slightly on Y since a room is wider
    // than it is tall.
    return Math.sin(this.swayPhase()) * this.swayMagnitude() * 0.7;
  }

  private swayPhase(): number {
    const period = Math.max(1, this.tuning.promille.swayPeriodTicks);
    return (this.currentTick / period) * Math.PI * 2;
  }

  private swayMagnitude(): number {
    return promilleSwayMagnitude(this.promille, this.tuning.promille) * this.swayScale;
  }

  /**
   * Freezes the simulation for up to `ticks`.
   *
   * The longest request wins rather than the sum: two enemies dying on the same
   * tick should feel like one big hit, not like the game stalling twice.
   */
  requestHitstop(ticks: number): void {
    if (ticks > this.hitstopTicks) {
      this.hitstopTicks = ticks;
    }
  }

  /**
   * Adds directional screenshake, capped hard.
   *
   * The cap is not a suggestion. Shake that scales without a ceiling turns the
   * best moment of a run into motion sickness.
   */
  addShake(directionX: number, directionY: number, magnitude: number): void {
    const cap = this.tuning.impact.maxShake;
    this.shakeMagnitude = Math.min(cap, this.shakeMagnitude + magnitude);
    // The newest hit sets the direction; a shake is a punch, not an average.
    if (directionX !== 0 || directionY !== 0) {
      this.shakeDirectionX = directionX;
      this.shakeDirectionY = directionY;
    }
  }

  /**
   * Removes a body from the world, leaving a splash where it stood.
   *
   * The splash persists for the room. A floor that gradually becomes a record
   * of the fight is worth one sprite per kill.
   */
  kill(index: number): void {
    if (index === this.playerIndex) {
      // The player's slot is the one thing in the world that has to outlive
      // everything else: the camera, the input and every system that says
      // "the player" resolve through it, and a freed slot is handed to the
      // next body that spawns. Losing a run is #15, and it will not be this.
      throw new Error('The player entity cannot be killed');
    }
    // Read before `destroy` queues the slot dying — the mask itself is not
    // cleared until `flush`, but a destructible barrel (#22) is not an
    // authored enemy, and `roomEnemyCount` must only ever count those:
    // decrementing it for anything killed in a loaded room, barrel included,
    // would clear the room — and unlock its doors — one kill early. Same
    // reasoning excludes an enemy whose definition opted out of
    // `locksRoom` (the shopkeeper, `content/enemies/shopkeeper.ts`) — it was
    // never counted in, so killing it must not count it out.
    const enemyMasked = ((this.world.masks[index] ?? 0) & this.enemyMask) === this.enemyMask;
    const wasEnemy =
      enemyMasked && this.enemies.at(this.enemy.data[index * ENEMY_STRIDE] ?? -1).locksRoom;
    const random = this.random.cosmetic;
    this.decals.spawn(
      this.positionX(index),
      this.positionY(index),
      // Smaller than the body that left it. A splash wider than the thing that
      // died reads as the floor having been painted rather than as a corpse.
      (this.body.data[index * 2] ?? 8) * (0.7 + random.nextFloat() * 0.4),
      random.nextFloat() * Math.PI * 2,
    );
    if (this.world.destroy(this.world.entityAt(index))) {
      if (this.roomTemplateLoaded) {
        if (wasEnemy) {
          this.roomEnemyCount = Math.max(0, this.roomEnemyCount - 1);
        }
      } else {
        this.scheduleRespawn(index, TARGET_RESPAWN_TICKS);
      }
    }
  }

  /**
   * Kills an enemy immediately through the same chokepoint a landed shot
   * uses — flash, hitstop, knockback, shake, foam, its own loot and, notably,
   * whatever `splitOnDeath` its current state declares — rather than a
   * second, poorer "just remove it" path.
   *
   * `sim/systems/enemy.ts`'s `crossesSplitThreshold` is the one caller today:
   * it is what ages Die Große Kellerassel (#36) into its next phase at a
   * health fraction instead of at zero. Dealing exactly its own remaining
   * health guarantees `applyDamageAt` takes the `killed` branch.
   */
  forceEnemyDeath(index: number): void {
    const remaining = this.health.data[index * 2] ?? 0;
    if (remaining <= 0) {
      return;
    }
    applyDamageAt(this, index, remaining, this.positionX(index), this.positionY(index), 0, -1, -1);
  }

  step(input: Readonly<InputFrame> = this.idleInput): void {
    this.events.clear();

    // Hitstop freezes everything, including the flash that caused it — which is
    // the point: the white frame is held up for the player to see.
    if (this.hitstopTicks > 0) {
      this.hitstopTicks -= 1;
      this.currentTick += 1;
      return;
    }

    // Presentation decays at the start of a tick, so an effect started at the
    // end of this one survives to be drawn.
    this.decayPresentation();

    // Promille first: movement and shooting both read this tick's tier/drift/
    // wobble, so it has to be settled before either runs.
    stepPromille(this);
    this.syncPromilleModifiers();
    this.syncKaterModifiers();
    // The `sober`/`rausch` item gate (#32): before anything reads `stats`
    // this tick, catch a tier boundary crossed since the last one so a held
    // gated item's stat contribution appears or disappears the same tick the
    // meter actually crosses it, not a tick late.
    this.syncItemPromilleGate();
    // Any item stat contribution a hook changed since the last tick (a stack
    // gained on kill, say) is folded in before anything reads `stats` this
    // tick — same reasoning as Promille just above.
    this.syncItemStatModifiers();

    // Order matters and is fixed: the player moves, then fires from where they
    // now are, then everything already in flight advances. Anything else and a
    // shot appears a tick behind the player who fired it.
    stepPlayerMovement(this, input);
    // Placing a Bierfassl is a player action, same footing as moving — it has
    // to happen before `stepBodies` integrates so a rolled one starts moving
    // on the tick it was thrown, not a tick behind.
    stepBombPlacement(this, input);
    // Same footing as placing a Bierfassl — a player action gated on the same
    // button edge, resolved before anything else this tick.
    stepPedestal(this, input);
    // Enemies decide after the player has moved and before bodies integrate, so
    // a body moves on the same tick as the decision that moved it.
    stepEnemies(this);
    // Before `stepBodies`, deliberately: `freezing` (#27) scales velocity
    // down, and that only slows this tick's movement if it runs before the
    // integration that reads velocity. Burn/poison damage has no such
    // ordering requirement — it rides along here rather than earning a
    // second call site.
    stepStatusEffects(this);
    stepBodies(this);
    stepShooting(this, input);
    stepProjectiles(this);
    stepCollision(this);
    stepContacts(this);
    // Same broadphase, same reasoning as `stepContacts` — enemies pushing
    // each other apart is a separate pass from enemies pushing the player,
    // not a special case inside it.
    stepEnemyContacts(this);
    // After collision, because a blast query reads this tick's broadphase —
    // the same grid `stepPickups` reuses just below.
    stepBombs(this);
    stepPickups(this);
    stepImpact(this);
    // After impact, because impact is what pushes the death events a split
    // (and a loot roll) reads. A body that splits — or drops something — does
    // so on the tick it died.
    stepEnemyDeaths(this);
    stepLootDrops(this);
    if (
      this.roomTemplateLoaded &&
      this.roomEnemyCount === 0 &&
      !this.roomClearedIds.has(this.roomId)
    ) {
      this.rollRoomClearLoot();
      dispatchItemRoomClear(this);
      // The boss's own reward pedestal (`pendingBossPedestals`'s doc
      // comment) — held back until this exact tick rather than spawned the
      // moment the room loaded, so it is not already sitting there during
      // the fight.
      for (const pending of this.pendingBossPedestals) {
        this.spawnPedestal(pending.x, pending.y);
      }
      this.pendingBossPedestals = [];
    }
    if (this.roomTemplateLoaded && this.roomEnemyCount === 0) {
      this.roomClearedIds.add(this.roomId);
    }
    // Every held item's onTick, once this tick's outcomes (hits, kills, the
    // room-clear check above) have all already happened — an item reacting
    // to "this tick" sees the whole of it, not a partial slice.
    stepItemTick(this);
    stepParticles(this);
    this.stepRespawns();

    if (this.roomTransitionTicks > 0) {
      this.roomTransitionTicks -= 1;
    }
    if (this.roomWarmupTicks > 0) {
      this.roomWarmupTicks -= 1;
    }
    if (this.puddleImmuneTicks > 0) {
      this.puddleImmuneTicks -= 1;
    }

    this.previousButtons = input.buttons;
    this.world.flush();
    this.currentTick += 1;
  }

  /** Ages the flash on every body and bleeds the shake down. */
  private decayPresentation(): void {
    const flash = this.flash.data;
    const spawnBounce = this.spawnBounce.data;
    const highWater = this.world.highWater;
    for (let index = 0; index < highWater; index++) {
      const ticks = flash[index] ?? 0;
      if (ticks > 0) {
        flash[index] = ticks - 1;
      }
      const bounce = spawnBounce[index] ?? 0;
      if (bounce > 0) {
        spawnBounce[index] = bounce - 1;
      }
    }

    this.shakeMagnitude *= this.tuning.impact.shakeDamping;
    // Below a fifth of a pixel the camera is not moving, it is jittering.
    if (this.shakeMagnitude < 0.2) {
      this.shakeMagnitude = 0;
    }

    if (this.toastTicks > 0) {
      this.toastTicks -= 1;
    }
    if (this.pedestalRevealTicks > 0) {
      this.pedestalRevealTicks -= 1;
    }
  }

  /** Reads a transform field without the index arithmetic at every call site. */
  positionX(index: number): number {
    return this.transform.data[index * 4] ?? 0;
  }

  positionY(index: number): number {
    return this.transform.data[index * 4 + 1] ?? 0;
  }

  previousX(index: number): number {
    return this.transform.data[index * 4 + 2] ?? 0;
  }

  previousY(index: number): number {
    return this.transform.data[index * 4 + 3] ?? 0;
  }

  /**
   * Where the player lands when a room loads: the room's bounding-box
   * centre, or the nearest clear point around it when that centre itself
   * sits on a block — an obstacle authored there, or (in an `L`/`T` room) the
   * shape's own void corner landing near the middle of the bounding box.
   *
   * `safeSpawnPoint`'s few-step nudge toward the room centre is no use
   * here — the centre *is* the point already blocked, so nudging toward it
   * is a no-op. This spirals outward in rings instead, which actually walks
   * itself off the block rather than just toward it.
   */
  private findPlayerSpawnPoint(radius: number): { x: number; y: number } {
    const centreX = (this.room.minX + this.room.maxX) / 2;
    const centreY = (this.room.minY + this.room.maxY) / 2;
    if (this.room.isClear(centreX, centreY, radius)) {
      return { x: centreX, y: centreY };
    }
    const ringStep = 8;
    const samplesPerRing = 12;
    const maxRadius = Math.max(this.room.maxX - this.room.minX, this.room.maxY - this.room.minY);
    for (let ringRadius = ringStep; ringRadius <= maxRadius; ringRadius += ringStep) {
      for (let sample = 0; sample < samplesPerRing; sample++) {
        const angle = (sample / samplesPerRing) * Math.PI * 2;
        const x = centreX + Math.cos(angle) * ringRadius;
        const y = centreY + Math.sin(angle) * ringRadius;
        if (this.room.isClear(x, y, radius)) {
          return { x, y };
        }
      }
    }
    // Every ring blocked is not a case any authored room should produce
    // (`tests/content/rooms.test.ts` compiles every template), so this is
    // the same "place it anyway rather than not spawn at all" fallback
    // `safeSpawnPoint` uses.
    return { x: centreX, y: centreY };
  }

  private spawnPlayer(): Entity {
    const entity = this.world.create();
    this.world.add(entity, this.transform);
    this.world.add(entity, this.velocity);
    this.world.add(entity, this.body);
    this.world.add(entity, this.push);
    this.world.add(entity, this.collision);
    this.world.add(entity, this.health);
    this.world.add(entity, this.contactDamage);
    this.world.add(entity, this.flash);

    const index = entityIndex(entity);
    const spawnPoint = this.findPlayerSpawnPoint(PLAYER_RADIUS);
    const startX = spawnPoint.x;
    const startY = spawnPoint.y;
    const transform = this.transform.data;
    transform[index * 4] = startX;
    transform[index * 4 + 1] = startY;
    transform[index * 4 + 2] = startX;
    transform[index * 4 + 3] = startY;

    const body = this.body.data;
    body[index * 2] = PLAYER_RADIUS;
    body[index * 2 + 1] = 1;

    const health = this.health.data;
    health[index * 2] = PLAYER_HEALTH;
    health[index * 2 + 1] = PLAYER_HEALTH;
    this.contactDamage.data[index] = 0;

    this.setCollisionLayer(index, CollisionLayer.Player);

    return entity;
  }

  /**
   * Six things to shoot at, none of which shoot back.
   *
   * The impact rig: one of each size class in reach of the middle of the room,
   * so the three read against each other rather than against a memory of the
   * last one. Nothing here behaves — that is what `spawnEnemyRoom` is for.
   */
  private spawnTrainingTargets(): void {
    const midX = (this.room.minX + this.room.maxX) / 2;
    const midY = (this.room.minY + this.room.maxY) / 2;
    this.addPost(this.room.minX + 45, midY, EnemySize.Mid, -1);
    this.addPost(this.room.maxX - 45, midY - 35, EnemySize.Mid, -1);
    this.addPost(this.room.maxX - 45, midY + 35, EnemySize.Normal, -1);
    this.addPost(midX - 55, this.room.minY + 30, EnemySize.Normal, -1);
    this.addPost(midX - 30, this.room.maxY - 30, EnemySize.Mini, -1);
    this.addPost(midX + 30, this.room.maxY - 30, EnemySize.Mini, -1);
  }

  /**
   * The floor-one roster, retained for the tuning fallback; authored rooms use #19.
   *
   * One of each authored enemy, arranged so that what each of them teaches is
   * legible on its own: the Kellerasseln come at the player from opposite
   * corners, the Bierratten from the other two, the Schimmelfleck sits where it
   * cannot be ignored, and the Zapfhahn covers the right-hand wall the player
   * has to cross in front of.
   */
  private spawnEnemyRoom(): void {
    const midX = (this.room.minX + this.room.maxX) / 2;
    const midY = (this.room.minY + this.room.maxY) / 2;
    this.addEnemyPost('kellerassel', this.room.minX + 40, this.room.minY + 30);
    this.addEnemyPost('kellerassel', this.room.maxX - 60, this.room.maxY - 30);
    this.addEnemyPost('bierratte', this.room.maxX - 40, this.room.minY + 26);
    this.addEnemyPost('bierratte', this.room.minX + 36, this.room.maxY - 26);
    this.addEnemyPost('schimmelfleck', midX, this.room.minY + 24);
    // Against the right-hand wall, since it is a tap in one.
    this.addEnemyPost('zapfhahn', this.room.maxX - 10, midY);

    // Hand-placed clear of the pillars and the posts above, same "replaced
    // by #18/#20" spirit as the rest of this room. Unlike a post, a
    // collected pickup does not come back — there's no need for one yet.
    // None of these sit at (midX, midY) — that's the player's own spawn
    // point (see `spawnPlayer`), and a pickup there is collected before the
    // player has done anything to earn it.
    this.spawnPickup('beer', midX + 30, midY - 30);
    this.spawnPickup('beer', this.room.minX + 100, this.room.maxY - 30);
    this.spawnPickup('beer', this.room.maxX - 100, this.room.minY + 40);
    this.spawnPickup('beer', this.room.minX + 50, midY + 10);
    // A dozen total, well past PROMILLE_MAX even accounting for decay and
    // travel time between them — a full "beer crawl" across the room lets a
    // playtester walk every tier, including Umgfalln, in one lap rather than
    // reaching only partway up Beduselt. Dev/testing convenience; the real
    // drop table is #22.
    this.spawnPickup('beer', this.room.minX + 20, midY - 30);
    this.spawnPickup('beer', this.room.minX + 90, this.room.minY + 30);
    this.spawnPickup('beer', midX - 10, this.room.maxY - 20);
    this.spawnPickup('beer', this.room.maxX - 110, midY + 45);
    this.spawnPickup('beer', this.room.maxX - 55, this.room.minY + 10);
    this.spawnPickup('beer', this.room.maxX - 20, this.room.maxY - 20);
    this.spawnPickup('beer', midX + 20, this.room.maxY - 40);
    this.spawnPickup('beer', midX - 30, this.room.minY + 20);
  }

  /** Puts an authored enemy on a post, by the id its definition states. */
  private addEnemyPost(id: string, x: number, y: number): void {
    this.addPost(x, y, EnemySize.Normal, this.enemies.indexOf(id));
  }

  /**
   * Adds a post and the body standing on it.
   *
   * A post holding a definition index brings that enemy back; one holding -1
   * brings back a plain training target of its size class.
   */
  private addPost(x: number, y: number, size: EnemySizeId, definition: number): void {
    this.postX.push(x);
    this.postY.push(y);
    this.postSize.push(size);
    this.postDefinition.push(definition);
    this.postRespawnAt.push(-1);
    this.spawnOnPost(this.postX.length - 1);
  }

  /** Puts what a post holds back on it, and tells the body which post that is. */
  private spawnOnPost(post: number): void {
    const x = this.postX[post] ?? 0;
    const y = this.postY[post] ?? 0;
    const definition = this.postDefinition[post] ?? -1;
    const entity =
      definition >= 0
        ? this.spawnEnemyKind(definition, x, y)
        : this.spawnEnemy(x, y, this.postSize[post] ?? EnemySize.Mid);
    this.spawnPost.data[entityIndex(entity)] = post;
  }

  /**
   * Brings back what stood on a post a couple of seconds after it died.
   *
   * A post the player is standing on waits, and keeps waiting, rather than
   * spawning a body inside them. Contact separation would sort it out over the
   * next few ticks, and every one of those ticks looks like the player being
   * born out of an enemy — or, for something heavy, like the player shoving a
   * wall-mounted tap off its wall.
   */
  private stepRespawns(): void {
    for (let post = 0; post < this.postRespawnAt.length; post++) {
      const due = this.postRespawnAt[post] ?? -1;
      if (due < 0 || this.currentTick < due) {
        continue;
      }
      if (!this.postClearOfPlayer(post)) {
        continue;
      }
      this.postRespawnAt[post] = -1;
      this.spawnOnPost(post);
    }
  }

  /** True when the body a post holds would not appear inside the player. */
  private postClearOfPlayer(post: number): boolean {
    const definition = this.postDefinition[post] ?? -1;
    const radius =
      definition >= 0
        ? this.enemies.at(definition).radius
        : ENEMY_PROFILES[this.postSize[post] ?? EnemySize.Mid].radius;

    const player = this.playerIndex;
    const dx = (this.postX[post] ?? 0) - this.positionX(player);
    const dy = (this.postY[post] ?? 0) - this.positionY(player);
    const reach = radius + (this.body.data[player * 2] ?? 0);
    return dx * dx + dy * dy > reach * reach;
  }

  /**
   * Schedules the return of the post the body at `index` was standing on.
   *
   * Read off the body rather than matched by position: a Kellerassel dies a
   * long walk from where it started, and a body that was never on a post — the
   * spores a Schimmelfleck leaves, whatever a future item summons — carries -1
   * and stays dead.
   */
  private scheduleRespawn(index: number, delayTicks: number): void {
    const post = this.spawnPost.data[index] ?? -1;
    if (post < 0 || post >= this.postRespawnAt.length) {
      return;
    }
    if ((this.postRespawnAt[post] ?? -1) >= 0) {
      return;
    }
    this.postRespawnAt[post] = this.currentTick + delayTicks;
  }

  /**
   * Adds one shootable body of a named size class.
   *
   * The size decides everything about it that the player can feel, which is the
   * point of having classes at all rather than four numbers per spawn call. It
   * does not behave: this is the body an authored enemy is built on, and what
   * the stress scene and the collision tests populate a room with.
   */
  spawnEnemy(x: number, y: number, size: EnemySizeId): Entity {
    const profile = ENEMY_PROFILES[size];
    const entity = this.spawnTarget(x, y, profile.radius);
    const index = entityIndex(entity);

    const body = this.body.data;
    body[index * 2 + 1] = profile.mass;

    const health = this.health.data;
    health[index * 2] = profile.health;
    health[index * 2 + 1] = profile.health;

    this.contactDamage.data[index] = profile.contactDamage;
    return entity;
  }

  /**
   * Adds one authored enemy, by its index in the registry.
   *
   * An index rather than an id, because this is called from the enemy system
   * while a body is splitting, and a string lookup in the frame loop is one the
   * registry already did at construction.
   *
   * `elite` (#156) is the modifier layer applied at spawn rather than
   * thirteen more hand-authored creatures: bigger, tougher and harder-
   * hitting than the same definition's ordinary spawn, by the multipliers
   * in `tuning.enemy`, with `ENEMY_FLAG_ELITE` set so the renderer can tint
   * it — "reads as elite at a glance, without needing a health bar to tell
   * you." A boss's own `splitOnDeath` (its phase two) never passes this;
   * see `applyCompiledRoom` for the one call site that rolls it.
   */
  spawnEnemyKind(definition: number, x: number, y: number, elite = false): Entity {
    const compiled = this.enemies.at(definition);
    const sizeMultiplier = elite ? this.tuning.enemy.eliteRadiusMultiplier : 1;
    const entity = this.spawnTarget(x, y, compiled.radius * sizeMultiplier);
    const index = entityIndex(entity);

    this.world.add(entity, this.enemy);
    this.world.add(entity, this.enemyMotion);

    const body = this.body.data;
    body[index * 2 + 1] = compiled.mass * sizeMultiplier;

    const health = this.health.data;
    const maxHealth = elite
      ? Math.round(compiled.health * this.tuning.enemy.eliteHealthMultiplier)
      : compiled.health;
    health[index * 2] = maxHealth;
    health[index * 2 + 1] = maxHealth;
    this.contactDamage.data[index] = elite
      ? Math.round(compiled.contactDamage * this.tuning.enemy.eliteContactDamageMultiplier)
      : compiled.contactDamage;

    // `add` zeroed both components, which is most of the state a body starts
    // in: no ticks in the state, and none of the flags a transition reads.
    const enemy = this.enemy.data;
    enemy[index * ENEMY_STRIDE] = definition;
    enemy[index * ENEMY_STRIDE + 1] = compiled.initialState;
    if (elite) {
      enemy[index * ENEMY_STRIDE + 3] = ENEMY_FLAG_ELITE;
    }

    // Heading east, and the spawn point `orbitPoint` circles.
    const motion = this.enemyMotion.data;
    const motionBase = index * ENEMY_MOTION_STRIDE;
    motion[motionBase] = 1;
    motion[motionBase + 2] = x;
    motion[motionBase + 3] = y;

    if (this.roomTemplateLoaded && compiled.locksRoom) {
      this.roomEnemyCount += 1;
    }

    return entity;
  }

  /**
   * The elite roll's chance on a given floor (#156) — `eliteChanceBase` plus
   * one `eliteChancePerExtraFloor` for every floor past the first, capped at
   * `eliteChanceMax`. The one place `applyCompiledRoom` needs this number,
   * pulled out so the roll itself reads as "spawn, maybe elite" rather than
   * the arithmetic living inline in that loop.
   */
  private eliteChanceForFloor(floor: number): number {
    const tuning = this.tuning.enemy;
    const chance =
      tuning.eliteChanceBase + Math.max(0, floor - 1) * tuning.eliteChancePerExtraFloor;
    return Math.min(tuning.eliteChanceMax, chance);
  }

  spawnTarget(x: number, y: number, radius: number = TARGET_RADIUS): Entity {
    const entity = this.world.create();
    this.world.add(entity, this.transform);
    this.world.add(entity, this.velocity);
    this.world.add(entity, this.body);
    this.world.add(entity, this.push);
    this.world.add(entity, this.collision);
    this.world.add(entity, this.health);
    this.world.add(entity, this.contactDamage);
    this.world.add(entity, this.flash);
    this.world.add(entity, this.spawnPost);

    const index = entityIndex(entity);
    const transform = this.transform.data;
    transform[index * 4] = x;
    transform[index * 4 + 1] = y;
    transform[index * 4 + 2] = x;
    transform[index * 4 + 3] = y;

    const body = this.body.data;
    body[index * 2] = radius;
    body[index * 2 + 1] = 3;

    const health = this.health.data;
    health[index * 2] = TARGET_HEALTH;
    health[index * 2 + 1] = TARGET_HEALTH;

    // Written rather than assumed clear: slots are recycled, and a body that
    // inherited the contact damage of whatever last used its slot is a bug that
    // only shows up after something died.
    this.contactDamage.data[index] = 0;
    // Nothing brings this one back unless a post claims it.
    this.spawnPost.data[index] = -1;

    this.setCollisionLayer(index, CollisionLayer.Obstacle);
    return entity;
  }

  /**
   * A pickup (#22) — deliberately the leanest entity in the world.
   *
   * `spawnTarget` adds health, contact damage, flash and a respawn post, none
   * of which a pickup needs; this carries only what `stepPickups` (overlap
   * detection, and the effect a collection resolves to) and `EntityView`
   * (rendering, via `collidableMask`) actually read. It never moves through
   * the physics integrator, so it carries no `velocity` — `stepPickups`
   * nudges a magnetised one's `transform` directly instead.
   *
   * `price`, when given and above zero, adds the `pickupPrice` component — a
   * shop's stock. `sim/systems/pickup.ts`'s `collect` reads its *presence*
   * as "this one must be paid for," not the value alone, so an omitted or
   * zero price is indistinguishable from any other pickup in the game.
   */
  spawnPickup(kindId: string, x: number, y: number, price?: number): Entity {
    const definitionIndex = this.pickups.indexOf(kindId);
    if (definitionIndex < 0) {
      throw new Error(`Unknown pickup kind "${kindId}"`);
    }
    const definition = this.pickups.at(definitionIndex);
    const priced = price !== undefined && price > 0;

    const entity = this.world.create();
    this.world.add(entity, this.transform);
    this.world.add(entity, this.body);
    this.world.add(entity, this.collision);
    this.world.add(entity, this.pickupKind);
    this.world.add(entity, this.spawnBounce);
    if (priced) {
      this.world.add(entity, this.pickupPrice);
    }

    const index = entityIndex(entity);
    const transform = this.transform.data;
    transform[index * 4] = x;
    transform[index * 4 + 1] = y;
    transform[index * 4 + 2] = x;
    transform[index * 4 + 3] = y;

    const body = this.body.data;
    body[index * 2] = definition.radius;
    body[index * 2 + 1] = 1;

    // A recycled slot keeps whatever `velocity`/`push` a previous occupant
    // left behind — most visibly the very enemy this pickup just dropped
    // from, mid-knockback when it died. A pickup never adds either
    // component (see this method's doc comment), but `stepBodies` moves
    // anything matching `collidableMask` regardless, stale data included, so
    // without this a dropped pickup can inherit a dead enemy's motion and
    // drift indefinitely instead of landing where it dropped.
    this.velocity.data[index * 2] = 0;
    this.velocity.data[index * 2 + 1] = 0;
    this.push.data[index * 2] = 0;
    this.push.data[index * 2 + 1] = 0;

    this.pickupKind.data[index] = definitionIndex;
    // Purely cosmetic — `EntityView` reads this down to pop the sprite on
    // spawn, and nothing else in the simulation looks at it.
    this.spawnBounce.data[index] = Math.round(this.tuning.pickup.spawnBounceTicks);
    if (priced) {
      this.pickupPrice.data[index] = price;
    }

    this.setCollisionLayer(index, CollisionLayer.Pickup);
    return entity;
  }

  /**
   * A Bierfassl, live and fused — placed or rolled from inventory by
   * `stepBombPlacement`, never by a room template (a room-authored Bierfassl
   * is the ordinary `spawnPickup('bierfassl', ...)` that adds to inventory,
   * same as any other pickup).
   *
   * `rolling` decides "set down" from "rolled": a set-down keg carries no
   * `velocity` at all, so `stepBodies` never touches its position; a rolled
   * one gets one, and `stepBombs` applies its own drag to it every tick since
   * `stepBodies` only damps `push`, not `velocity` (see `bodies.ts`).
   */
  spawnBierfassl(
    x: number,
    y: number,
    rollDirX: number,
    rollDirY: number,
    rolling: boolean,
  ): Entity {
    const entity = this.world.create();
    this.world.add(entity, this.transform);
    this.world.add(entity, this.body);
    this.world.add(entity, this.collision);
    this.world.add(entity, this.bombFuse);
    this.world.add(entity, this.contactDamage);
    if (rolling) {
      this.world.add(entity, this.velocity);
    }

    const index = entityIndex(entity);
    const transform = this.transform.data;
    transform[index * 4] = x;
    transform[index * 4 + 1] = y;
    transform[index * 4 + 2] = x;
    transform[index * 4 + 3] = y;

    const body = this.body.data;
    body[index * 2] = BOMB_RADIUS;
    body[index * 2 + 1] = 4;

    if (rolling) {
      const speed = this.tuning.pickup.bombRollSpeed;
      this.velocity.data[index * 2] = rollDirX * speed;
      this.velocity.data[index * 2 + 1] = rollDirY * speed;
    }

    // Written rather than assumed clear: slots are recycled, and a keg that
    // inherited the contact damage of whatever last used its slot is a bug
    // that only shows up after something died there — `stepContacts` reads
    // this straight out of the shared array, not gated by whether the entity
    // was ever given the component, so a fresh Bierfassl was hurting the
    // player on touch before it ever exploded. Same fix `spawnTarget` already
    // has, for the same reason.
    this.contactDamage.data[index] = 0;

    this.bombFuse.data[index] = Math.round(this.tuning.pickup.bombFuseTicks);
    this.setCollisionLayer(index, CollisionLayer.Obstacle);

    // It spawns exactly where the player is standing — `stepContacts`
    // otherwise reads that as two solid bodies dead-centre on each other and
    // shoves the player off in `resolveAgainstPlayer`'s fixed concentric
    // direction, which reads as the keg flinging them rather than as having
    // set something down. Suspended until they step off it on their own.
    this.freshBombEntity = entity;
    return entity;
  }

  /**
   * Whether `other` is the Bierfassl just placed under the player and still
   * touching them — `stepContacts` skips separation entirely while this is
   * true, rather than shoving the player off what they just set down.
   *
   * `stillOverlapping` is the caller's own overlap test, done once already for
   * its normal resolution — passed in rather than redone here. The moment it
   * goes false, the suspension ends for good: `other` was only ever the one
   * most-recently-placed bomb, and this is the one place that clears it.
   */
  suspendsPlayerContact(other: number, stillOverlapping: boolean): boolean {
    const fresh = this.freshBombEntity;
    if (fresh === null || !this.world.isAlive(fresh) || entityIndex(fresh) !== other) {
      return false;
    }
    if (!stillOverlapping) {
      this.freshBombEntity = null;
      return false;
    }
    return true;
  }

  /**
   * A spawn point clear of walls and obstacles, nudged toward the room's
   * centre when the one asked for is not — the acceptance criterion "pickups
   * cannot spawn inside walls or under obstacles," made a chokepoint every
   * spawn site (loot rolls, room-clear rolls, room-authored `pickupSpawns`)
   * routes through rather than re-implements.
   *
   * A few discrete steps toward the centre, not a search: a room is small
   * enough that "closer to the middle" reliably finds daylight, and giving up
   * and placing it exactly where asked (same as `splitFromEvent`'s corpse
   * fallback in `systems/enemy.ts`) is a better failure than not spawning it.
   */
  private safeSpawnPoint(x: number, y: number, radius: number): { x: number; y: number } {
    if (this.room.isClear(x, y, radius)) {
      return { x, y };
    }
    const centreX = (this.room.minX + this.room.maxX) / 2;
    const centreY = (this.room.minY + this.room.maxY) / 2;
    for (let step = 1; step <= 4; step++) {
      const t = step / 4;
      const candidateX = x + (centreX - x) * t;
      const candidateY = y + (centreY - y) * t;
      if (this.room.isClear(candidateX, candidateY, radius)) {
        return { x: candidateX, y: candidateY };
      }
    }
    return { x, y };
  }

  /**
   * Rolls one outcome from `table` and spawns it near `(x, y)`, or spawns
   * nothing for the `null` "nothing drops" outcome. The one place a drop
   * table is read: `stepLootDrops` (enemy deaths) and `rollRoomClearLoot`
   * (room clear) both call this rather than rolling their own way, so
   * sober/promilled selection and need-weighting only exist once.
   */
  dropLoot(table: DropTable, x: number, y: number): void {
    const entries = this.promilleUnlocked ? table.promilled : table.sober;
    let total = 0;
    for (const entry of entries) {
      total += entry.weight * this.needMultiplierFor(entry.pickupId);
    }
    if (total <= 0) {
      return;
    }
    let roll = this.random.items.nextFloat() * total;
    let chosen: string | null = null;
    for (const entry of entries) {
      roll -= entry.weight * this.needMultiplierFor(entry.pickupId);
      if (roll < 0) {
        chosen = entry.pickupId;
        break;
      }
    }
    if (chosen === null) {
      return;
    }
    const radius = this.pickups.get(chosen).radius;
    const safe = this.safeSpawnPoint(x, y, radius);
    this.spawnPickup(chosen, safe.x, safe.y);
  }

  /**
   * The multiplier a table entry's weight is scaled by: boosted when the
   * player is low on whatever the pickup grants, otherwise 1. Reads the
   * *resolved* `PickupDefinition.effect`, not the id string, so a new pickup
   * that reuses an existing effect kind is weighted correctly with no change
   * here — the whole point of keeping "what this grants" as data rather than
   * as a name to pattern-match. The `null` "nothing drops" outcome has no
   * need concept and is never boosted.
   */
  private needMultiplierFor(pickupId: string | null): number {
    if (pickupId === null) {
      return 1;
    }
    const tuning = this.tuning.pickup;
    const effect = this.pickups.get(pickupId).effect;
    let low = false;
    if (effect.kind === 'health') {
      low =
        effect.pool === 'red'
          ? this.playerHealth < PLAYER_HEALTH * tuning.needThreshold
          : effect.pool === 'soul'
            ? this.soulHp === 0
            : this.eternalHp === 0;
    } else if (effect.kind === 'food') {
      low = this.playerHealth < PLAYER_HEALTH * tuning.needThreshold;
    } else if (effect.kind === 'currency') {
      low = this.biermarkenCount === 0;
    } else if (effect.kind === 'bombs') {
      low = this.bombsCount === 0;
    } else if (effect.kind === 'keys') {
      low = this.keysCount === 0;
    }
    return low ? tuning.needMultiplier : 1;
  }

  /**
   * The room-clear roll: fired once, the first tick a room reads as cleared,
   * from `step()` right before `roomClearedIds` records that it happened.
   * Kept a private method rather than a system, unlike enemy-death loot —
   * "has this room already paid out" is `roomClearedIds`, which nothing
   * outside `GameSim` has a reason to see.
   *
   * A boss room's clear rolls `BOSS_REWARD_DROP_TABLE` instead of the
   * ordinary one — richer when it pays out, but a bonus on top of the room's
   * own pedestal item (`pedestalPoolForRole`), not a second guaranteed
   * reward stacked on it. The pedestal item is the boss reward; this can
   * add a coin or a keg on top of it, or nothing at all.
   */
  private rollRoomClearLoot(): void {
    const centreX = (this.room.minX + this.room.maxX) / 2;
    const centreY = (this.room.minY + this.room.maxY) / 2;
    const table = this.roomSpecialRole === 'boss' ? BOSS_REWARD_DROP_TABLE : ROOM_CLEAR_DROP_TABLE;
    this.dropLoot(table, centreX, centreY);
  }

  private setCollisionLayer(index: number, layer: CollisionLayerId): void {
    const collision = this.collision.data;
    collision[index * 2] = layer;
    collision[index * 2 + 1] = collisionMaskFor(layer);
  }
}
