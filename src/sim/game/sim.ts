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
import { type RunRandom, createRunRandom } from '../rng/streams.js';
import { drawDeathWord } from './death-word.js';
import {
  PROMILLE_MAX,
  PromilleTier,
  type PromilleTierId,
  promilleDamageMultiplier,
  promilleDriftScale,
  promilleFireRateMultiplier,
  promilleTierOf,
  promilleWobbleAmplitude,
  promilleSwayMagnitude,
} from './promille.js';
import { DOOR_SPAN, type RoomGeometry } from '../room/geometry.js';
import { createPlaygroundRoom } from '../room/playground.js';
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
import { type CollisionLayerId, CollisionLayer, collisionMaskFor } from '../collision/layers.js';
import { SpatialHash } from '../collision/spatial-hash.js';
import { EventQueue } from '../events/queue.js';
import { DamageNumberStore } from '../particle/damage-numbers.js';
import { DecalStore } from '../particle/decals.js';
import { ParticleStore } from '../particle/store.js';
import { ProjectileStore } from '../projectile/store.js';
import { stepPlayerMovement } from '../systems/movement.js';
import { stepBodies } from '../systems/bodies.js';
import { stepCollision } from '../systems/collision.js';
import { stepContacts } from '../systems/contact.js';
import {
  ENEMY_MOTION_STRIDE,
  ENEMY_STRIDE,
  stepEnemies,
  stepEnemyDeaths,
} from '../systems/enemy.js';
import { stepBombPlacement } from '../systems/bomb-placement.js';
import { stepBombs } from '../systems/bombs.js';
import { stepImpact, stepParticles } from '../systems/impact.js';
import { stepLootDrops } from '../systems/loot.js';
import { stepPickups } from '../systems/pickup.js';
import { stepPromille } from '../systems/promille.js';
import { stepProjectiles, stepShooting } from '../systems/shooting.js';

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

export type RoomDirection = 'north' | 'east' | 'south' | 'west';

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
  readonly floor?: number;
  /** Door directions to load hidden — see `loadRoom`'s `hiddenDoors` parameter. */
  readonly hiddenDoors?: readonly RoomDirection[];
  /** Projectile pool size. Lowered by tests that want to watch it overflow. */
  readonly projectileCapacity?: number;
  readonly particleCapacity?: number;
  /** Defaults to `targets`; see `RoomPopulation`. */
  readonly population?: RoomPopulation;
  /** Enemy data. Defaults to everything in `src/content/enemies/`. */
  readonly enemies?: readonly EnemyDefinition[];
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
   * Ticks left of the Umgfalln knockdown — set by `addPromille` when a raise
   * crosses the top tier. Movement and firing both check this directly rather
   * than going through a generic "stunned" flag, since nothing else stuns the
   * player yet.
   */
  private umgfallnTicksValue = 0;

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
   * Door directions this room load hid (see `loadRoom`'s `hiddenDoors`) that
   * a nearby Bierfassl blast has not yet revealed. `revealBombableWalls`
   * removes an entry the instant its wall opens; cleared and rebuilt fresh
   * on every `loadRoom`, since which walls are bombable is per-instance
   * (decided by the caller, not the template).
   *
   * Direction-keyed, not per-`CompiledDoor`: a secret/supersecret room is
   * always `1x1` today, so the room it hides behind never has more than one
   * door per direction in practice. Hiding by direction reveals every door
   * that direction has, which is exactly one, every time this is actually
   * exercised.
   */
  private readonly bombableWalls = new Set<RoomDirection>();
  /** The loaded room's `metadata.specialRole`, or `undefined` for a normal room. */
  private roomSpecialRole: RoomSpecialRole | undefined = undefined;
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
    this.collidableMask = this.world.maskOf(this.transform, this.body, this.collision);
    this.enemyMask = this.world.maskOf(this.enemy, this.enemyMotion);

    this.enemies = new EnemyRegistry(options.enemies ?? ENEMY_DEFINITIONS);
    this.pickups = new PickupRegistry(PICKUP_DEFINITIONS);
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
      this.loadRoom(options.roomTemplate, options.floor ?? 1, null, options.hiddenDoors ?? []);
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
   * borders a real neighbour. A hidden/bombable direction (`bombableWalls`)
   * is excluded here — a solid wall, until `revealBombableWalls` opens it.
   */
  get doors(): readonly CompiledDoor[] {
    return this.bombableWalls.size === 0
      ? this.roomDoors
      : this.roomDoors.filter((door) => !this.bombableWalls.has(door.direction));
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
    for (const direction of this.bombableWalls) {
      const door = this.roomDoors.find((candidate) => candidate.direction === direction);
      if (door === undefined) {
        continue;
      }
      const point = doorCentre(this.room, door);
      const dx = point.x - x;
      const dy = point.y - y;
      if (dx * dx + dy * dy <= radius * radius) {
        this.bombableWalls.delete(direction);
      }
    }
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
    const half = DOOR_SPAN / 2;

    for (const door of this.doors) {
      const centre = doorCentre(this.room, door);
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
   * `hiddenDoors` — directions the template itself has a door on, but which
   * load closed and solid rather than open, and remembered in
   * `bombableWalls` so a nearby Bierfassl blast can reveal them
   * (`revealBombableWalls`, called from `sim/systems/bombs.ts`). This is how
   * a secret/supersecret room connects: not a different door shape, the same
   * door drawn shut until bombed. The caller (`app/main.ts`, which owns the
   * floor plan) decides which directions those are for the room it's
   * loading — `GameSim` only knows one room's template at a time.
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
    hiddenDoors: readonly RoomDirection[] = [],
    placement?: RoomPlacement,
    entryCell: { readonly col: number; readonly row: number } = { col: 0, row: 0 },
  ): void {
    const compiled = compileRoomTemplate(
      template,
      floor,
      'room template',
      ENEMY_DEFINITIONS,
      placement,
    );
    this.clearRoomEntities();
    this.room = compiled.geometry;
    this.roomId = compiled.source.id;
    this.roomDoors = compiled.doors;
    this.bombableWalls.clear();
    for (const hidden of hiddenDoors) {
      if (this.roomDoors.some((door) => door.direction === hidden)) {
        this.bombableWalls.add(hidden);
      }
    }
    this.roomSpecialRole = compiled.source.metadata.specialRole;
    this.roomTemplateLoaded = true;
    this.roomTransitionTicks = direction === null ? 0 : ROOM_TRANSITION_TICKS;
    this.roomTransitionDirection = direction;
    this.roomWarmupTicks = ROOM_WARMUP_TICKS;
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
        this.spawnEnemyKind(definition, spawn.x, spawn.y);
      }
      for (const pickup of compiled.pickupSpawns) {
        const definition = this.pickups.indexOf(pickup.type);
        if (definition < 0) {
          throw new Error(`room template pickup "${pickup.type}" is not registered`);
        }
        const safe = this.safeSpawnPoint(pickup.x, pickup.y, this.pickups.at(definition).radius);
        this.spawnPickup(pickup.type, safe.x, safe.y, pickup.price);
      }
      // Decorative props are art (#18) except one type: a barrel is a
      // destructible obstacle, so a room author drops a Bierfassl at one for
      // free and `npm run dev` always has something to demonstrate that on.
      for (const prop of compiled.decorativeProps) {
        if (prop.type === 'barrel') {
          this.spawnTarget(prop.x, prop.y, TARGET_RADIUS);
        }
      }
    }
    if (this.roomEnemyCount === 0) {
      this.roomClearedIds.add(this.roomId);
    }
    this.world.flush();
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
    hiddenDoors: readonly RoomDirection[] = [],
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
   * `entryCell`'s wall facing `direction`, or the room's centre for the very
   * first room of a run (`direction === null`, no door was walked through).
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
      return {
        x: (this.room.minX + this.room.maxX) / 2,
        y: (this.room.minY + this.room.maxY) / 2,
      };
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

  /** Biermarken banked. */
  get biermarken(): number {
    return this.biermarkenCount;
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

  /** Current Promille, 0–5. Backed by `tuning.promille.current` — see `tuning.ts`. */
  get promille(): number {
    return this.tuning.promille.current;
  }

  get promilleTier(): PromilleTierId {
    return promilleTierOf(this.promille);
  }

  /** Ticks left of the Umgfalln knockdown. Zero means the player can move and fire. */
  get umgfallnTicks(): number {
    return this.umgfallnTicksValue;
  }

  get promilleDamageMultiplier(): number {
    return promilleDamageMultiplier(this.promilleTier, this.tuning.promille);
  }

  get promilleFireRateMultiplier(): number {
    return promilleFireRateMultiplier(this.promilleTier, this.tuning.promille);
  }

  get promilleDriftScale(): number {
    return promilleDriftScale(this.promille, this.tuning.promille);
  }

  get promilleWobbleAmplitude(): number {
    return promilleWobbleAmplitude(this.promille, this.tuning.promille);
  }

  /**
   * Raises Promille, clamped at `PROMILLE_MAX`. The one place it goes up —
   * beer pickups (#17) and the debug slider (which writes `tuning.promille.
   * current` directly, bypassing this) are the only sources today.
   *
   * Crossing the Umgfalln threshold starts the knockdown here rather than in
   * whatever called this, the same reason `applyPlayerDamage` owns the death
   * check: one chokepoint, so every raise — pickup or otherwise — behaves
   * the same way.
   */
  addPromille(amount: number): void {
    if (amount <= 0) {
      return;
    }
    const tuning = this.tuning.promille;
    const wasUmgfalln = promilleTierOf(tuning.current) === PromilleTier.Umgfalln;
    tuning.current = Math.min(PROMILLE_MAX, tuning.current + amount);
    if (!wasUmgfalln && promilleTierOf(tuning.current) === PromilleTier.Umgfalln) {
      this.umgfallnTicksValue = Math.round(tuning.umgfallnKnockdownTicks);
      this.makePlayerInvulnerable(this.umgfallnTicksValue);
    }
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
    }
  }

  /** Decays Promille toward zero. Called once a tick by `stepPromille`, skipped during knockdown. */
  decayPromille(): void {
    const tuning = this.tuning.promille;
    tuning.current = Math.max(0, tuning.current - tuning.decayPerSecond / TICKS_PER_SECOND);
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

    // Order matters and is fixed: the player moves, then fires from where they
    // now are, then everything already in flight advances. Anything else and a
    // shot appears a tick behind the player who fired it.
    stepPlayerMovement(this, input);
    // Placing a Bierfassl is a player action, same footing as moving — it has
    // to happen before `stepBodies` integrates so a rolled one starts moving
    // on the tick it was thrown, not a tick behind.
    stepBombPlacement(this, input);
    // Enemies decide after the player has moved and before bodies integrate, so
    // a body moves on the same tick as the decision that moved it.
    stepEnemies(this);
    stepBodies(this);
    stepShooting(this, input);
    stepProjectiles(this);
    stepCollision(this);
    stepContacts(this);
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
    }
    if (this.roomTemplateLoaded && this.roomEnemyCount === 0) {
      this.roomClearedIds.add(this.roomId);
    }
    stepParticles(this);
    this.stepRespawns();

    if (this.roomTransitionTicks > 0) {
      this.roomTransitionTicks -= 1;
    }
    if (this.roomWarmupTicks > 0) {
      this.roomWarmupTicks -= 1;
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
    const startX = (this.room.minX + this.room.maxX) / 2;
    const startY = (this.room.minY + this.room.maxY) / 2;
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
   */
  spawnEnemyKind(definition: number, x: number, y: number): Entity {
    const compiled = this.enemies.at(definition);
    const entity = this.spawnTarget(x, y, compiled.radius);
    const index = entityIndex(entity);

    this.world.add(entity, this.enemy);
    this.world.add(entity, this.enemyMotion);

    const body = this.body.data;
    body[index * 2 + 1] = compiled.mass;

    const health = this.health.data;
    health[index * 2] = compiled.health;
    health[index * 2 + 1] = compiled.health;
    this.contactDamage.data[index] = compiled.contactDamage;

    // `add` zeroed both components, which is most of the state a body starts
    // in: no ticks in the state, and none of the flags a transition reads.
    const enemy = this.enemy.data;
    enemy[index * ENEMY_STRIDE] = definition;
    enemy[index * ENEMY_STRIDE + 1] = compiled.initialState;

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
   * ordinary one — a guaranteed, better payout for the room the floor's
   * doors were sealed around, not just another kill.
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
