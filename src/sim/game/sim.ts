import { footprintRadius, hurtboxOffsetY, hurtboxRadiusOf } from '../collision/footprint.js';
import { type Component, World } from '../ecs/world.js';
import { type Entity, entityIndex } from '../ecs/entity.js';
import { ENEMY_DEFINITIONS } from '../../content/enemies/index.js';
import { CURSE_DEFINITIONS } from '../../content/curses/index.js';
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
import { type DropTable, pickupDescriptionFor } from '../pickup/definition.js';
import { PickupRegistry } from '../pickup/registry.js';
import type { CurseId } from '../curse/definition.js';
import { stepCurse } from '../systems/curse.js';
import { stepBlutwurz } from '../systems/blutwurz.js';
import { ITEM_DEFINITIONS } from '../../content/items/index.js';
import {
  type ItemDefinition,
  type ItemPoolId,
  type ItemRuntimeState,
  itemStatSourceKey,
} from '../item/definition.js';
import { ItemInventory } from '../item/inventory.js';
import { selectItemOffer } from '../item/pool.js';
import { ItemRegistry, type CompiledItem } from '../item/registry.js';
import {
  itemEligibleForMachine,
  itemRollSourceKey,
  type MachineRollCandidate,
  type MachineRollResult,
  type MachineRollTier,
  rollMachineOutcome,
} from '../item/roll.js';
import { SetRegistry, setStatSourceKey, type ItemSetDefinition } from '../item/set.js';
import { ITEM_SET_DEFINITIONS } from '../../content/item-sets/index.js';
import { type RunRandom, createRunRandom } from '../rng/streams.js';
import {
  type CharacterTraits,
  CharacterRule,
  NEUTRAL_TRAITS,
  hasCharacterRule,
} from '../character/definition.js';
import { drawDeathWord } from './death-word.js';
import {
  PromilleTier,
  type PromilleTierId,
  clampTrinkfest,
  promilleCapFor,
  promilleDamageMultiplier,
  promilleDriftScale,
  promilleFireRateMultiplier,
  promilleGloom,
  promilleRequirementMet,
  promilleScreenDistortion,
  promilleShotHeat,
  promilleSwayMagnitude,
  promilleTierName,
  promilleTierOf,
  promilleTunnelVision,
  promilleWobbleAmplitude,
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
import { StatId, STAT_LABELS, type BaseStats } from '../stats/definition.js';
import type { StatModifier } from '../stats/modifiers.js';
import { type CollisionLayerId, CollisionLayer, collisionMaskFor } from '../collision/layers.js';
import { SpatialHash } from '../collision/spatial-hash.js';
import { EventQueue } from '../events/queue.js';
import { DamageNumberStore } from '../particle/damage-numbers.js';
import { DecalStore } from '../particle/decals.js';
import { ParticleStore } from '../particle/store.js';
import { boulderDebris, doorPuff, roomClearRing, splashBurst } from '../particle/effects.js';
import { ProjectileStore, ProjectileTeam } from '../projectile/store.js';
import { finalizeProjectileTags } from '../projectile/behavior.js';
import {
  addProjectileTag as grantProjectileTag,
  PROJECTILE_TAG_BY_NAME,
  type ProjectileTagName,
} from '../projectile/tags.js';
import { PROJECTILE_TINT_INDEX, type ProjectileTintName } from '../projectile/tints.js';
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
  meleeBladeAngle,
  stepEnemies,
  stepEnemyDeaths,
  stepEnemyPropDrops,
  stepEnemySummons,
} from '../systems/enemy.js';
import { stepBombPlacement } from '../systems/bomb-placement.js';
import { stepMachine } from '../systems/machine.js';
import { stepBombs } from '../systems/bombs.js';
import { applyDamageAt, stepImpact, stepParticles } from '../systems/impact.js';
import { stepLootDrops } from '../systems/loot.js';
import {
  dispatchItemFloorStart,
  dispatchItemLethalDamage,
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
import { DESTRUCTIBLE_PROP_KINDS, type DestructiblePropKind, propKindIndex } from './prop-kinds.js';

/** Entity slots reserved up front. Sized well above M1's population. */
const DEFAULT_CAPACITY = 8192;

/**
 * The player's drawn radius, in pixels: half the silhouette, and the circle
 * `stepCollision` still tests an enemy shot against the *pixels* of. Unchanged
 * — every number in `tuning.ts` was tuned against a body this size.
 */
export const PLAYER_RADIUS = 7;

/**
 * The circle of Alois that is on the floor (`docs/DECISIONS.md` #73): what he
 * walks into, what a doorway has to clear, what an enemy body pushes, what its
 * contact damage has to reach — and, uniquely to him, what an enemy *shot* has
 * to cross.
 *
 * That last one is the deliberate asymmetry, and it is the half of #73 that is
 * a difficulty change rather than a rendering one. Everything else in the game
 * keeps a hurtbox the size of its drawing, so shooting an enemy feels exactly
 * as it did; Alois does not, so a shot passing over his hat is a miss. It is
 * the same trade Isaac makes and the reason a near miss there reads as skill
 * rather than as the game being loose about it — and it makes him about a
 * third harder to hit, which is a real change to expect in a playtest, not a
 * side effect to discover.
 *
 * Five rather than a fraction of seven because he is the one body in the game
 * every other number is felt against; see `render/depth.ts` for what standing
 * a 32-pixel sprite on a 5-unit circle does to his silhouette.
 */
export const PLAYER_FOOTPRINT = 5;

/** Collider radius of a training target — a mid-size body. */
export const TARGET_RADIUS = ENEMY_PROFILES[EnemySize.Mid].radius;

/**
 * `DESTRUCTIBLE_PROP_KINDS` now lives in its own leaf module (`prop-kinds.ts`)
 * so `sim/enemy/` can name a kind without importing this file (#199);
 * re-exported here so every existing `from '.../game/sim.js'` import is
 * unchanged.
 */
export { DESTRUCTIBLE_PROP_KINDS, type DestructiblePropKind };

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

/**
 * The arena maypole (#199) is tougher than a barrel and thinner: denying the
 * Maibaum-Dieb his weapon is a real time investment during phase one, and a
 * maypole is a pole — the player walks past its base, not around a crate.
 */
export const MAYPOLE_HEALTH = 7;
export const MAYPOLE_RADIUS = 6;
/**
 * The arena maypole (#199) does not move: not shoved by a player walking into
 * it, not knocked by a shot, only chipped down and destroyed. A mass this far
 * above anything else makes contact separation and hit knockback (both divided
 * by mass) round to nothing against it.
 */
export const MAYPOLE_MASS = 1e6;

/** Hit points the player starts a run with, in half-heart units. */
export const PLAYER_HEALTH = 6;

/**
 * The soul pool's ceiling, in half-heart units (5 whole hearts) — what
 * `addSoulHealth` clamps to. Previously uncapped in the sim and only
 * visually capped in `HealthHud`; a Weißwurst pickup collected past this
 * point is now refused outright rather than silently wasted, so the cap has
 * to be real, not just cosmetic.
 */
export const SOUL_HEALTH_MAX = 10;

/**
 * The eternal pool's ceiling, in half-heart units (6 whole hearts) — what
 * `addEternalHealth` clamps to. Eternal hearts now carry the same
 * half-heart granularity soul and red already have (a half-Blutwurst grants
 * half a heart), where before they only ever came in whole units.
 */
export const ETERNAL_HEALTH_MAX = 12;

/** Half-heart units that make up one whole eternal heart — what `applyPlayerDamage` spends on a save. */
export const ETERNAL_HALF_UNIT = 2;

export { ENEMY_PROFILES, EnemySize, type EnemyProfile, type EnemySizeId } from '../enemy/size.js';

/** Ticks before a killed body on a spawn post comes back. Two and a half seconds. */
export const TARGET_RESPAWN_TICKS = 150;

/** A room transition is immediate in simulation and presented over this many frames. */
export const ROOM_TRANSITION_TICKS = 12;

/**
 * How long a floor's curse announcement banner (#49) stays up, in ticks —
 * longer than the ordinary pickup toast's `tuning.pickup.toastTicks`, since
 * a curse is a fact about the whole floor and worth reading, not a quick
 * float-past-loot line.
 */
export const CURSE_ANNOUNCE_TICKS = 240;

/**
 * How long the mid-run Promille-unlock banner stays up (#236).
 *
 * Longer than a curse announcement: a curse is one floor's modifier and this
 * is the game's signature mechanic arriving for the first time, in the one
 * moment the run has to explain it. Still a banner rather than a pause — the
 * boss room is cleared, so nothing is shooting at the player while they read
 * it.
 */
export const PROMILLE_UNLOCK_ANNOUNCE_TICKS = 420;

/**
 * The drink the mid-run unlock hands over (#236) — a full Maß, so the meter
 * lands in Angeheitert immediately and the player sees what the tier bonus
 * does before the floor is over, rather than in Nüchtern where it reads as
 * an empty bar.
 */
export const PROMILLE_UNLOCK_GIFT_PICKUP = 'mass-full';

/** How far in front of the player the unlock's Maß lands, in room units. */
export const PROMILLE_UNLOCK_GIFT_OFFSET = 16;

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

/** Where a Losbrunnen anchors relative to the boss room's own reward pedestal — off to one side, never on top of it. */
const LOSBRUNNEN_OFFSET_X = 36;
const LOSBRUNNEN_OFFSET_Y = 0;

/**
 * How far a mini-boss's consolation bundle (#278) spreads its three pickups
 * from the missed pedestal's own spot — enough that a half-Maß, a Biermarke
 * and a Kellerschlüssel read as three separate things on the floor rather
 * than one stack, small enough that all three are still an obvious group.
 */
const MINIBOSS_CONSOLATION_SPREAD = 14;

/** Move-axis magnitude (of `AXIS_RESOLUTION`'s 127) that counts as a deliberate directional tap for the Losbrunnen's picker — `machineTapSign`. */
const MACHINE_AXIS_TAP_THRESHOLD = 40;

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
  /** Biermarken it costs to take — `0` for every pedestal except a shop's (`tuning.itemPool.shopItemPrice`). */
  readonly price: number;
}

/**
 * A live Losbrunnen (#218): a floor's chance-spawned modifier machine.
 *
 * At most one per floor — `GameSim.floorHasLosbrunnen` is rolled once per
 * floor entry, and `GameSim.losbrunnenClaimedThisFloor` (#238) makes sure
 * only the first of the floor's shop or boss room the player actually
 * reaches materialises it, so a single instance (rather than
 * `PedestalRuntime`'s list) is exact, not a simplification. Not an ECS
 * entity for the same reasons a pedestal isn't (`PedestalRuntime`'s own doc
 * comment): stationary, never collides, at most one per room.
 */
interface MachineRuntime {
  readonly x: number;
  readonly y: number;
  /** Registry index of the item this machine is locked onto, or -1 before it has ever been fed. */
  itemIndex: number;
  /** Rolls performed so far — drives the increasing Biermarken cost. */
  rolls: number;
  /** Once true, the machine refuses any further feed/reroll for the rest of the run. */
  broken: boolean;
}

/**
 * Where a confirmed feed/reroll is in the picker redesign's own beat —
 * `docs/DECISIONS.md` #69's own "not done this pass" follow-up, now done.
 * `'idle'` is everything `machinePickerOpenValue` used to cover on its own
 * (nothing rolling, whether or not an item-select is open); `'rolling'` is
 * the anticipation beat (`MachineTuning.rollAnimationTicks`) between a
 * confirmed feed and its outcome; `'choosing'` is the results board — one
 * `unlucky` candidate alone, or three favourable/neutral ones to pick among
 * (`rollMachineOutcome`). A machine break is resolved *inside* the
 * `'rolling'` tick and never reaches `'choosing'` at all — see
 * `GameSim.resolveMachineRoll`.
 */
type MachineRollPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'rolling'; readonly ticksRemaining: number }
  | {
      readonly kind: 'choosing';
      readonly outcome: 'unlucky' | 'choice';
      readonly candidates: readonly MachineRollCandidate[];
      selectedIndex: number;
    };

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
  /**
   * `null` for every room but whichever of the floor's shop or boss room
   * ended up hosting the Losbrunnen (#238) — and even there, only non-null
   * once it has actually spawned (immediately in a shop, held back until
   * the kill in a boss room).
   */
  readonly machine: MachineRuntime | null;
}

/**
 * Which pool a room's pedestal draws from, by the room's own special role.
 *
 * `shop` now draws from the `shop` pool — the shop rooms author a `pedestal`
 * prop, `shopItemChance` decides whether it stocks anything on a given visit,
 * and `shopItemPrice` is what taking it costs (`spawnPedestal` /
 * `takePedestalItem`). `supersecret` still has no authored pedestal; the
 * `default` is defensive.
 */
const MACHINE_ROLL_TIER_LABELS: Readonly<Record<MachineRollTier, string>> = {
  unlucky: 'Unlucky',
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
};

/** What a roll actually nudged, with no item name or tier attached — shared by the toast (`describeMachineRoll`) and a results-board card (`machineRollCardLabel`). */
function machineRollEffectLabel(result: MachineRollResult): string {
  if (result.rolled === undefined) {
    return 'nothing changed';
  }
  if (result.rolled.kind === 'cooldown') {
    return `cooldown ${result.rolled.favourable ? 'shorter' : 'longer'}`;
  }
  const statLabel = STAT_LABELS[result.rolled.stat];
  return `${statLabel} ${result.rolled.favourable ? 'up' : 'down'}`;
}

/** The Losbrunnen's toast text for one applied roll — `GameSim.applyMachineRollResult`'s own `reportCollected` call. */
function describeMachineRoll(itemName: string, result: MachineRollResult): string {
  const tierLabel = MACHINE_ROLL_TIER_LABELS[result.tier];
  return `${itemName}: ${tierLabel} roll — ${machineRollEffectLabel(result)}.`;
}

/** One results-board card's text (#238's redesigned picker) — tier and effect, no item name (the left pane already names it). */
function machineRollCardLabel(result: MachineRollResult): string {
  const tierLabel = MACHINE_ROLL_TIER_LABELS[result.tier];
  return `${tierLabel} — ${machineRollEffectLabel(result)}`;
}

function pedestalPoolForRole(role: RoomSpecialRole | undefined): ItemPoolId {
  switch (role) {
    case 'boss':
      return 'boss';
    case 'secret':
    case 'supersecret':
      return 'secret';
    case 'shop':
      return 'shop';
    // A mini-boss room's own pedestal (#278) draws from the same pool a
    // treasure room does — a lower-odds, held-back item roll on top of
    // #275's Kellerschlüssel, which is a separate pickup, not a pedestal
    // item.
    case 'miniboss':
    case 'treasure':
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
  /** Item set data (#137). Defaults to everything in `src/content/item-sets/`. */
  readonly itemSets?: readonly ItemSetDefinition[];
  /**
   * The headline word the *previous* run's death screen showed, if any.
   *
   * Passed in rather than tracked as global state inside the sim: a run's own
   * death-word draw has to stay a pure function of its seed and this value, or
   * two runs sharing a seed would stop producing the same word. Cross-run
   * memory belongs to whatever is starting runs, not to the run itself.
   */
  readonly previousDeathWord?: string;
  /**
   * Whether the run has the Promille mechanic (#85). Defaults to `true` —
   * see `GameSim.promilleUnlocked` for what `false` actually turns off.
   */
  readonly promilleUnlocked?: boolean;
  /**
   * The floor whose boss switches Promille on mid-run for a run that started
   * without it (#236). Defaults to `null` — no mid-run unlock, which is what
   * every caller written before the gate moved meant.
   */
  readonly promilleUnlockFloor?: number | null;
  /**
   * Who the run is played as (#47). Defaults to `NEUTRAL_TRAITS` — Alois,
   * and exactly the run every test written before characters existed
   * describes.
   */
  readonly character?: CharacterTraits;
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
    [StatId.Damage]: 0,
    [StatId.FireRate]: 0,
    [StatId.Range]: 0,
    [StatId.ShotSpeed]: 0,
    [StatId.MoveSpeed]: 0,
    [StatId.Luck]: 0,
  };

  /** Position and the previous tick's position, for render interpolation. */
  readonly transform: Component<Float32Array>;
  /** Velocity in pixels per tick. */
  readonly velocity: Component<Float32Array>;
  /**
   * The body's **footprint** radius and its mass — the circle on the floor.
   * Mass is what knockback is divided by.
   *
   * Since `docs/DECISIONS.md` #73 this is deliberately smaller than the
   * drawing: it is what the body walks into, what pushes it, what its contact
   * damage reaches and how far a pickup can be grabbed from. What a *shot* has
   * to cross is `hurtbox` below.
   */
  readonly body: Component<Float32Array>;
  /**
   * Radius of the circle a projectile has to cross, and how far up the screen
   * it sits from `body`'s centre (#73) — `sim/collision/footprint.ts` covers
   * why the offset is not a free number.
   *
   * A radius of zero means "the footprint itself", so a body nobody has given
   * one is collided exactly as it was before this existed. Written at every
   * spawn rather than left to that fallback, because entity slots are
   * recycled and a barrel inheriting a boss's hurtbox is the same class of bug
   * `spawnTarget` already writes `contactDamage` and `propKind` to avoid.
   */
  readonly hurtbox: Component<Float32Array>;
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
   * Ticks left of a body's own hit-stagger — it holds still, mid-knockback,
   * unable to act.
   *
   * Deliberately *not* the same mechanism as `requestHitstop`/`hitstopTicks`:
   * that one halts the whole simulation and exists for the rare, singular
   * beat of the player's own death cinematic (`app/main.ts`). Routing every
   * ordinary hit through it does not scale — a burn tick landing on several
   * bodies at once, or just a held trigger against a small cluster, syncs
   * into a global freeze several times a second (measured: ~12% of ticks
   * frozen against an 8-enemy cluster at the base fire rate, worse with any
   * fire-rate item). A hit reads as a hit without stopping the world for it:
   * this pauses only the body that was struck — `stepEnemies` skips its own
   * decision-making while it counts down — so the flinch is local and the
   * rest of the room keeps moving.
   */
  readonly hitStun: Component<Uint8Array>;
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
   * Which authored `decorativeProps` type a destructible target was spawned
   * from — an index into `DESTRUCTIBLE_PROP_KINDS` (#152). Render-only, like
   * `spawnBounce`.
   *
   * A target is the one collidable body with neither an enemy definition nor
   * a pickup kind, so before this the renderer had no way to tell Der Stier's
   * Maibaum from a barrel and drew both as the same thing. The simulation
   * genuinely does treat them identically — that is `GameSim`'s own comment on
   * why `maypole` needed nothing from the engine beyond reusing `barrel`'s
   * path — which is exactly why the *difference* has to be recorded somewhere
   * for the view, and cannot be inferred from anything else on the body.
   */
  readonly propKind: Component<Uint8Array>;
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

  /** Every item set, validated against `items` and compiled once at construction (#137). */
  readonly itemSets: SetRegistry;

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

  /**
   * Which item sets (#137) are currently complete — every member held at
   * once. Rechecked in full on every `pickUpItem`/`removeItem`
   * (`syncItemSetModifiers`) rather than dirty-tracked the way
   * `itemStatsDirty` is: the roster is a handful of sets, not hundreds of
   * items, so a full walk costs nothing and needs no bookkeeping of its own.
   */
  private readonly completedSetIds = new Set<string>();
  /** Ticks left showing the set-completion notification. See `setCompletionReveal`. */
  private setRevealTicks = 0;
  private setRevealName = '';
  private setRevealDescription = '';

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
  /**
   * The loaded room's `decorativeProps`, verbatim from its template (#152).
   *
   * Kept here so the renderer can *draw* them. They were authored from the
   * beginning (`content/rooms/definition.ts`'s `RoomDecorativeProp`) and used
   * only for the two that become real entities — `barrel` and `maypole`
   * become destructible targets, `pedestal` becomes loot — which left the
   * other fifteen types as data nothing ever looked at, and every room in the
   * game reading as a bare grid with a fence post's worth of authored
   * intention thrown away.
   *
   * Simulation-adjacent rather than simulation state: nothing in `step` reads
   * this, and a prop that is only art cannot affect a replay. It sits next to
   * `room` for the same reason `room` does — the renderer needs the loaded
   * room's shape and the loaded room's furniture, and neither is worth a
   * second channel out of the sim.
   */
  roomDecorativeProps: readonly {
    readonly x: number;
    readonly y: number;
    readonly type: string;
    readonly rotation?: number;
  }[] = [];
  /** Ticks remaining in the presentation transition after a room load. */
  roomTransitionTicks = 0;
  roomTransitionDirection: RoomDirection | null = null;
  /** Ticks remaining before enemies loaded into the current room may act. */
  roomWarmupTicks = 0;
  /**
   * `crossingDwellElapsed`'s own counter: how many consecutive ticks the
   * player has been pressing into `doorCrossingDirection`'s door. Kept here
   * rather than as a local because `transitionTo`/`transitionToStaircase` are
   * called fresh every tick the caller polls `doorContact` — reset to 0 the
   * moment they stop pressing that direction or a different door's crossing
   * asks, so backing off mid-crossing (or touching a different door) starts
   * the dwell over rather than carrying progress across.
   */
  private doorCrossingDirection: RoomDirection | null = null;
  private doorCrossingTicks = 0;

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
   * The last direction the player actually aimed, as a unit vector, held
   * through every tick the aim stick is centred.
   *
   * Simulation state rather than something the renderer reads off the input
   * frame, for two reasons. It is a pure function of the input log — the same
   * log produces the same aim on the same tick, on any machine — so it costs
   * determinism nothing. And the renderer is not handed input frames at all
   * (`GameView.sync` takes `sim` and an interpolation alpha, and nothing
   * else); routing aim through the one object it already reads is what keeps
   * that arrow pointing one way.
   *
   * Defaults to "in front of him" rather than to nothing: Alois holds the
   * Schlauch before the player has touched the aim stick, and a nozzle
   * pointing nowhere on the first frame of a run is a nozzle that has to be
   * special-cased everywhere downstream. Written by `systems/shooting.ts`.
   */
  aimDirectionX = 0;
  aimDirectionY = 1;

  /**
   * The tick the last shot left the Schlauch on, or `-1` before the first
   * one. What `render/player-view.ts` plays the muzzle frame off — a shot is
   * an event with no lasting simulation state otherwise, and "did he fire in
   * the last few ticks" is not answerable from `fireCooldown`, which counts
   * down identically whether the button is held or was tapped once.
   */
  lastShotTick = -1;

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
   * Accessibility scale on hitstop, 0 to 1.
   *
   * Same precedent as `screenShakeScale`, applied in `requestHitstop` itself
   * rather than at a getter: unlike shake (a camera offset read every frame)
   * a freeze's whole effect *is* how many ticks it holds `step()` for, so the
   * scale has to reach the ticks a request actually asks for, not just how
   * the result is drawn. Reaches zero, and zero means no freeze at all — a
   * kill and a boss kill still hit their flash/shake/particle beats exactly
   * as before, just without the whole-simulation pause on top of them.
   */
  hitstopScale = 1;

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
   * The player's soul and eternal pools, both in half-heart units (see
   * `SOUL_HEALTH_MAX`/`ETERNAL_HEALTH_MAX`/`ETERNAL_HALF_UNIT`) — eternal
   * used to only ever come in whole hearts, but a half-Blutwurst now grants
   * half of one the same way a half-Weißwurst grants half a soul heart.
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

  /** The active floor curse (#49), rolled once per floor by `rollFloorCurse`. `null` on an uncursed floor. */
  private curseIdValue: CurseId | null = null;
  /** Ticks left showing the curse-entry announcement banner. See `curseAnnouncement`. */
  private curseAnnounceTicks = 0;
  /**
   * Current wind angle for the Föhn curse, radians — the curse's own scratch
   * value, the same role an item hook's `ItemRuntimeState.charge` plays for
   * the Föhn item (`sim/systems/curse.ts`'s `applyWind`). Public for the same
   * reason `puddleImmuneTicks` is: read and written by a system, not a
   * method.
   */
  curseFoehnAngle = 0;
  /** Ticks left on Sperrstunde's "last call" timer, while it is the active curse. 0 once expired. */
  sperrstundeTicksLeft = 0;
  /** Ticks until Sperrstunde's next Ordner harassment application, once its timer has expired. */
  sperrstundeHarassmentCooldown = 0;

  /** Biermarken banked, Kellerschlüssel held, and Bierfassl in inventory — see #22. */
  private biermarkenCount = 0;
  private keysCount = 0;
  private bombsCount = 0;

  /**
   * Der Meisterschlüssel (#275): the mini-boss's drop, the one thing that
   * opens this floor's boss door. A single boolean, not a counter — there is
   * exactly one boss gate per floor and carrying two keys would mean nothing
   * (`docs/DECISIONS.md`'s Meisterschlüssel entry). Deliberately *not* a
   * Kellerschlüssel: that currency drops from a weighted table and can never
   * be allowed to gate the critical path (a run with no key and no mini-boss
   * left is soft-locked). Set by `grantMeisterschluessel` — the mini-boss
   * room's pickup — and cleared on floor advance (`clearFloorProgress`) and
   * the moment it is spent opening the boss door (`transitionTo`).
   */
  private meisterschluesselHeld = false;
  /**
   * Whether the floor's secret and supersecret rooms show on the minimap
   * before the player has found them — the "unlock item" `computeReveal`
   * (`render/minimap-hud.ts`) always reserved a lift for, which Schlüsselbund
   * (`content/items/schluesselbund.ts`) now is. Run-scoped rather than
   * per-floor: it is a property of what the player carries, not of the
   * floor, so `clearFloorProgress` leaves it alone and the item's own
   * `onRemove` is what takes it away. Presentational — nothing in `step`
   * reads it — so it can never move a replay.
   */
  private secretRoomsRevealedFlag = false;
  /**
   * Whether this floor's boss door actually needs the Meisterschlüssel — set
   * per floor by `configureFloorGate` from `FloorPlan.minibossRoomIds` being
   * non-empty. A floor whose content has no mini-boss template gets no
   * mini-boss room and therefore no lock (`docs/DECISIONS.md` #75): the gate
   * is a property of the slot existing, never of "floor N should have one by
   * now". Dropped back to `false` the instant the boss door is opened, so a
   * Blutwurz (#84) spirit walk back to an already-entered boss room never
   * finds it re-locked.
   */
  private bossDoorGated = false;

  /**
   * Whether this run has the Promille mechanic at all (#85).
   *
   * False means the meter reads zero forever (`get promille`), beer never
   * drops (`dropLoot` rolls the `sober` half of every table), and no
   * Promille item is ever offered (`itemEligibleForOffer`). `app/main.ts`
   * sets it from the persisted `promille` unlock — see
   * `app/promille-gate.ts` — and passes it through every `loadRoom`, so it
   * survives a floor transition.
   *
   * Written exactly once after construction, and only ever `false → true`,
   * by `maybeUnlockPromille` (#236): the gate moved from Der Stier to the
   * boss of `promilleUnlockFloor`, which is *inside* the shipping run rather
   * than after it, so an unearned run has to be able to switch the mechanic
   * on halfway through. There is no path back the other way — a run that has
   * met the meter keeps it.
   *
   * Determinism survives that (`docs/DECISIONS.md` #86): the flip is a pure
   * function of the run's own state (which floor, which room, whether it
   * cleared), so a replay of the same seed and the same input log flips at
   * the same tick. Nothing extra has to be recorded alongside the log.
   *
   * Defaults to `true` so that a test, a bench or an editor building a
   * `GameSim` without an opinion gets the full mechanic, which is what every
   * one of them meant before this flag existed.
   */
  private promilleUnlockedValue: boolean;

  /**
   * The floor whose boss switches Promille on mid-run, for a run that
   * started without it (#236) — `null` for a run that never unlocks it on
   * its own.
   *
   * A run parameter rather than content the sim reaches for: the gate itself
   * is data in `content/progression/unlocks.ts`, and `app/main.ts` derives
   * this from it (`resolvePromilleUnlockFloor`). The sim only knows "a boss on
   * this floor turns it on", which is what makes moving the gate again a
   * data change and not an engine one.
   *
   * Defaults to `null` so a `GameSim` built without an opinion behaves
   * exactly as it did before this existed.
   */
  private readonly promilleUnlockFloorValue: number | null;

  /** Ticks left of the mid-run Promille-unlock banner — see `promilleUnlockAnnounced`. */
  private promilleUnlockAnnounceTicks = 0;

  /**
   * Who this run is being played as (#47), as data — see
   * `sim/character/definition.ts`.
   *
   * Read once at construction and never replaced: a character is chosen
   * before the run exists, and a run that could change character halfway
   * would make "same seed, same input log, same run" a function of
   * something outside both.
   */
  readonly character: CharacterTraits;
  /**
   * The character's rules, resolved once.
   *
   * `hasCharacterRule` is an array scan, and three of these are read on the
   * per-tick movement, collision and pickup paths — the scan is trivial, but
   * so is hoisting it, and the hot-path files then read a boolean rather
   * than knowing how a roster stores its rules.
   */
  private readonly characterFlies: boolean;
  private readonly characterPurse: boolean;
  /** Ticks since Ludwig's crown last cost him a Biermarke. */
  private purseTicks = 0;
  /** What `syncPurseModifiers` last built for: solvency, and the multiplier it used. */
  private lastPurseSolvent: boolean | null = null;
  private lastPurseMultiplier = Number.NaN;

  /** Set once, the tick every pool empties with no eternal heart to spend. */
  private playerDeadFlag = false;
  private playerDeathTick_ = -1;
  private playerHurtTick_ = -1;
  private deathWordValue: string | undefined;

  /**
   * This tick's kills, by the slot that died, to the enemy id that died
   * there — `kill()` populates it before `world.flush()` frees the slot;
   * `enemyIdAt` reads it first, before falling back to the slot's live
   * component data for a hit that did not kill. Cleared at the top of every
   * `step()`, alongside `events.clear()`.
   */
  private deathEnemyIdByIndex = new Map<number, string>();

  /**
   * Set once, by `markWon` (#155) — the tick the run was won. Unlike
   * `playerDeadFlag`, nothing inside `GameSim` itself decides *when* this
   * happens: "the last floor that exists" is `app/main.ts`'s
   * `HIGHEST_PLAYABLE_FLOOR`, a content-completeness fact rather than a
   * simulation rule (the same reasoning `docs/DECISIONS.md` #22 already
   * gives for floors 3-7 being parked, not cancelled) — so the *decision*
   * lives where that constant already does, and calls this the instant it's
   * made. The flag still lives here, not in `main.ts`, because it has to
   * replay identically: `markWon` is called from the same
   * `advanceOneTick`-driven path a room transition already is (see
   * `enterNeighbor`), so a full replay reaches the same tick and calls it
   * the same way live play did.
   */
  private playerWonFlag = false;
  private playerWonTick_ = -1;

  /**
   * Blutwurz (#84): a second chance you have to walk back for. Once per run
   * — `blutwurzSpentFlag` guards that even across a successful recovery, not
   * just a failed one.
   *
   * Floor continuity needs no snapshot of its own: `blutwurzActiveFlag`
   * turning on does not reset or regenerate anything (`roomClearedIds`,
   * `roomLootSnapshots`, `takenItemIds`, the room the player is standing
   * in) — the same live `GameSim` simply keeps existing, which is what
   * makes "the floor is byte-for-byte the floor the player died on" true
   * by construction rather than something to engineer. `app/main.ts` reacts
   * to `blutwurzActive` turning on the same way it reacts to a door
   * transition (see `enterNeighbor`) — loading the floor's start room, the
   * one thing outside `GameSim`'s own state (the floor plan) it needs.
   */
  private blutwurzActiveFlag = false;
  private corpseXValue = 0;
  private corpseYValue = 0;
  /**
   * Which room's local space `corpseXValue`/`corpseYValue` are in —
   * `roomId` is per-room-load state (`GameSim.room`'s coordinates are
   * reused by every room, not a shared floor-wide space), so a raw x/y
   * alone would silently collide with unrelated coordinates the moment the
   * player leaves the room the corpse is actually in.
   */
  private corpseRoomIdValue = '';
  /** The player's max health from immediately before Blutwurz triggered — what the permanent penalty on a successful recovery is measured against. */
  private blutwurzPreviousMaxHealth = 0;
  /**
   * The sober-run stand-in for Promille-as-timer (see `stepBlutwurz`) — a
   * plain, invisible countdown, since a sober run has no meter to raise at
   * all (#85's own invariant: no meter, no HUD element, full stop). Unused,
   * and left at 0, whenever `promilleUnlocked` is true.
   */
  blutwurzSpiritTicks = 0;

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
   * This tick's held movement input (WASD, not aim), knockdown-zeroed the
   * same way `stepPlayerMovement` zeroes its own — set there, each tick, and
   * read by `pressingToward` to tell a deliberate walk through a door apart
   * from merely touching its threshold. `-1`/`0`/`1` per axis, same range
   * `axisToUnit` already produces.
   */
  private lastMoveInputX = 0;
  private lastMoveInputY = 0;

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
  /** Latched by `consumeProp` when the Maibaum-Dieb takes the arena maypole (#199); cleared on room load. */
  private maypoleTaken = false;
  private roomClearedIds = new Set<string>();
  /**
   * Boulders a bomb has cleared this run (#4), by authored room id (same key
   * as `roomClearedIds`) → a flat `[x, y, x, y, …]` of the removed blocks'
   * centres. Replayed onto the freshly compiled `RoomGeometry` in
   * `applyCompiledRoom` so a bombed path stays open on a revisit.
   */
  private readonly destroyedBoulders = new Map<string, number[]>();
  /** Reused scratch for one blast's cleared-boulder centres — no per-detonation allocation. */
  private readonly boulderBlastScratch: number[] = [];
  /** Bumped whenever a boulder falls, so `app/main.ts` can rebuild the room's scenery. */
  private bouldersChangedTickValue = -1;
  /**
   * Key-locked treasure rooms (#196) a Kellerschlüssel has already been
   * spent to enter, keyed the same way `roomClearedIds` is — by the authored
   * template's own id, not a per-instance id — so leaving and walking back
   * in never asks for a second key. `transitionTo` is the only writer.
   */
  private unlockedKeyRoomIds = new Set<string>();
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
   * Where the Meisterschlüssel (#275) will drop once a mini-boss room is
   * cleared — the exact `pendingBossPedestals` shape, held back for the same
   * reason: picking the key up is the beat that says the detour paid, and a
   * key already sitting on the floor while the fight is on is not that. Set
   * from the mini-boss's own spawn point when a `specialRole: 'miniboss'`
   * room loads uncleared, drained by `step`'s room-clear check the tick the
   * fight ends, and reset to `null` on every room load — a mini-boss room
   * already cleared restores (or doesn't) its dropped key from
   * `roomLootSnapshots` like any other pickup.
   */
  private pendingMinibossKey: { readonly x: number; readonly y: number } | null = null;
  /**
   * Where a mini-boss's own pedestal roll (#278) will resolve once its room
   * clears — the exact `pendingMinibossKey` shape and reasoning, populated
   * by `restoreOrSpawnRoomLoot` from the room's own authored `pedestal` prop
   * (same field every other room's pedestal is authored with) rather than
   * spawned eagerly the moment the room loads, for the same "the reward
   * shouldn't already be standing there during the fight" reason a boss
   * room's `pendingBossPedestals` is held back. Drained by `step`'s
   * room-clear check the tick the fight ends — a 40%/20% item roll
   * (`tuning.minibossReward`) rather than an unconditional spawn, since
   * unlike a boss or treasure pedestal a mini-boss's is not guaranteed to
   * hold anything (a miss pays the consolation bundle instead, never both).
   * Reset to `null` on every room load, same as `pendingMinibossKey`.
   */
  private pendingMinibossPedestal: { readonly x: number; readonly y: number } | null = null;
  /**
   * Whether this floor gets a Losbrunnen at all — rolled once per floor
   * entry (`applyCompiledRoom`'s "new floor" guard, alongside
   * `rollFloorCurse`) from `random.items`, so the decision is fixed the
   * moment the floor starts rather than re-rolled every time a candidate
   * room is (re-)compiled.
   */
  private floorHasLosbrunnen = false;
  /**
   * Whether this floor's Losbrunnen has already been claimed by a room —
   * #238's "one machine, whichever spot the player reaches first." Checked
   * (and set) by both the shop's instant-spawn branch and the boss room's
   * `pendingBossLosbrunnen` branch in `restoreOrSpawnRoomLoot`, so whichever
   * of the two the player walks into first is the one that gets it; reset
   * alongside `floorHasLosbrunnen` on every new floor.
   */
  private losbrunnenClaimedThisFloor = false;
  /**
   * Whether *some* mini-boss room has already cleared this floor — #278's
   * XL-floor fix for the gap #76 flagged as future work ("a key with
   * nothing to unlock is a small lie to the player about what keys are").
   *
   * `step`'s room-clear drain of `pendingMinibossKey`/`pendingMinibossPedestal`
   * reads this to decide whether the clear in progress is the floor's
   * "first" mini-boss (guaranteed key, `firstItemChance`) or a "second" one
   * (no key, `secondItemChance`), then sets it. A plain boolean is exact,
   * not a simplification: that drain only ever runs once per distinct
   * `roomId` (`roomClearedIds` blocks every later clear of the same
   * physical room — a Blutwurz, #84, spirit walk re-fighting an
   * already-cleared mini-boss room finds its *original*, still-uncollected
   * key restored from `roomLootSnapshots` instead, #76's own "cleared rooms
   * repopulate" rule, never a second pass through this drain), so this can
   * only ever transition false-to-true once per floor, never need to tell
   * one *room* apart from another. Reset alongside `floorHasLosbrunnen` on
   * every new floor.
   */
  private minibossKeyGrantedThisFloor = false;
  /** The current floor's Losbrunnen, once it has actually spawned — see `MachineRuntime`. */
  private machineRuntime: MachineRuntime | null = null;
  /**
   * Where the Losbrunnen will appear, held back until the boss actually
   * dies — the exact `pendingBossPedestals` shape, one position instead of a
   * list because at most one machine ever spawns per floor. Only ever set
   * when the boss room is the one that wins `losbrunnenClaimedThisFloor`
   * (#238) — a shop that claims it first spawns straight into
   * `machineRuntime` instead, since a shop's stock isn't held back for a
   * fight the way a boss room's reward is. Computed in
   * `restoreOrSpawnRoomLoot` from the boss room's own authored pedestal
   * position (offset clear of it), never authored separately — see
   * `docs/DECISIONS.md`'s Losbrunnen entry for why this rides the boss
   * room's existing reward anchor instead of a new room-template field.
   */
  private pendingBossLosbrunnen: { readonly x: number; readonly y: number } | null = null;
  /**
   * Which held, roll-eligible item the Losbrunnen's prompt is currently
   * previewing, cycled while its picker is open. An id rather than a
   * registry index so it survives the eligible list reshuffling as items
   * are picked up/lost between visits — `machinePreview` clamps back to a
   * valid entry if this one is no longer eligible.
   */
  private machinePreviewItemId: string | null = null;
  /**
   * Whether the Losbrunnen's item picker is open — `use` on a fresh machine
   * opens it, `use` again confirms and feeds (`GameSim.useMachine`). Every
   * step here is the *same* button, on purpose: repurposing Bomb for
   * cycling was tried and rejected (`docs/DECISIONS.md`'s Losbrunnen entry)
   * because a player who is even slightly off target while trying to place
   * a Bierfassl near the machine could destroy it by accident — which the
   * machine should only ever do on a real detonation nearby
   * (`breakMachineFromBlast`), never as a side effect of browsing its menu.
   */
  private machinePickerOpenValue = false;
  /**
   * Sign of the move axis on the previous tick, while the picker is open —
   * `cycleMachinePreviewFromAxis`'s own edge detector, the tap-not-hold
   * equivalent of `previousButtons` for an axis instead of a button. Reset
   * whenever the picker closes, so re-opening it always starts requiring a
   * fresh tap rather than reading whatever direction happened to be held.
   * Shared with `cycleMachineChoiceFromAxis` — the two never read it in the
   * same tick, since `machinePickerOpenValue` and a `'choosing'`
   * `machineRollPhase` are mutually exclusive.
   */
  private machineCyclePreviousSign: -1 | 0 | 1 = 0;
  /**
   * Where a confirmed feed/reroll is in its own anticipation-then-choose beat
   * — see `MachineRollPhase`'s own doc comment. `'idle'` whenever
   * `machinePickerOpenValue` is the only thing worth reading (including
   * every tick before any roll has ever been confirmed).
   */
  private machineRollPhase: MachineRollPhase = { kind: 'idle' };
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
  /**
   * Where a charged active item's pending blast will land and how far through
   * its fuse it is (#12) — set every tick by the item's own `onTick` while
   * the fuse burns (`content/items/boellerschmeisser.ts`), cleared at the top
   * of `stepItemTick` each tick so it vanishes the moment the item stops
   * fusing. `EntityView` draws it as the same hatch disc a lobbed Böller
   * telegraph uses, so every explosive in the game marks its ground the same
   * way.
   */
  private activeItemBlastValue: {
    x: number;
    y: number;
    radius: number;
    progress: number;
  } | null = null;
  /** Ticks left showing the pedestal pickup/swap reveal panel. See `pedestalReveal`. */
  private pedestalRevealTicks = 0;
  private pedestalRevealName = '';
  private pedestalRevealDescription = '';
  /** Human-readable summary of the Losbrunnen's last roll, surfaced through `machinePreview` until the next one. */
  private machineLastRollSummary: string | undefined = undefined;
  /**
   * An active item's `maxCharge`, after a Losbrunnen `cooldown` roll (#238)
   * — the active-item equivalent of the stat pipeline's `item-roll:<id>`
   * source, keyed by item id the same way. Absent means "un-rerolled, read
   * the authored base" (`effectiveMaxCharge`'s own fallback), exactly the
   * honest-baseline promise `itemRollSourceKey`'s doc comment already makes
   * for a stat roll. A later roll *replaces* the stored factor outright
   * rather than composing with it — "reroll means reroll" — and losing the
   * last copy of the item clears the entry (`removeItem`), the same
   * "exactly the prior state" `stats.clearSource(itemRollSourceKey(id))`
   * already guarantees for a stat roll.
   */
  private readonly activeItemCooldownFactor = new Map<string, number>();
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

    this.character = options.character ?? NEUTRAL_TRAITS;
    this.characterFlies = hasCharacterRule(this.character, CharacterRule.Flies);
    this.characterPurse = hasCharacterRule(this.character, CharacterRule.Purse);
    // The innate half of a shot's behaviour (#47) — Resi's arcing, returning
    // Brezn. `forcedTags` is exactly the field `ShootingTuning` reserved for
    // this, ORed rather than assigned so the debug tag chooser can still add
    // to it while a character run is going.
    for (const tag of this.character.shotTags) {
      this.tuning.shooting.forcedTags |= PROJECTILE_TAG_BY_NAME[tag];
    }
    this.applyCharacterStats();

    this.transform = this.world.defineComponent('transform', Float32Array, 4);
    this.velocity = this.world.defineComponent('velocity', Float32Array, 2);
    this.body = this.world.defineComponent('body', Float32Array, 2);
    this.hurtbox = this.world.defineComponent('hurtbox', Float32Array, 2);
    this.push = this.world.defineComponent('push', Float32Array, 2);
    this.collision = this.world.defineComponent('collision', Uint16Array, 2);
    this.health = this.world.defineComponent('health', Int16Array, 2);
    this.flash = this.world.defineComponent('flash', Uint8Array, 1);
    this.hitStun = this.world.defineComponent('hitStun', Uint8Array, 1);
    this.contactDamage = this.world.defineComponent('contactDamage', Int16Array, 1);
    this.enemy = this.world.defineComponent('enemy', Int16Array, ENEMY_STRIDE);
    this.enemyMotion = this.world.defineComponent('enemyMotion', Float32Array, ENEMY_MOTION_STRIDE);
    this.spawnPost = this.world.defineComponent('spawnPost', Int16Array, 1);
    this.pickupKind = this.world.defineComponent('pickupKind', Int16Array, 1);
    this.pickupPrice = this.world.defineComponent('pickupPrice', Int16Array, 1);
    this.bombFuse = this.world.defineComponent('bombFuse', Int16Array, 1);
    this.spawnBounce = this.world.defineComponent('spawnBounce', Uint8Array, 1);
    this.propKind = this.world.defineComponent('propKind', Uint8Array, 1);
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
    this.itemSets = new SetRegistry(
      // The default set roster (#137) assumes the default item roster is
      // also in play — a test substituting its own small `items` list
      // (every existing test that does) has no reason to also carry every
      // set's member ids, so it gets no sets by default rather than a
      // constructor that throws over content the test never asked for.
      // Passing `itemSets` explicitly always wins, custom roster or not.
      options.itemSets ?? (options.items === undefined ? ITEM_SET_DEFINITIONS : []),
      this.items,
    );
    this.inventory = new ItemInventory(this.items);
    this.itemStatsDirty = new Uint8Array(this.items.count);
    this.dirtyItemIndices = new Int32Array(this.items.count);
    this.promilleUnlockedValue = options.promilleUnlocked ?? true;
    this.promilleUnlockFloorValue = options.promilleUnlockFloor ?? null;

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

    this.biermarkenCount = this.character.startingBiermarken;
    this.bombsCount = this.character.startingBombs;
    this.keysCount = this.character.startingKeys;

    this.playerHandle = this.spawnPlayer();
    // Before the first room loads, not after: an item with an `onFloorStart`
    // hook that arrived a moment later would silently skip floor 1, which is
    // the only floor a starting item is guaranteed to see.
    for (const id of this.character.items) {
      this.pickUpItem(id);
    }
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
    // The purse rule registers its opening contribution here rather than
    // waiting for the first `step`: Ludwig walks in with a full purse, and a
    // run whose damage is only correct from tick 1 onward is a run whose
    // first shot is wrong.
    this.syncPurseModifiers();
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
    if (this.roomSpecialRole !== 'boss' && this.roomSpecialRole !== 'miniboss') {
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
      // `bossBar`, not `locksRoom` (#276): Der Rattenkönig's summoned
      // Bierratten lock the room like any add, but the bar is the king.
      if (!definition.bossBar) {
        continue;
      }
      any = true;
      current += this.health.data[index * 2] ?? 0;
      max += this.health.data[index * 2 + 1] ?? 0;
    }
    return any ? { current, max } : null;
  }

  /**
   * The held Maibaum, once the Maibaum-Dieb has it (#199) — render data for
   * `MaibaumView`. `null` until `consumeProp` latches `maypoleTaken`, and while
   * no dieb body is alive.
   *
   * `poleAngle` is the world bearing the pole *points* (0 is +x, `-π/2` is
   * straight up), which the view turns into a sprite rotation. It is the same
   * `meleeBladeAngle` the hit check reads during the swing itself, so the pole
   * a player sees and the wedge that can hit them are the one motion; during
   * the wind-up it is cocked back past the swing's start edge, and otherwise it
   * rests shouldered at that start edge.
   *
   * Not cached — one caller, once a frame, and a boss room holds a handful of
   * bodies, the same argument `bossHealth` makes.
   */
  get maibaumHeld(): {
    readonly x: number;
    readonly y: number;
    readonly poleAngle: number;
  } | null {
    if (!this.maypoleTaken) {
      return null;
    }
    const diebDef = this.enemies.indexOf('der-stier-maibaum-dieb');
    if (diebDef < 0) {
      return null;
    }
    const states = this.world.states;
    const masks = this.world.masks;
    for (let index = 0; index < this.world.highWater; index++) {
      if (
        states[index] !== World.ALIVE ||
        ((masks[index] ?? 0) & this.enemyMask) !== this.enemyMask
      ) {
        continue;
      }
      const base = index * ENEMY_STRIDE;
      if ((this.enemy.data[base] ?? -1) !== diebDef) {
        continue;
      }
      const compiled = this.enemies.at(diebDef);
      const state = compiled.states[this.enemy.data[base + 1] ?? 0];
      const ticks = this.enemy.data[base + 2] ?? 0;
      const swingState = compiled.states.find((s) => s.meleeArc !== null);
      const arc = swingState?.meleeArc ?? null;
      const selfX = this.positionX(index);
      const selfY = this.positionY(index);
      const motionBase = index * ENEMY_MOTION_STRIDE;

      let poleAngle = -Math.PI / 2; // straight up, if nothing else applies
      if (arc !== null) {
        if (state?.name === 'swing') {
          const aim = Math.atan2(
            this.enemyMotion.data[motionBase + 1] ?? 0,
            this.enemyMotion.data[motionBase] ?? 1,
          );
          poleAngle = meleeBladeAngle(arc, aim, ticks);
        } else {
          // Not committed yet: aim at the player now, sit at the start edge,
          // and wind further back as the telegraph fills.
          const aim = Math.atan2(
            this.positionY(this.playerIndex) - selfY,
            this.positionX(this.playerIndex) - selfX,
          );
          const wind =
            state?.name === 'swing-telegraph'
              ? Math.min(1, ticks / Math.max(1, state.telegraphTicks))
              : 0;
          poleAngle = aim + arc.direction * (-arc.arc / 2 - 0.7 * wind);
        }
      }
      return { x: selfX, y: selfY, poleAngle };
    }
    return null;
  }

  /**
   * How many live destructible props of a `DESTRUCTIBLE_PROP_KINDS` index are
   * standing in the room — `dropProp`'s `maxActive` cap (#277).
   *
   * A walk rather than a counter, for the same reason `bossHealth` is one: a
   * count kept up to date would have to be decremented from every path that
   * can destroy a prop (a shot, a bomb's splash, the Maibaum-Dieb picking one
   * up, a room reset), and one missed decrement is a Ladewagen that silently
   * stops dropping bales for the rest of the run. This is called at most once
   * per drop event — a handful of times a fight, never per body per tick.
   *
   * The `isEnemyBody` skip is not defensive: **every enemy carries the
   * `propKind` component**, because `spawnEnemyKind` builds on `spawnTarget`
   * and inherits its components — and an enemy's kind is left at 0, which is
   * `barrel`. So "has the propKind bit" means "is a body", not "is a prop",
   * and without this a Ladewagen would count *itself* as a bale.
   * `maypolePlanted` above only sidesteps the same trap by accident, because
   * no enemy is ever kind 1.
   */
  countProps(kind: number): number {
    const states = this.world.states;
    const masks = this.world.masks;
    const propBit = this.propKind.bit;
    const enemyMask = this.enemyMask;
    let count = 0;
    for (let index = 0; index < this.world.highWater; index++) {
      if (states[index] !== World.ALIVE || ((masks[index] ?? 0) & propBit) === 0) {
        continue;
      }
      if (isEnemyBody(masks[index] ?? 0, enemyMask)) {
        continue;
      }
      if ((this.propKind.data[index] ?? 0) === kind) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Whether any live destructible prop's own circle overlaps a spot — the
   * other half of `dropProp`'s placement rule (#277).
   *
   * `RoomGeometry.isClear` answers "is this inside the room's walls or
   * blocks", which knows nothing about entities, so without this a Ladewagen
   * crawling through its `unload` beat would stack four bales on one pixel
   * and produce a single-tile wall with quadruple health instead of the arc
   * the state is written to lay down.
   */
  propWithin(x: number, y: number, radius: number): boolean {
    const states = this.world.states;
    const masks = this.world.masks;
    const propBit = this.propKind.bit;
    const enemyMask = this.enemyMask;
    for (let index = 0; index < this.world.highWater; index++) {
      if (states[index] !== World.ALIVE || ((masks[index] ?? 0) & propBit) === 0) {
        continue;
      }
      if (isEnemyBody(masks[index] ?? 0, enemyMask)) {
        continue;
      }
      const reach = radius + (this.hurtbox.data[index * 2] ?? 0);
      const dx = this.positionX(index) - x;
      const dy = this.positionY(index) - y;
      if (dx * dx + dy * dy < reach * reach) {
        return true;
      }
    }
    return false;
  }

  /**
   * The arena maypole while it still stands (#199) — position and hit-flash
   * for `MaibaumView` to draw it tall and walk-behind. `null` once it is
   * destroyed or taken. Render-only.
   */
  get maypolePlanted(): { readonly x: number; readonly y: number; readonly flash: number } | null {
    const kind = propKindIndex('maypole');
    const states = this.world.states;
    const masks = this.world.masks;
    const propBit = this.propKind.bit;
    for (let index = 0; index < this.world.highWater; index++) {
      if (states[index] !== World.ALIVE || ((masks[index] ?? 0) & propBit) === 0) {
        continue;
      }
      if ((this.propKind.data[index] ?? 0) !== kind) {
        continue;
      }
      return {
        x: this.positionX(index),
        y: this.positionY(index),
        flash: this.flash.data[index] ?? 0,
      };
    }
    return null;
  }

  /**
   * Opens any bombable wall within `radius` of `(x, y)`. Called once per
   * explosion by `stepBombs` (`sim/systems/bombs.ts`) with the blast's own
   * position and radius — "close enough to reveal" is exactly "close enough
   * to damage," the same blast, no separate concept of range.
   *
   * A wall's distance is measured to the point on the room boundary its door
   * gap is centred on (`render/world/scenery.ts`'s door pieces cut the same
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
   * Clears the destructible boulders a Bierfassl blast cross covers (#4) —
   * called once per detonation by `stepBombs`. Each fallen boulder throws a
   * dust burst and is recorded under this room's id (`destroyedBoulders`) so
   * the path stays open when the player comes back. `bouldersChangedTick` is
   * bumped so the renderer knows to rebuild the room.
   */
  breakBouldersInBlast(x: number, y: number, halfWidth: number, armLength: number): void {
    const scratch = this.boulderBlastScratch;
    scratch.length = 0;
    const broken = this.room.breakBoulders(x, y, halfWidth, armLength, scratch);
    if (broken === 0) {
      return;
    }
    let record = this.destroyedBoulders.get(this.roomId);
    if (record === undefined) {
      record = [];
      this.destroyedBoulders.set(this.roomId, record);
    }
    for (let i = 0; i + 1 < scratch.length; i += 2) {
      const bx = scratch[i] ?? 0;
      const by = scratch[i + 1] ?? 0;
      record.push(bx, by);
      boulderDebris(this, bx, by);
    }
    this.bouldersChangedTickValue = this.tick;
  }

  /**
   * The tick a boulder last fell in the current room, or `-1` — `app/main.ts`
   * polls this and rebuilds the room's scenery (the same in-place path a
   * bombed secret wall uses) when it changes, so the cleared boulders stop
   * being drawn.
   */
  get bouldersChangedTick(): number {
    return this.bouldersChangedTickValue;
  }

  /**
   * Replays this run's boulder destruction for the room authored as
   * `templateId` onto `geometry` — the hook `app/main.ts` uses so a room
   * *prewarmed* while the player walks back to it is built with the same
   * cleared paths `applyCompiledRoom` gives the live one. A no-op for a room
   * nothing has been bombed in.
   */
  reapplyDestroyedBoulders(templateId: string, geometry: RoomGeometry): void {
    const record = this.destroyedBoulders.get(templateId);
    if (record === undefined) {
      return;
    }
    for (let i = 0; i + 1 < record.length; i += 2) {
      geometry.clearBoulderAt(record[i] ?? 0, record[i + 1] ?? 0);
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
    // Same reasoning again: a fresh floor's draw of a template id that a
    // previous floor happened to also use must not start pre-unlocked.
    this.unlockedKeyRoomIds.clear();
    // Der Meisterschlüssel (#275) is per-floor: one gate, one key, consumed
    // or dropped when the floor ends. `bossDoorGated` is not touched here —
    // `configureFloorGate`, called right after this on a floor advance, owns
    // it and re-derives it from the new floor's plan.
    this.meisterschluesselHeld = false;
  }

  /**
   * Whether this floor's boss door needs Der Meisterschlüssel (#275) — set
   * per floor by `app/main.ts` from `FloorPlan.minibossRoomIds` being
   * non-empty, at every point it (re)builds a floor: `startRun`,
   * `advanceFloor`, the `G` room reroll. A floor whose content authors no
   * mini-boss template has no mini-boss room and so no lock
   * (`docs/DECISIONS.md` #75) — the gate rides the slot existing, never the
   * floor number. Derived from the deterministic floor plan and consuming no
   * RNG, so an input-log replay across a floor advance reaches the same gate
   * state (`tests/determinism/floor-advance-replay.test.ts`).
   */
  configureFloorGate(gated: boolean): void {
    this.bossDoorGated = gated;
  }

  /** Grants Der Meisterschlüssel (#275) — the mini-boss room's pickup, and the dev `J` shortcut. Idempotent: the gate is one boolean. */
  grantMeisterschluessel(): void {
    this.meisterschluesselHeld = true;
  }

  /** Whether Der Meisterschlüssel (#275) is in hand — shown in the wallet HUD, read by `app/main.ts` to draw the boss door locked. */
  get meisterschluessel(): boolean {
    return this.meisterschluesselHeld;
  }

  /** Turns the minimap's secret-room reveal on or off — an item's `onPickup`/`onRemove` pair. See `secretRoomsRevealedFlag`. */
  setSecretRoomsRevealed(revealed: boolean): void {
    this.secretRoomsRevealedFlag = revealed;
  }

  /** Whether the minimap should show this floor's secret rooms unfound — read by `app/main.ts`'s floor-plan view sync. */
  get secretRoomsRevealed(): boolean {
    return this.secretRoomsRevealedFlag;
  }

  /** Whether this floor's boss door is currently gated *and* still shut — false once the key opens it, or on an ungated floor. See `configureFloorGate`. */
  get bossDoorLocked(): boolean {
    return this.bossDoorGated && !this.meisterschluesselHeld;
  }

  /**
   * The door the player is currently standing in the gap of, or `null`.
   *
   * The player is always clamped to the room's interior rectangle (see
   * `resolveAxis` in `systems/motion.ts`) — there is no physical gap in the
   * wall to walk through — so this is: touching the boundary at the point a
   * door is drawn (`render/world/scenery.ts`'s `DOOR_SPAN` gap, centred on that
   * door's own cell), with that door unlocked. This alone is only *touch* —
   * a room running along its own wall crosses the same band with no
   * intention of leaving through it, since the clamp above leaves an edge
   * sitting on the wall until the player presses away from it again, not
   * only while they are pressing into it. `transitionTo`/`transitionToStaircase`
   * key off this for the unlock-a-key-room side effect (touch is enough for
   * that), but additionally gate the actual room switch on `pressingToward`
   * — see those methods' own doc comments. The caller (the app layer, which
   * owns the floor plan and room templates) polls this once a tick and calls
   * `transitionTo` when it isn't `null` — the same call the dev "N" shortcut
   * in `main.ts` already makes, with `force: true` since it never has real
   * movement input to check.
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
          if (y <= this.room.minY + PLAYER_FOOTPRINT && Math.abs(x - centre.x) <= half) {
            return door;
          }
          break;
        case 'south':
          if (y >= this.room.maxY - PLAYER_FOOTPRINT && Math.abs(x - centre.x) <= half) {
            return door;
          }
          break;
        case 'west':
          if (x <= this.room.minX + PLAYER_FOOTPRINT && Math.abs(y - centre.y) <= half) {
            return door;
          }
          break;
        case 'east':
          if (x >= this.room.maxX - PLAYER_FOOTPRINT && Math.abs(y - centre.y) <= half) {
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
   *
   * `roomInstanceId` — the floor plan's own per-slot id for the room being
   * loaded (`FloorPlanRoom.id`), when the caller has one. `roomId` (and so
   * `roomClearedIds`/`roomLootSnapshots`) otherwise falls back to the
   * *template's* own authored id (`compiled.source.id`), which two physical
   * rooms share whenever they draw the same template — harmless across a
   * floor boundary (`clearFloorProgress` wipes the tracking every floor
   * advance) but not within one: an XL floor's two mini-boss slots (#271)
   * draw from the same one-template-per-floor-tag pool today, so without a
   * caller-supplied instance id they'd collide and the second room would
   * read as pre-cleared — no fight, no key, no reward — the instant the
   * first one is. `app/main.ts` passes the floor plan's own room id on every
   * real load; a caller with no floor plan (a unit test, the room editor)
   * gets the old template-id behaviour, which is exactly right for it.
   */
  loadRoom(
    template: unknown,
    floor = 1,
    direction: RoomDirection | null = null,
    hiddenDoors: readonly Pick<CompiledDoor, 'direction' | 'cellCol' | 'cellRow'>[] = [],
    placement?: RoomPlacement,
    entryCell: { readonly col: number; readonly row: number } = { col: 0, row: 0 },
    suppressContent = false,
    roomInstanceId?: string,
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
        id: roomInstanceId ?? compiled.source.id,
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
   * clear, and — for a key-locked treasure room, the *first* time it is
   * entered — a Kellerschlüssel is spent to open it. The key is spent only
   * once every other check has passed, so a blocked transition (wrong
   * direction, enemies still up, no key) never costs one.
   *
   * A room already in `unlockedKeyRoomIds` never asks again: the door was
   * unlocked the moment the key was spent, not re-locked behind the player
   * on the way out, so leaving and walking back in must find it open — the
   * same "a visited room is never still locked" rule `app/main.ts`'s
   * `lockedDoorsFor` already drew the door itself by.
   *
   * Unlocking and actually crossing are two different moments (the caller —
   * `app/main.ts`'s real per-tick `doorContact` poll — is the one that
   * enforces this on the normal path): the key spend above happens on mere
   * *touch*, same tick a still-locked door is reached, so the run's own
   * "is this open now" state settles immediately. The room switch just below
   * additionally requires `pressingToward(direction)` — the player has to be
   * holding movement into the door, not merely standing (or running past) at
   * its threshold, which `doorContact` alone cannot tell apart from a real
   * crossing — and then, on top of that, `crossingDwellElapsed(direction)`:
   * a few more ticks of the same held-down direction before the room
   * actually loads, so the crossing reads as a walk through the doorframe
   * rather than the world swapping out the instant the player's edge reaches
   * it. `force` skips both of those checks for the handful of callers that
   * aren't a real player walking (`app/main.ts`'s `N` floor-tour shortcut) —
   * never for a live door-contact poll.
   *
   * `roomInstanceId` is `loadRoom`'s own parameter, forwarded through —see
   * its doc comment for why a caller with a floor plan should always pass
   * the destination room's own `FloorPlanRoom.id`.
   */
  transitionTo(
    template: unknown,
    floor: number,
    direction: RoomDirection,
    hiddenDoors: readonly Pick<CompiledDoor, 'direction' | 'cellCol' | 'cellRow'>[] = [],
    placement?: RoomPlacement,
    entryCell?: { readonly col: number; readonly row: number },
    force = false,
    roomInstanceId?: string,
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
    const isKeyLocked = destination.source.metadata.keyLocked === true;
    const alreadyUnlocked = isKeyLocked && this.unlockedKeyRoomIds.has(destination.source.id);
    if (isKeyLocked && !alreadyUnlocked && !this.spendKeys(1)) {
      return false;
    }
    if (isKeyLocked) {
      this.unlockedKeyRoomIds.add(destination.source.id);
    }
    // Der Meisterschlüssel gate (#275): a floor that has a mini-boss room
    // (`bossDoorGated`, set per floor from `FloorPlan.minibossRoomIds`) keeps
    // its boss door shut until the key the mini-boss drops is in hand.
    // Refused on touch, the same as a key-locked treasure door above — but
    // unlike a Kellerschlüssel the key is spent only on the actual crossing
    // below, never on a brush past the threshold, so standing in the doorway
    // with a key can never leave the run keyless and still outside.
    const isGatedBossRoom =
      this.bossDoorGated && destination.source.metadata.specialRole === 'boss';
    if (isGatedBossRoom && !this.meisterschluesselHeld) {
      return false;
    }
    if (!force && !this.pressingToward(direction)) {
      this.doorCrossingDirection = null;
      this.doorCrossingTicks = 0;
      return false;
    }
    if (!force && !this.crossingDwellElapsed(direction)) {
      return false;
    }
    this.doorCrossingDirection = null;
    this.doorCrossingTicks = 0;
    if (isGatedBossRoom) {
      // Spent on the way in, and the gate drops for the rest of the floor: a
      // Blutwurz (#84) spirit walk back to this now-cleared boss room has to
      // find the door open, not ask for a second key that no longer exists.
      this.meisterschluesselHeld = false;
      this.bossDoorGated = false;
    }
    this.roomClearedIds.add(this.roomId);
    this.loadRoom(
      template,
      floor,
      direction,
      hiddenDoors,
      placement,
      entryCell,
      false,
      roomInstanceId,
    );
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

  /**
   * `transitionTo`'s staircase counterpart — see `loadStaircaseRoom`. No
   * staircase is ever key-locked (none is authored with any content yet),
   * so there is no unlock-on-touch step here — but the same
   * `pressingToward` crossing gate applies, and the same `force` escape
   * hatch for the same non-player callers. See `transitionTo`'s own doc
   * comment for why both exist.
   */
  transitionToStaircase(
    template: unknown,
    floor: number,
    direction: RoomDirection,
    hiddenDoors: readonly Pick<CompiledDoor, 'direction' | 'cellCol' | 'cellRow'>[] = [],
    force = false,
  ): boolean {
    if (!this.roomTemplateLoaded || this.doorsLocked || !this.hasDoor(direction)) {
      return false;
    }
    if (!force && !this.pressingToward(direction)) {
      this.doorCrossingDirection = null;
      this.doorCrossingTicks = 0;
      return false;
    }
    if (!force && !this.crossingDwellElapsed(direction)) {
      return false;
    }
    this.doorCrossingDirection = null;
    this.doorCrossingTicks = 0;
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
    this.roomDecorativeProps = compiled.decorativeProps;
    this.roomDoors = compiled.doors;
    this.bombableWalls.clear();
    this.pedestalList = [];
    this.pendingBossPedestals = [];
    this.pendingMinibossKey = null;
    this.pendingMinibossPedestal = null;
    // Reset unconditionally, like `pedestalList` above — `restoreOrSpawnRoomLoot`,
    // called right after this, is what actually repopulates it (from a
    // snapshot, by spawning straight into a shop, or by pushing a fresh
    // `pendingBossLosbrunnen` for a boss room's first visit). Without this,
    // a machine spawned in one room would keep reading as "in range" while
    // standing in an unrelated room this floor was never rolled a
    // Losbrunnen for a snapshot of.
    this.machineRuntime = null;
    this.pendingBossLosbrunnen = null;
    this.machinePreviewItemId = null;
    this.machinePickerOpenValue = false;
    this.machineCyclePreviousSign = 0;
    this.machineRollPhase = { kind: 'idle' };
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
    // Boulders this run has already bombed away in this room stay away
    // (#4) — `this.room` is a fresh `RoomGeometry` compiled from the
    // template, so the destruction has to be replayed onto it.
    const bombed = this.destroyedBoulders.get(compiled.id);
    if (bombed !== undefined) {
      for (let i = 0; i + 1 < bombed.length; i += 2) {
        this.room.clearBoulderAt(bombed[i] ?? 0, bombed[i + 1] ?? 0);
      }
    }
    this.roomSpecialRole = compiled.specialRole;
    this.bossExitDoor =
      compiled.specialRole === 'boss' ? nextFloorExitDoor(compiled.geometry, compiled.doors) : null;
    this.roomTemplateLoaded = true;
    this.roomTransitionTicks = direction === null ? 0 : ROOM_TRANSITION_TICKS;
    this.roomTransitionDirection = direction;
    this.roomWarmupTicks = ROOM_WARMUP_TICKS;
    // A puff at the door the player just came through (#153) — the transition
    // itself is #96's camera slide, and this is what makes the arrival land
    // somewhere rather than simply appearing there. Only on a real transition:
    // `direction === null` is the first room of a run, which nobody walked
    // into.
    if (direction !== null) {
      doorPuff(this, this.positionX(this.playerIndex), this.positionY(this.playerIndex));
    }
    if (floor !== this.lastFloorStartDispatched) {
      this.lastFloorStartDispatched = floor;
      this.rollFloorCurse();
      dispatchItemFloorStart(this, floor);
      // Der Losbrunnen (#218): fixed for the floor the instant it starts,
      // the same footing as the curse roll right above — never re-rolled by
      // walking in and out of a room, and reset here (rather than only on a
      // fresh machine spawn) so a floor that rolls "no machine" stays that
      // way even if `machineRuntime` was still set from... it never is
      // across a floor boundary in practice, but resetting unconditionally
      // is what makes that an invariant instead of luck.
      this.floorHasLosbrunnen = this.random.items.chance(this.tuning.machine.spawnChance);
      // #238: which of the floor's shop/boss room actually claims it is
      // decided by whichever the player reaches first, not here — this
      // just clears last floor's claim.
      this.losbrunnenClaimedThisFloor = false;
      // #278: nobody has fought either of this floor's (up to two)
      // mini-bosses yet — see the field's own doc comment.
      this.minibossKeyGrantedThisFloor = false;
      this.machineRuntime = null;
      this.pendingBossLosbrunnen = null;
      this.machinePreviewItemId = null;
      this.machinePickerOpenValue = false;
      this.machineCyclePreviousSign = 0;
      this.machineRollPhase = { kind: 'idle' };
    }
    this.currentFloorValue = floor;
    this.roomEnemyCount = 0;
    this.maypoleTaken = false;
    // Blutwurz (#84): "cleared rooms repopulate" — a corpse run across an
    // empty floor is a walk, not a second chance. Boss rooms are the one
    // exception ("the floor's boss, if already killed, stays dead" — the
    // issue's own words): re-fighting one is a second run, not a penalty,
    // so `alreadyCleared` still holds for `specialRole === 'boss'` even
    // while the spirit walk is on.
    const alreadyCleared =
      this.roomClearedIds.has(this.roomId) &&
      !(this.blutwurzActiveFlag && compiled.specialRole !== 'boss');
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
        // A mini-boss room (#274) whose slot still holds a *placeholder* — a
        // floor enemy, because the floor has no authored mini-boss yet — makes
        // it a guaranteed elite (#156), so the gate the player detoured to is
        // never just an ordinary body. A real mini-boss (`bossBar`, #276:
        // floor 1's Der Rattenkönig and Die Zapfhahn-Orgel) is spawned plain:
        // it carries its own health tuned against its own cycle (#66), and the
        // ×1.8 elite modifier on top would break that. Guaranteed elites draw
        // no number from `random.enemies`, so every other room's roll is
        // byte-identical either way.
        const guaranteedElite =
          compiled.specialRole === 'miniboss' && !this.enemies.at(definition).bossBar;
        const elite =
          guaranteedElite || (eliteChance > 0 && this.random.enemies.nextFloat() < eliteChance);
        this.spawnEnemyKind(definition, spawn.x, spawn.y, elite);
      }
      // Der Meisterschlüssel (#275) is held back to the tick this room
      // clears — the same reason a boss room's pedestal is (`step`'s
      // room-clear check drains `pendingMinibossKey` alongside
      // `pendingBossPedestals`). The mini-boss's own authored spawn point is
      // the drop spot: it is the centre of an open arena, and a fixed anchor
      // keeps the drop reproducible without tracking where a charging body
      // happened to fall. A Blutwurz (#84) repopulate re-arms this the same
      // way it re-spawns the fight — a second key for a second fight, which
      // is exactly the spirit walk's own "cleared rooms come back" rule.
      if (compiled.specialRole === 'miniboss') {
        const keySpot = compiled.enemySpawns[0];
        if (keySpot !== undefined) {
          this.pendingMinibossKey = { x: keySpot.x, y: keySpot.y };
        }
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
      // A room may author several `maypole` props as alternative arena
      // positions (#199, `content/rooms/dorf-boss.json`): only one stands, and
      // which one is a `random.floor` roll — the stream that already owns
      // "room placement". Any other destructible prop spawns wherever it is
      // authored, one entity per entry, as it always has.
      const maypoles = compiled.decorativeProps.filter((prop) => prop.type === 'maypole');
      const chosenMaypole =
        maypoles.length > 0
          ? maypoles[Math.floor(this.random.floor.nextFloat() * maypoles.length)]
          : undefined;
      for (const prop of compiled.decorativeProps) {
        const propKind = DESTRUCTIBLE_PROP_KINDS.indexOf(prop.type as DestructiblePropKind);
        if (propKind < 0) {
          continue;
        }
        if (prop.type === 'maypole') {
          if (prop === chosenMaypole) {
            this.spawnTarget(
              prop.x,
              prop.y,
              MAYPOLE_RADIUS,
              propKind,
              MAYPOLE_HEALTH,
              MAYPOLE_MASS,
            );
          }
          continue;
        }
        this.spawnTarget(prop.x, prop.y, TARGET_RADIUS, propKind);
      }
    }
    this.restoreOrSpawnRoomLoot(compiled);
    if (this.roomEnemyCount === 0) {
      this.roomClearedIds.add(this.roomId);
    }
    this.world.flush();
  }

  /**
   * The room-clear celebration (#153): a glint ring at every reward that
   * actually appeared this tick, and a dust puff at every door.
   *
   * The door puffs are redundant with something already visible — the doors
   * unlock — which is the constraint on an effect that an accessibility
   * toggle is allowed to remove. `render/` is where the suppression happens,
   * not here: a reduced-motion run must produce the same simulation as a
   * full one, so these particles are always spawned and sometimes not drawn
   * (`docs/DECISIONS.md` #41).
   *
   * The ring is not redundant the same way, so it does not fire the same
   * way: `rewardLocations` is only ever where a reward actually spawned this
   * tick (`rollRoomClearLoot`'s drop, a boss's pedestal), and only there — a
   * ring at the room's own centre regardless of whether anything dropped, or
   * regardless of where a drop's `safeSpawnPoint` fallback actually placed
   * it, used to celebrate a reward that either was not there or was
   * somewhere else on screen.
   */
  private announceRoomClear(rewardLocations: readonly { x: number; y: number }[]): void {
    const room = this.room;
    for (const location of rewardLocations) {
      roomClearRing(this, location.x, location.y);
    }
    for (const door of this.roomDoors) {
      const centre = doorCentre(room, door);
      doorPuff(this, centre.x, centre.y);
    }
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
        this.spawnPickup(pickup.type, pickup.x, pickup.y, pickup.price, false);
      }
      this.pedestalList = snapshot.pedestals.map((pedestal) => ({ ...pedestal }));
      this.machineRuntime = snapshot.machine === null ? null : { ...snapshot.machine };
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
      // A shop's `losbrunnen` prop (#238) is the machine's second home:
      // unlike the boss room's reward, a shop's stock is never held back
      // for a fight, so this claims the floor's Losbrunnen and spawns it
      // straight into `machineRuntime` the instant the shop loads, rather
      // than going through `pendingBossLosbrunnen`'s hold-until-clear dance.
      // `losbrunnenClaimedThisFloor` is what stops the boss room from also
      // handing one out later this floor.
      if (prop.type === 'losbrunnen') {
        if (this.floorHasLosbrunnen && !this.losbrunnenClaimedThisFloor) {
          const safe = this.safeSpawnPoint(prop.x, prop.y, PEDESTAL_RADIUS);
          this.machineRuntime = { x: safe.x, y: safe.y, itemIndex: -1, rolls: 0, broken: false };
          this.losbrunnenClaimedThisFloor = true;
        }
        continue;
      }
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
        // Der Losbrunnen (#218) rides the boss room's own authored reward
        // spot rather than a second authored position — offset clear of it
        // and nudged safe the same way. Only the first `pedestal` prop in a
        // boss room ever contributes one, and only when nothing has claimed
        // the floor's Losbrunnen yet (`losbrunnenClaimedThisFloor`, #238) —
        // a shop the player already reached this floor takes priority.
        if (this.floorHasLosbrunnen && !this.losbrunnenClaimedThisFloor) {
          const machineSpot = this.safeSpawnPoint(
            prop.x + LOSBRUNNEN_OFFSET_X,
            prop.y + LOSBRUNNEN_OFFSET_Y,
            PEDESTAL_RADIUS,
          );
          this.pendingBossLosbrunnen = { x: machineSpot.x, y: machineSpot.y };
          this.losbrunnenClaimedThisFloor = true;
        }
      } else if (this.roomSpecialRole === 'miniboss' && this.roomEnemyCount > 0) {
        // Held back the same way, and for the same reason, as the boss's own
        // reward — `pendingMinibossPedestal`'s doc comment. Never a
        // Losbrunnen host (#278's own explicit call-out: a third home turns
        // a chance encounter into furniture) — only `pendingBossLosbrunnen`
        // above ever claims `floorHasLosbrunnen`.
        this.pendingMinibossPedestal = { x: safe.x, y: safe.y };
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
      machine: this.machineRuntime === null ? null : { ...this.machineRuntime },
    });
  }

  private hasDoor(direction: RoomDirection): boolean {
    return this.doors.some((door) => door.direction === direction);
  }

  /**
   * Records this tick's held movement input, for `pressingToward` — called
   * once from `systems/movement.ts`'s `stepPlayerMovement`, which already
   * computes the knockdown-zeroed axis values this reuses rather than
   * re-deriving them from the raw `InputFrame` a second place.
   */
  setLastMoveInput(x: number, y: number): void {
    this.lastMoveInputX = x;
    this.lastMoveInputY = y;
  }

  /**
   * Whether the player's own held movement input (WASD, not aim) has a
   * component pointing toward `direction` — the whole of what tells a
   * deliberate walk through a door apart from merely grazing its threshold
   * while running along the wall it sits on.
   *
   * `doorContact` can go true from *position* alone: the player is always
   * clamped to the room's interior rectangle (see that getter's own doc
   * comment), so once they have pressed into a wall at all, their edge sits
   * exactly on it until they press away again — running north-south along a
   * west wall with a door on it, never once pressing west, still leaves them
   * sitting on that clamp from an earlier press and crosses the door's span.
   * `transitionTo`/`transitionToStaircase` gate the actual room switch on
   * this, on top of `doorContact`, so that only counts as *touching* the
   * door, not *going through* it.
   */
  pressingToward(direction: RoomDirection): boolean {
    switch (direction) {
      case 'north':
        return this.lastMoveInputY < 0;
      case 'south':
        return this.lastMoveInputY > 0;
      case 'west':
        return this.lastMoveInputX < 0;
      case 'east':
        return this.lastMoveInputX > 0;
    }
  }

  /**
   * Whether the player has now been pressing into `direction`'s door for
   * `tuning.movement.doorCrossingTicks` ticks running — `transitionTo`'s and
   * `transitionToStaircase`'s last gate before the actual room switch, on top
   * of `pressingToward` itself.
   *
   * Called only once `pressingToward(direction)` is already known true (both
   * callers check it first), so every tick this runs is one more tick of a
   * deliberate, continuous walk into that door: counts it, and resets to 0
   * the moment a *different* direction's door is what is asking, so touching
   * one door, backing off, and pressing into another never carries progress
   * over. `pressingToward` failing (the caller's own job to check) is what
   * resets *this* one — see the field's own doc comment.
   */
  private crossingDwellElapsed(direction: RoomDirection): boolean {
    if (this.doorCrossingDirection !== direction) {
      this.doorCrossingDirection = direction;
      this.doorCrossingTicks = 0;
    }
    this.doorCrossingTicks += 1;
    return this.doorCrossingTicks >= this.tuning.movement.doorCrossingTicks;
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
      return this.findPlayerSpawnPoint(PLAYER_FOOTPRINT);
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
            return { x: door.centre.x, y: door.centre.y + PLAYER_FOOTPRINT + 1 };
          case 'south':
            return { x: door.centre.x, y: door.centre.y - PLAYER_FOOTPRINT - 1 };
          case 'east':
            return { x: door.centre.x - PLAYER_FOOTPRINT - 1, y: door.centre.y };
          case 'west':
            return { x: door.centre.x + PLAYER_FOOTPRINT + 1, y: door.centre.y };
        }
      }
    }
    const cellCentreX = this.room.minX + entryCell.col * SCREEN_WIDTH + SCREEN_WIDTH / 2;
    const cellCentreY = this.room.minY + entryCell.row * SCREEN_HEIGHT + SCREEN_HEIGHT / 2;
    switch (direction) {
      case 'north':
        return { x: cellCentreX, y: this.room.maxY - PLAYER_FOOTPRINT - 1 };
      case 'east':
        return { x: this.room.minX + PLAYER_FOOTPRINT + 1, y: cellCentreY };
      case 'south':
        return { x: cellCentreX, y: this.room.minY + PLAYER_FOOTPRINT + 1 };
      case 'west':
        return { x: this.room.maxX - PLAYER_FOOTPRINT - 1, y: cellCentreY };
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

  /**
   * The enemy id at storage slot `index` — `app/audio/sfx-player.ts`'s hook
   * for picking a hit/death sound by what was actually hit
   * (`content/audio/sfx.ts`'s `ENEMY_SFX_CATEGORY`). Checks this tick's
   * kills first (`deathEnemyIdByIndex` — a killed slot is freed by
   * `world.flush()` before any of this can run, so its live component data
   * is already gone), then falls back to the slot's live data for a hit
   * that did not kill. `null` for anything that resolves to neither: the
   * player, a prop, or a slot with nothing recorded either way.
   */
  enemyIdAt(index: number): string | null {
    const fromDeath = this.deathEnemyIdByIndex.get(index);
    if (fromDeath !== undefined) {
      return fromDeath;
    }
    if (index < 0 || index >= this.world.highWater || this.world.states[index] !== World.ALIVE) {
      return null;
    }
    if (((this.world.masks[index] ?? 0) & this.enemyMask) !== this.enemyMask) {
      return null;
    }
    const definitionIndex = this.enemy.data[index * ENEMY_STRIDE] ?? -1;
    if (definitionIndex < 0) {
      return null;
    }
    return this.enemies.at(definitionIndex).id;
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

  /**
   * The tick the player last took damage on, or `-1` — the flinch clip's
   * trigger (`render/animation/state.ts`).
   *
   * Recorded in `applyPlayerDamage` rather than derived from
   * `playerInvulnerableTicks`, because the window a hit opens is a different
   * length depending on what landed it (`ImpactTuning`'s contact and
   * projectile windows) and because Umgfalln opens one without anyone being
   * hit. A count that means two different things cannot be read backwards
   * into "was he just hurt"; a tick stamp can.
   */
  get playerHurtTick(): number {
    return this.playerHurtTick_;
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

  /** The red Maß pool's ceiling — the character's, not the engine's default. */
  get playerMaxHealth(): number {
    return this.health.data[this.playerIndex * 2 + 1] ?? 0;
  }

  /**
   * König Ludwig is over the furniture, not on it (#47) — read once a tick
   * by `sim/systems/movement.ts`. Never lets anyone through a wall: see
   * `RoomGeometry.blockOverflyable`.
   */
  get playerFlies(): boolean {
    return this.characterFlies;
  }

  /** Whether Ludwig's purse still has something in it — his damage rides on this. */
  get pursePowered(): boolean {
    return this.characterPurse && this.biermarkenCount > 0;
  }

  /**
   * Grants soul hearts (Weißwurst), clamped to `SOUL_HEALTH_MAX` — collected
   * via `spawnPickup`, or called directly by tests.
   */
  addSoulHealth(amount: number): void {
    if (amount > 0) {
      this.soulHp = Math.min(SOUL_HEALTH_MAX, this.soulHp + amount);
    }
  }

  /** Grants eternal hearts (Blutwurst), clamped to `ETERNAL_HEALTH_MAX`. Same caveat as `addSoulHealth`. */
  addEternalHealth(amount: number): void {
    if (amount > 0) {
      this.eternalHp = Math.min(ETERNAL_HEALTH_MAX, this.eternalHp + amount);
    }
  }

  /** Whether `pool` is already at its ceiling — `sim/systems/pickup.ts` refuses a Wurst pickup that targets a full pool. */
  healthPoolFull(pool: 'red' | 'soul' | 'eternal'): boolean {
    if (pool === 'red') {
      return this.playerHealth >= this.playerMaxHealth;
    }
    if (pool === 'soul') {
      return this.soulHp >= SOUL_HEALTH_MAX;
    }
    return this.eternalHp >= ETERNAL_HEALTH_MAX;
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

  /**
   * Whether this run has the Promille mechanic — see
   * `promilleUnlockedValue`. A getter rather than a public field because the
   * mid-run unlock (#236) can flip it once, and every reader outside this
   * class only ever asks.
   */
  get promilleUnlocked(): boolean {
    return this.promilleUnlockedValue;
  }

  /**
   * Whether the mid-run Promille-unlock banner is still up (#236) — the same
   * "goes false past its ticks" shape `curseAnnouncement` has. The wording
   * lives in `render/promille-unlock-hud.ts`, not here: the meter has a
   * neutral reskin (#33) and the sim has no business knowing which name the
   * player has asked for.
   */
  get promilleUnlockAnnounced(): boolean {
    return this.promilleUnlockAnnounceTicks > 0;
  }

  /**
   * Switches Promille on because this floor's boss just went down (#236).
   *
   * Called from `step`'s room-clear branch, on the one tick a boss room
   * becomes clear — the same tick the boss's pedestal spawns and the app
   * commits the defeat to the save (`recordBossDefeat`), so the meter
   * arrives with the rest of the reward rather than a beat later.
   *
   * `>=` rather than `===` on the floor: an endless run (`app/
   * endless-floor-debug.ts`) or a future gate placed above a floor the run
   * skipped past should still unlock rather than silently never firing.
   */
  private maybeUnlockPromille(): { x: number; y: number } | null {
    const floor = this.promilleUnlockFloorValue;
    if (this.promilleUnlockedValue || floor === null || this.currentFloorValue < floor) {
      return null;
    }
    this.promilleUnlockedValue = true;
    this.promilleUnlockAnnounceTicks = PROMILLE_UNLOCK_ANNOUNCE_TICKS;
    // The mechanic arriving is a bigger deal than whatever quick pickup toast
    // happened to still be on screen — the same suppression `rollFloorCurse`
    // does for its own banner.
    this.toastTicks = 0;
    // And the first Maß, on the floor in front of the player, guaranteed
    // rather than rolled. A meter that appears empty and then waits on a
    // ~2% drop weight to move for the first time is an announcement, not an
    // arrival: the point of moving the gate inside the run is that the
    // player gets to *use* the mechanic on the floor they have left, so the
    // unlock hands them the drink that demonstrates it.
    const definition = this.pickups.get(PROMILLE_UNLOCK_GIFT_PICKUP);
    const spot = this.safeSpawnPoint(
      this.positionX(this.playerIndex),
      this.positionY(this.playerIndex) + PROMILLE_UNLOCK_GIFT_OFFSET,
      definition.radius,
    );
    this.spawnPickup(PROMILLE_UNLOCK_GIFT_PICKUP, spot.x, spot.y);
    return spot;
  }

  /** The active floor curse (#49), or `null` on an uncursed floor. */
  get curse(): CurseId | null {
    return this.curseIdValue;
  }

  /**
   * The curse-entry announcement, or `null` once it has aged out — same
   * "return null past its ticks" shape as `pickupToast`. Read by the render
   * layer once a frame.
   */
  get curseAnnouncement(): { readonly name: string; readonly description: string } | null {
    if (this.curseAnnounceTicks <= 0 || this.curseIdValue === null) {
      return null;
    }
    const definition = CURSE_DEFINITIONS.find((entry) => entry.id === this.curseIdValue);
    return definition === undefined
      ? null
      : { name: definition.name, description: definition.description };
  }

  /**
   * Rolls whether this floor carries a curse, and which one — called once
   * per floor, from `applyCompiledRoom`'s own "new floor" guard, the same
   * moment `dispatchItemFloorStart` fires.
   *
   * Kater is the one curse with an immediate effect rather than a per-tick
   * one: it starts the same `katerTicksValue` debuff `tickUmgfalln` would,
   * so the floor opens hungover instead of the player waking up that way.
   * Nebel and Blaue Stunde need nothing here — both are read directly off
   * `curse` by the renderer — and Föhn/Sperrstunde's per-tick effects live in
   * `sim/systems/curse.ts`'s `stepCurse`.
   */
  private rollFloorCurse(): void {
    const tuning = this.tuning.curse;
    this.curseFoehnAngle = 0;
    this.sperrstundeHarassmentCooldown = 0;
    if (!this.random.curse.chance(tuning.curseChance)) {
      this.curseIdValue = null;
      this.sperrstundeTicksLeft = 0;
      return;
    }
    const definition = this.random.curse.pick(CURSE_DEFINITIONS);
    this.curseIdValue = definition.id;
    this.sperrstundeTicksLeft =
      definition.id === 'sperrstunde' ? Math.round(tuning.sperrstundeTimerTicks) : 0;
    if (definition.id === 'kater') {
      this.startKater();
    }
    this.curseAnnounceTicks = CURSE_ANNOUNCE_TICKS;
    // The curse announcement is a bigger deal than an ordinary pickup toast
    // that happened to still be showing when the floor loaded — same
    // suppression precedent `takePedestalItem` sets for its own reveal panel.
    this.toastTicks = 0;
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
      description: pickupDescriptionFor(definition, this.promilleUnlocked),
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

  /** True once the run has been won (#155) — see `markWon`. */
  get playerWon(): boolean {
    return this.playerWonFlag;
  }

  /** The tick the run was won on, or -1 until then. */
  get playerWonTick(): number {
    return this.playerWonTick_;
  }

  /**
   * Marks the run won (#155) — called by `app/main.ts`'s `enterNeighbor`
   * the instant it decides the boss room just cleared was the last floor's,
   * rather than routing into another lap of the dev-only endless floor
   * loop. A no-op past the first call, and past a death: once a run has
   * ended one way, it does not end the other way too.
   */
  markWon(): void {
    if (this.playerWonFlag || this.playerDeadFlag) {
      return;
    }
    this.playerWonFlag = true;
    this.playerWonTick_ = this.currentTick;
  }

  /** Whether the spirit walk (#84) is currently on. */
  get blutwurzActive(): boolean {
    return this.blutwurzActiveFlag;
  }

  /** Whether this run still has an unspent Blutwurz — a held bottle. Consumed (and so no longer true) the instant it's used. */
  get blutwurzAvailable(): boolean {
    return this.hasItem('blutwurz');
  }

  /**
   * Where the corpse is, in the current room's local px, plus which room
   * that actually is — `null` outside a spirit walk. `x`/`y` are only
   * meaningful together with `roomId`: read them against `sim.room` only
   * when `roomId === sim.roomId`, the same guard `stepBlutwurz`'s own
   * touch check and the renderer's corpse marker both apply.
   */
  get corpsePosition(): { readonly x: number; readonly y: number; readonly roomId: string } | null {
    return this.blutwurzActiveFlag
      ? { x: this.corpseXValue, y: this.corpseYValue, roomId: this.corpseRoomIdValue }
      : null;
  }

  /**
   * Starts the spirit walk: the bottle is spent (`removeItem`, which is
   * also what makes `blutwurzAvailable` false for the rest of the walk —
   * `content/items/blutwurz.ts`'s own `onLethalDamage` hook is what calls
   * this, and guards against calling it twice), and health drops to
   * `tuning.blutwurz.spiritMaxHealth` — one hit ends it, per #84's own
   * "fragile by design." The build itself is untouched: items, stats and
   * their hooks all keep working exactly as they did the tick before —
   * #84 leaves "the exact loadout" an open question and never asks for the
   * build to go dark, only for the player to. `app/main.ts` reacts to this
   * turning on the same tick, the same way it reacts to `sim.doorContact`:
   * it is what actually walks the player back to the floor's start room,
   * since the floor plan lives outside `GameSim`.
   *
   * Public so the item's own hook can call it — hooks call back only into
   * what `ItemHookContext` hands them (`content-is-data`), and `ctx.sim` is
   * the full public `GameSim` surface.
   */
  startBlutwurz(): void {
    const index = this.playerIndex;
    this.corpseXValue = this.positionX(index);
    this.corpseYValue = this.positionY(index);
    this.corpseRoomIdValue = this.roomId;
    this.removeItem('blutwurz');
    this.blutwurzActiveFlag = true;
    this.blutwurzSpiritTicks = 0;
    this.blutwurzPreviousMaxHealth = this.playerMaxHealth;
    const spiritHealth = Math.max(1, Math.round(this.tuning.blutwurz.spiritMaxHealth));
    this.health.data[index * 2 + 1] = spiritHealth;
    this.health.data[index * 2] = spiritHealth;
  }

  /**
   * Reaching the corpse (#84): the walk succeeded. Health returns to the
   * pre-Blutwurz max, permanently reduced by
   * `tuning.blutwurz.recoveryMaxHealthPenalty`, filled — a successful
   * recovery earns the full (reduced) tank back, not a scrape-by heal — and
   * Kater starts, the same debuff waking from Umgfalln leaves behind.
   *
   * A no-op outside an active walk — public (for `stepBlutwurz`'s own
   * touch-check to call), so guarded the same way `startBlutwurz`'s own
   * caller is, rather than trusting every future caller to check first:
   * calling this twice in a row must not spend the recovery penalty twice.
   */
  recoverFromBlutwurz(): void {
    if (!this.blutwurzActiveFlag) {
      return;
    }
    const index = this.playerIndex;
    const restoredMax = Math.max(
      1,
      this.blutwurzPreviousMaxHealth - Math.round(this.tuning.blutwurz.recoveryMaxHealthPenalty),
    );
    this.health.data[index * 2 + 1] = restoredMax;
    this.health.data[index * 2] = restoredMax;
    this.startKater();
    this.blutwurzActiveFlag = false;
    this.blutwurzSpiritTicks = 0;
  }

  /**
   * The walk failed: Promille (or, in a sober run, `blutwurzSpiritTicks`'s
   * own hidden countdown) ran out before the corpse did. Ends the run
   * exactly like a hit that landed clean would — `killPlayer` reads
   * `blutwurzActiveFlag` before this clears it, which is what gives the
   * death word its own, different one.
   *
   * A no-op outside an active walk, same reasoning `recoverFromBlutwurz`
   * guards for.
   */
  failBlutwurz(): void {
    if (!this.blutwurzActiveFlag) {
      return;
    }
    this.killPlayer();
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
   * Marks the run over for real: no eternal heart, no Blutwurz charge (or
   * already spent one) left to fall back on. Factored out of
   * `applyPlayerDamage`'s lethal branch so `failBlutwurz` — a second death,
   * mid-spirit-walk, from `stepBlutwurz` rather than from a hit — ends the
   * run exactly the same way.
   */
  private killPlayer(): void {
    this.playerDeadFlag = true;
    this.playerDeathTick_ = this.currentTick;
    this.deathWordValue = this.blutwurzActiveFlag
      ? // #84's own acceptance criterion: the run summary should say how
        // close they got. A dedicated word rather than the ordinary pool
        // draw is the cheapest honest version of that — this death has a
        // different shape (a walk that came up short, not a hit that landed
        // clean) and reads as one in the one place every death screen is
        // read.
        'Nimmer zruckkema'
      : drawDeathWord(this.random.cosmetic, this.previousDeathWord);
    this.blutwurzActiveFlag = false;
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
    // Every hit that actually lands passes through here — see this method's
    // own doc comment on being the one place player health changes — so this
    // is the one stamp the flinch clip can trust.
    this.playerHurtTick_ = this.currentTick;
    // ...and the one place the meter pays for a mistake (#311). A hit costs
    // Promille as well as health, which is what turns the damage bonus from
    // a timer into something skill holds on to. Before the lethal branch
    // below, so a hit that ends the run has still spent it — nothing reads
    // the meter after that, but "every landed hit costs Promille" being true
    // of the mechanism beats it being true of most of the paths through it.
    this.lowerPromille(this.tuning.promille.hitPromilleLoss);

    // Reaching exactly zero is lethal, same as going below it — a hit does
    // not need to overkill to end a run, it only needs to use up what is left.
    if (amount >= this.soulHp + red) {
      if (this.eternalHp >= ETERNAL_HALF_UNIT) {
        // A killing blow with a whole heart banked: the heart is spent
        // instead of the run, and comes back as the one half-Maß a player
        // needs to keep standing rather than as a full refill — an eternal
        // heart is a save, not a heal. A single banked half-heart (a lone
        // half-Blutwurst) is not enough on its own to trigger this.
        this.eternalHp -= ETERNAL_HALF_UNIT;
        this.soulHp = 0;
        health[index * 2] = 1;
      } else {
        // Captured before dispatch: a spirit is fragile by design (#84,
        // `tuning.blutwurz.spiritMaxHealth`) — a *second* lethal hit landing
        // while the walk is already underway has to end the run for real,
        // not be silently absorbed because the walk "is already active."
        // `blutwurz.ts`'s own hook already refuses to start a second walk
        // over the first (`!ctx.sim.blutwurzActive`), so `blutwurzActiveFlag`
        // never changes on this path — without capturing `wasActive` first,
        // the check below would read that as "still handled" and the player
        // would take unlimited hits while a spirit.
        const wasActive = this.blutwurzActiveFlag;
        this.soulHp = 0;
        health[index * 2] = 0;
        // Blutwurz (#84): the last chance, before the run ends for real, for
        // a held item to do something about it — `dispatchItemLethalDamage`
        // broadcasts `onLethalDamage` to everything held, and
        // `blutwurz.ts`'s own hook is what actually starts the spirit walk.
        // A hit that lands while nothing intervenes falls straight through
        // to `killPlayer`, exactly as it always did.
        dispatchItemLethalDamage(this);
        if (wasActive || !this.blutwurzActiveFlag) {
          this.killPlayer();
        }
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

  /**
   * Current Promille, 0–5 at baseline Trinkfest, higher once it is raised.
   * Backed by `tuning.promille.current` — see `tuning.ts`.
   *
   * **Zero, unconditionally, in a sober run** (#85). This one getter is the
   * whole of the sober path through the mechanic: the tier, the drift, the
   * aim wobble, the camera sway, the screen distortion, the HUD bar and the
   * `O`-overlay's own readout are every one of them a function of this
   * number, so gating it here makes "no meter, no drift, no tier bonuses"
   * true by construction rather than by six independent guards that could
   * drift apart. `addPromille` is gated too, so `tuning.promille.current`
   * cannot quietly accumulate behind this either — but a debug slider
   * writing that field directly still reads as zero here, which is the
   * "leaves no HUD or drift behind" acceptance criterion holding even for
   * the one path that bypasses `addPromille`.
   */
  get promille(): number {
    return this.promilleUnlocked ? this.tuning.promille.current : 0;
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
   * How far the room has closed in around the player — see
   * `promilleTunnelVision`. Read by `render/vignette.ts`, which turns it into
   * the clear radius of the tunnel it already draws.
   *
   * Unscaled here, like `promilleScreenDistortion` and unlike
   * `promilleSwayMagnitude`: `swayScale`/`driftScale`/`wobbleScale` are
   * *simulation* scales, because sway, drift and wobble all move something
   * the player is aiming with. Sight is drawn, never simulated, so its
   * accessibility softening lives where every other render-only suppression
   * does — see `docs/DECISIONS.md` #41 and `Vignette.setReducedMotion`.
   */
  get promilleTunnelVision(): number {
    return promilleTunnelVision(this.promille, this.tuning.promille);
  }

  /** The murk inside that tunnel — see `promilleGloom`. Read by `render/gloom.ts`. */
  get promilleGloom(): number {
    return promilleGloom(this.promille, this.tuning.promille);
  }

  /**
   * How hot the player's shots run right now (#311) — see
   * `promilleShotHeat`. Read by `render/projectiles.ts`, which spends it on
   * the shot's tint, its glow and the point light it carries.
   *
   * Not scaled by an accessibility multiplier the way `promilleSwayMagnitude`
   * and friends are: those exist so a player who cannot take the *penalty*
   * can turn it down without giving up the damage, and this is the damage's
   * own readout. Turning it off would remove information, not motion. The
   * one thing it does inherit is `get promille`'s sober-run gate, so a run
   * without the mechanic has stone-cold shots by construction.
   */
  get promilleShotHeat(): number {
    return promilleShotHeat(this.promille, this.tuning.promille);
  }

  /**
   * The stat pipeline's starting point (#25): today just what `tuning` says
   * before any modifier runs. `Luck` has no design-doc default yet — nothing
   * reads it — so it starts at zero rather than a number invented for it.
   */
  private baseStats(): BaseStats {
    const buffer = this.baseStatsBuffer;
    buffer[StatId.Damage] = this.tuning.shooting.shotDamage;
    buffer[StatId.FireRate] = this.tuning.shooting.fireDelayTicks;
    buffer[StatId.Range] = this.tuning.shooting.shotLifetimeTicks;
    buffer[StatId.ShotSpeed] = this.tuning.shooting.shotSpeed;
    buffer[StatId.MoveSpeed] = this.tuning.movement.maxSpeed;
    buffer[StatId.Luck] = 0;
    return buffer;
  }

  /**
   * Registers Promille's contribution to the stat pipeline as a source named
   * `'promille'`, replacing it whenever the tier actually changes — a cheap
   * check every tick, a rebuild only on the rare tick a tier boundary is
   * crossed. `promilleFireRateMultiplier` is a rate; Fire Rate is a
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
        stat: StatId.Damage,
        op: 'multiply',
        value: promilleDamageMultiplier(tier, this.tuning.promille),
        source,
      },
      {
        stat: StatId.FireRate,
        op: 'multiply',
        value: 1 / promilleFireRateMultiplier(tier, this.tuning.promille),
        source,
      },
    ];
    this.stats.setSourceModifiers('promille', modifiers);
  }

  /**
   * The character's fixed stat block, registered once at construction as the
   * source `'character'`.
   *
   * Fixed is the point: this is who they are, and it never changes during a
   * run. The rules that *do* move a stat mid-run register their own source
   * instead (`'character-purse'`) rather than rebuilding this one — so the
   * stat inspector shows "Resi ×1.3" and "Geldbeutl ×3" as two separate
   * lines with two separate reasons, which is the whole of what #25 bought.
   */
  private applyCharacterStats(): void {
    if (this.character.stats.length === 0) {
      return;
    }
    const source = {
      kind: 'character' as const,
      id: this.character.id,
      label: this.character.name,
    };
    const modifiers: StatModifier[] = this.character.stats.map((modifier) => ({
      stat: modifier.stat,
      op: modifier.op,
      value: modifier.value,
      source,
    }));
    this.stats.setSourceModifiers('character', modifiers);
  }

  /**
   * König Ludwig's purse (#47): the absurd damage is *rented*, and the rent
   * is a Biermarke every `purseDrainTicks`.
   *
   * Running dry is deliberately not a death spiral — it takes the multiplier
   * away and nothing else, so a broke Ludwig is an ordinary fragile
   * character until the next coin rather than a run that is over but still
   * being played. It is also what keeps his flight from trivialising a floor
   * built around obstacles: crossing them costs time, and time is the one
   * thing his purse is denominated in.
   */
  private syncPurseModifiers(): void {
    if (!this.characterPurse) {
      return;
    }
    const multiplier = this.tuning.character.pursePowerMultiplier;
    const solvent = this.biermarkenCount > 0;
    if (solvent === this.lastPurseSolvent && multiplier === this.lastPurseMultiplier) {
      return;
    }
    this.lastPurseSolvent = solvent;
    this.lastPurseMultiplier = multiplier;
    if (!solvent) {
      this.stats.clearSource('character-purse');
      return;
    }
    const source = { kind: 'character' as const, id: 'geldbeutl', label: 'Geldbeutl' };
    this.stats.setSourceModifiers('character-purse', [
      { stat: StatId.Damage, op: 'multiply', value: multiplier, source },
    ]);
  }

  /**
   * The character rule that is a counter rather than an event, advanced once
   * a tick from `step` before anything reads `stats`.
   *
   * A no-op for a character without the rule, which is why `step` calls this
   * unconditionally instead of asking first: the alternative is the frame
   * loop knowing which character it is running, which is exactly what the
   * rule ids exist to avoid.
   */
  private stepCharacter(): void {
    if (this.characterPurse) {
      this.purseTicks += 1;
      const interval = Math.max(1, Math.round(this.tuning.character.purseDrainTicks));
      if (this.purseTicks >= interval) {
        this.purseTicks = 0;
        this.spendBiermarken(1);
      }
      this.syncPurseModifiers();
    }
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
        stat: StatId.Damage,
        op: 'multiply',
        value: tuning.katerDamageMultiplier,
        source,
      },
      {
        stat: StatId.MoveSpeed,
        op: 'multiply',
        value: tuning.katerMoveSpeedMultiplier,
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
   * one place it goes up — beer pickups (#17), a handful of items, and the
   * debug slider (which writes `tuning.promille.current` directly, bypassing
   * this) are the sources today.
   *
   * Inert in a sober run (#85). Beer never drops there and no Promille item
   * is ever offered, so nothing should reach this in the first place — the
   * guard is here because this is the one chokepoint every raise passes
   * through, and "the meter cannot move" is worth being true of the
   * mechanism rather than only of the content that happens to feed it.
   *
   * Crossing the Umgfalln threshold starts the knockdown via
   * `maybeStartUmgfalln` rather than in whatever called this, the same
   * reason `applyPlayerDamage` owns the death check: one chokepoint, so
   * every raise — pickup or otherwise — behaves the same way.
   */
  addPromille(amount: number): void {
    if (amount <= 0 || !this.promilleUnlocked) {
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
    // Flavour text over the literal effect text here — the pedestal/HUD
    // already show the mechanical description before a pickup, so the toast
    // is where the funny line the item roster promises actually gets read.
    this.reportCollected(item.name, item.flavourText || item.description);
    // After `reportCollected`, not before: a set completing on this exact
    // pickup has to force-clear the ordinary toast that call just started,
    // not race it.
    this.syncItemSetModifiers();
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
    this.syncItemSetModifiers();
    if (!stillHeld) {
      item.hooks.onRemove?.({ sim: this, itemId: id, state });
      // A Losbrunnen roll (#218) is the same "exactly the prior state"
      // promise `modifyStats`'s own source gets — losing the last copy
      // clears its rolled bonus too, so picking the item back up later
      // starts from the honest, un-rerolled baseline rather than a stale
      // multiplier surviving the gap.
      this.stats.clearSource(itemRollSourceKey(id));
      // Same promise, for a cooldown roll (#238) — see `activeItemCooldownFactor`.
      this.activeItemCooldownFactor.delete(id);
    }
    return stillHeld;
  }

  /**
   * `active.maxCharge` after a Losbrunnen `cooldown` roll (#238) — read
   * everywhere the authored base used to be read directly (`chargeActiveItem`,
   * `useActiveItem`, `ActiveItemHud`'s charge-bar fill), so a rerolled
   * cooldown actually changes how long the item takes to charge rather than
   * only changing a number nothing looks at. `1` for an item with no
   * `active` at all — never reachable through a real charge bar, but a safe
   * non-zero default rather than a divide-by-zero for a caller that asks
   * anyway.
   */
  effectiveMaxCharge(item: Pick<CompiledItem, 'id' | 'active'>): number {
    const active = item.active;
    if (active === undefined) {
      return 1;
    }
    const factor = this.activeItemCooldownFactor.get(item.id) ?? 1;
    return Math.max(1, Math.round(active.maxCharge * factor));
  }

  /** Adds charge to a held active item, capped at its (possibly rerolled) `maxCharge`. A no-op for an item that is not held or not active. */
  chargeActiveItem(id: string, amount: number): void {
    if (amount <= 0) {
      return;
    }
    const index = this.items.indexOf(id);
    if (index < 0 || !this.inventory.has(index)) {
      return;
    }
    const item = this.items.at(index);
    if (item.active === undefined) {
      return;
    }
    const state = this.inventory.stateOf(index);
    state.charge = Math.min(this.effectiveMaxCharge(item), state.charge + amount);
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
    if (state.charge < this.effectiveMaxCharge(item)) {
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
   * Paints a shot in a named `ProjectileTint` (`sim/projectile/tints.ts`) —
   * the content-safe entry point for the item roster's "every item is
   * visible on the shot it changed" rule, the exact shape `addProjectileTag`
   * takes for a tag. Purely presentational: nothing in `step` reads
   * `ProjectileStore.tint`, so a tint can never move a replay. The last item
   * to tint a shot wins, in `ItemInventory.forEachHeld`'s deterministic id
   * order — good enough for a colour, and the same rule two items writing
   * the same projectile field already live by.
   */
  tintProjectile(projectile: number, tint: ProjectileTintName): void {
    this.projectiles.tint[projectile] = PROJECTILE_TINT_INDEX[tint];
  }

  /**
   * Spawns an ordinary player-team projectile at an explicit origin, run
   * through the same item-hook/tag pipeline `sim/systems/shooting.ts`'s
   * `fire` uses for the shot it spawns directly (#29) — the primitive a
   * multi-shot item (Spezi's second, diverging shot) or a detonation item
   * (Fassldauben's staves) reaches for from its own hook, rather than
   * duplicating `fire`'s muzzle/tag bookkeeping in content. Damage defaults
   * to the resolved Damage; direction is normalised, so a caller handing
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
    const damage = options.damage ?? Math.round(this.stats.value(StatId.Damage));
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
   *
   * Deliberately indiscriminate: this always includes `Enemy`, so an enemy's
   * own bomb (the Böllerschmeißer's lobbed bomb, `sim/systems/enemy.ts`'s
   * `detonateLobbedBomb`) can catch another enemy standing in the blast
   * exactly as a player's splash item would (#260 discussion) — a bomb is
   * "more damaging" than an ordinary shot precisely because it doesn't
   * discriminate who is standing in it, unlike a regular `EnemyProjectile`
   * shot, which already never touches `Enemy` at all
   * (`collision/layers.ts`).
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
   * The burst `applySplashDamage` never draws on its own (#243) — most of
   * its callers already have their own visible cause (a melee swing, a
   * thrown item's own sprite landing) and would double up on an automatic
   * one, so this stays a separate, opt-in call rather than folded into
   * `applySplashDamage` itself. For a detonation with no thrown or planted
   * body of its own to draw — the Böllerschmeißer's lobbed bomb
   * (`sim/systems/enemy.ts`'s `detonateLobbedBomb`) and the player's own
   * item version of the same mechanic (`content/items/boellerschmeisser.ts`)
   * — the damage was the only thing visible at all.
   */
  splashBurst(x: number, y: number, radius: number): void {
    splashBurst(this, x, y, radius);
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
    const role = this.roomSpecialRole;
    // A shop's pedestal is priced, and only stocked on some visits — the roll
    // (deterministic, off `random.items` like the offer itself) happens before
    // the draw so a shop with no item this run also does not consume one.
    if (role === 'shop') {
      if (this.random.items.nextFloat() >= this.tuning.itemPool.shopItemChance) {
        return;
      }
    }
    const offer = selectItemOffer(
      this.items,
      pedestalPoolForRole(role),
      {
        promilleUnlocked: this.promilleUnlocked,
        floor: this.currentFloorValue,
        luck: this.stats.value(StatId.Luck),
        taken: this.takenItemIds,
      },
      this.tuning.itemPool,
      this.random.items,
    );
    this.pedestalList.push({
      x,
      y,
      itemIndex: offer === undefined ? -1 : this.items.indexOf(offer.id),
      price: role === 'shop' ? Math.max(0, Math.round(this.tuning.itemPool.shopItemPrice)) : 0,
    });
  }

  /**
   * A mini-boss's guaranteed miss case (#278): a half-Maß, a Biermarke and a
   * Kellerschlüssel, spread `MINIBOSS_CONSOLATION_SPREAD` apart around
   * `(x, y)` and each nudged clear of a wall by `safeSpawnPoint` on its own.
   * Costs the run nothing to receive and means a mandatory fight always
   * resolves into *something* landing on the floor, never a bare miss —
   * called only when the pedestal roll (`tuning.minibossReward`) misses;
   * the two outcomes never both pay.
   */
  private spawnMinibossConsolationBundle(x: number, y: number): void {
    const spots: readonly [string, number, number][] = [
      ['mass-half', x - MINIBOSS_CONSOLATION_SPREAD, y],
      ['biermarke-5', x + MINIBOSS_CONSOLATION_SPREAD, y],
      ['kellerschluessel', x, y + MINIBOSS_CONSOLATION_SPREAD],
    ];
    for (const [pickupId, spotX, spotY] of spots) {
      const safe = this.safeSpawnPoint(spotX, spotY, this.pickups.get(pickupId).radius);
      this.spawnPickup(pickupId, safe.x, safe.y);
    }
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
   * Where a charged active item's blast will land while its fuse burns, and
   * how far through the fuse it is (0..1) — `null` when nothing is fusing.
   * `EntityView` draws the same hatch disc a lobbed Böller telegraph shows
   * (#12). Set by the item's `onTick`; see `setActiveItemBlast`.
   */
  get activeItemBlastTelegraph(): {
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly progress: number;
  } | null {
    return this.activeItemBlastValue;
  }

  /**
   * Called every fusing tick by an active item that goes off with a radial
   * blast (`content/items/boellerschmeisser.ts`) — the one way
   * `activeItemBlastTelegraph` is armed. Cleared automatically at the top of
   * the next `stepItemTick`, so the item only has to keep calling this while
   * it wants the marker shown.
   */
  setActiveItemBlast(x: number, y: number, radius: number, progress: number): void {
    this.activeItemBlastValue = {
      x,
      y,
      radius,
      progress: Math.max(0, Math.min(1, progress)),
    };
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
   * if the pedestal has no item (already taken, or spawned empty), or if it
   * is a shop's priced pedestal and the player cannot pay `pedestal.price` —
   * the item stays put for another look, same as an unaffordable shop pickup.
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
    if (pedestal.price > 0 && !this.spendBiermarken(pedestal.price)) {
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
    // below, which says the same name and (now) the same flavour line.
    // Showing both at once reads as a UI glitch, not as two separate pieces
    // of news. No hitstop: a pedestal pickup/swap used to freeze the sim for
    // `pickupPauseTicks` while the reveal panel came up, but playtesting
    // found the pause itself read as friction rather than as a beat worth
    // noticing — the panel alone, held up longer, does that job instead.
    this.toastTicks = 0;
    this.pedestalRevealName = item.name;
    this.pedestalRevealDescription = item.flavourText || item.description;
    this.pedestalRevealTicks = Math.round(this.tuning.itemPool.revealHoldTicks);
  }

  /** Whether the player is within `tuning.machine.interactRadius` of this floor's Losbrunnen, if it has spawned. */
  isNearMachine(): boolean {
    const machine = this.machineRuntime;
    if (machine === null) {
      return false;
    }
    const playerX = this.positionX(this.playerIndex);
    const playerY = this.positionY(this.playerIndex);
    const dx = machine.x - playerX;
    const dy = machine.y - playerY;
    const radius = this.tuning.machine.interactRadius;
    return dx * dx + dy * dy <= radius * radius;
  }

  /** The current Losbrunnen, for rendering — `null` off this floor or before it has spawned. */
  get activeMachine(): Readonly<MachineRuntime> | null {
    return this.machineRuntime;
  }

  /**
   * Registry indices of currently held items the Losbrunnen could roll right
   * now — anything whose `modifyStats` hook actually returns something for
   * its current runtime state (`itemEligibleForMachine`). Walked in
   * `heldOrder` (id order, #15), so cycling always lands on the same item in
   * the same position regardless of pickup order.
   */
  private machineEligibleItemIndices(): number[] {
    const indices: number[] = [];
    this.inventory.forEachHeld((index, state) => {
      if (itemEligibleForMachine(this.items.at(index), state)) {
        indices.push(index);
      }
    });
    return indices;
  }

  /** Clamps `machinePreviewItemId` to a real member of `eligible`, defaulting to its first entry. */
  private resolveMachinePreviewIndex(eligible: readonly number[]): number {
    if (this.machinePreviewItemId !== null) {
      const found = eligible.find((index) => this.items.at(index).id === this.machinePreviewItemId);
      if (found !== undefined) {
        return found;
      }
    }
    const first = eligible[0];
    if (first === undefined) {
      throw new RangeError('resolveMachinePreviewIndex needs a non-empty eligible list');
    }
    this.machinePreviewItemId = this.items.at(first).id;
    return first;
  }

  /** Whether the Losbrunnen's item picker is currently open — see `machinePickerOpenValue`. */
  get isMachinePickerOpen(): boolean {
    return this.machinePickerOpenValue;
  }

  /**
   * Whether the Losbrunnen's dialog — item-select, the rolling animation, or
   * the results board — is open at all right now (the UX redesign parked in
   * `docs/DECISIONS.md` #69). Read by `systems/movement.ts`/`shooting.ts`/
   * `bomb-placement.ts` to freeze the player for the dialog's whole
   * duration, and by `systems/pedestal.ts` to keep `use` captured by it
   * rather than letting a coincidentally-nearby pedestal or shop pickup
   * steal the press. `docs/DECISIONS.md` #69 argued a functional freeze
   * bought nothing over ticks-quietly-continuing because every room the
   * machine can appear in is already threat-free — true, and still the
   * reason this stays a narrow input freeze rather than `loop.paused`
   * (which would also stop the dialog's own input from reaching it, since
   * `useMachine` is only ever called from a tick's own input processing);
   * what changed is that the player's own drifting the whole time the
   * dialog is up reads as a bug, not as "nothing else pressing."
   */
  get isMachineDialogOpen(): boolean {
    return this.machinePickerOpenValue || this.machineRollPhase.kind !== 'idle';
  }

  /**
   * Whether a confirmed feed/reroll is actually in flight — `'rolling'` or
   * `'choosing'`, never plain item-select. Narrower than `isMachineDialogOpen`
   * on purpose: `systems/pedestal.ts` uses this one to give `use` outright to
   * the machine mid-roll (nothing existed to interrupt before this redesign,
   * so there is no prior priority-chain behaviour to preserve there), while
   * ordinary item-select stays inside the existing pedestal-first,
   * shop-second, machine-third priority chain exactly as before.
   */
  get isMachineRollActive(): boolean {
    return this.machineRollPhase.kind !== 'idle';
  }

  /** Closes the picker, cancels any roll in progress, and resets the axis-tap edge detector — called whenever the player leaves range or the machine is destroyed underneath the dialog. */
  closeMachinePicker(): void {
    this.machinePickerOpenValue = false;
    this.machineCyclePreviousSign = 0;
    this.machineRollPhase = { kind: 'idle' };
  }

  /**
   * Advances the Losbrunnen's item preview by one, while its picker is open.
   * A no-op once the machine is fed: there is nothing left to cycle, the
   * item is locked (#218's own follow-up: "this machine will only reroll
   * that single item").
   */
  private cycleMachinePreview(direction: 1 | -1): void {
    if (this.machineRuntime === null || this.machineRuntime.itemIndex >= 0) {
      return;
    }
    const eligible = this.machineEligibleItemIndices();
    if (eligible.length === 0) {
      return;
    }
    const current = this.resolveMachinePreviewIndex(eligible);
    const position = eligible.indexOf(current);
    const next = eligible[(position + direction + eligible.length) % eligible.length];
    if (next === undefined) {
      throw new RangeError('cycleMachinePreview needs a non-empty eligible list');
    }
    this.machinePreviewItemId = this.items.at(next).id;
  }

  /**
   * The directional tap for the Losbrunnen's picker, from one tick's move
   * axes. Both of the redesigned picker's panes (#268) are a single vertical
   * column of cards, so up/down is the natural axis and wins when it is the
   * larger push; left/right is kept as an alias for the player who reaches
   * for it. `+1` advances by one card (down, or right), `-1` steps back (up,
   * or left) — `> 0` is downward in this engine's screen-space move axis
   * (`sim/systems/movement.ts`). Zero unless a push clears
   * `MACHINE_AXIS_TAP_THRESHOLD`.
   */
  private machineTapSign(moveX: number, moveY: number): -1 | 0 | 1 {
    const axis = Math.abs(moveY) >= Math.abs(moveX) ? moveY : moveX;
    return axis > MACHINE_AXIS_TAP_THRESHOLD ? 1 : axis < -MACHINE_AXIS_TAP_THRESHOLD ? -1 : 0;
  }

  /**
   * Reads one tick's move axes for a *tap* — a fresh push, not a held
   * direction — and cycles the picker's preview on it. Called every tick by
   * `sim/systems/machine.ts`'s `stepMachine`, regardless of `use`, which is
   * why this needs its own edge detector (`machineCyclePreviousSign`) rather
   * than `previousButtons`: there is no button here, only an axis, and
   * reading it as a level rather than an edge would spin the preview every
   * tick a direction is held instead of once per push.
   */
  private cycleMachinePreviewFromAxis(moveX: number, moveY: number): void {
    const sign = this.machineTapSign(moveX, moveY);
    if (sign !== 0 && sign !== this.machineCyclePreviousSign) {
      this.cycleMachinePreview(sign);
    }
    this.machineCyclePreviousSign = sign;
  }

  /**
   * Moves the results board's current selection by one — the choosing-phase
   * counterpart of `cycleMachinePreview`, same tap-not-hold edge detector
   * (`cycleMachineFromAxis` below never reads both in the same tick, since
   * `machinePickerOpenValue` and a `'choosing'` phase are mutually
   * exclusive). A no-op on the `'unlucky'` outcome — one candidate, nothing
   * to move between.
   */
  private cycleMachineChoice(direction: 1 | -1): void {
    const phase = this.machineRollPhase;
    if (phase.kind !== 'choosing' || phase.outcome !== 'choice') {
      return;
    }
    const count = phase.candidates.length;
    phase.selectedIndex = (phase.selectedIndex + direction + count) % count;
  }

  private cycleMachineChoiceFromAxis(moveX: number, moveY: number): void {
    const sign = this.machineTapSign(moveX, moveY);
    if (sign !== 0 && sign !== this.machineCyclePreviousSign) {
      this.cycleMachineChoice(sign);
    }
    this.machineCyclePreviousSign = sign;
  }

  /**
   * Reads one tick's move axes for a directional *tap* and routes it to
   * whichever of the picker's two browsable moments is actually open right
   * now — item-select (`cycleMachinePreviewFromAxis`) or the results board
   * (`cycleMachineChoiceFromAxis`); neither is ever open at the same time as
   * the other. Both panes are vertical card columns, so up/down drives them
   * (`machineTapSign`), with left/right kept as an alias. Called every tick
   * by `sim/systems/machine.ts`'s `stepMachine`, regardless of `use` — see
   * that function's own doc comment for why this can't just live inside
   * `useMachine`'s button-edge chain.
   */
  cycleMachineFromAxis(moveX: number, moveY: number): void {
    if (this.machinePickerOpenValue) {
      this.cycleMachinePreviewFromAxis(moveX, moveY);
      return;
    }
    if (this.machineRollPhase.kind === 'choosing') {
      this.cycleMachineChoiceFromAxis(moveX, moveY);
      return;
    }
    this.machineCyclePreviousSign = 0;
  }

  /**
   * What the Losbrunnen's prompt should show right now, or `null` out of
   * range / off this floor — same "read once a frame, no rendering here"
   * shape as `shopPreview`. `'empty'` covers both "nothing eligible to feed"
   * and "locked onto an item since lost" — the machine has nothing useful to
   * do in either case. `pickerOpen` only means anything for `'unfed'`: a
   * fresh machine's first `use` opens the picker rather than feeding
   * outright, so the HUD can say "press use to choose" before committing to
   * anything.
   */
  get machinePreview(): {
    readonly state: 'empty' | 'unfed' | 'fed' | 'broken';
    readonly pickerOpen: boolean;
    readonly itemName: string | undefined;
    /** The previewed/locked item's own player-facing blurb — #238's picker menu shows it under the card. `undefined` wherever `itemName` is. */
    readonly itemDescription: string | undefined;
    readonly cost: number;
    readonly affordable: boolean;
    /**
     * Chance the roll a confirming `use` press would make breaks the
     * machine — 0 where no roll is on offer (`'empty'`/`'broken'`). #238:
     * shown so a player always sees the price of the pull they are about
     * to make, never just the result of one they already made.
     */
    readonly breakChance: number;
    readonly lastRollSummary: string | undefined;
  } | null {
    const machine = this.machineRuntime;
    if (machine === null || !this.isNearMachine()) {
      return null;
    }
    if (machine.broken) {
      const brokenItem = machine.itemIndex >= 0 ? this.items.at(machine.itemIndex) : undefined;
      return {
        state: 'broken',
        pickerOpen: false,
        itemName: brokenItem?.name,
        itemDescription: brokenItem?.description,
        cost: 0,
        affordable: false,
        breakChance: 0,
        lastRollSummary: this.machineLastRollSummary,
      };
    }
    if (machine.itemIndex < 0) {
      const eligible = this.machineEligibleItemIndices();
      if (eligible.length === 0) {
        return {
          state: 'empty',
          pickerOpen: false,
          itemName: undefined,
          itemDescription: undefined,
          cost: 0,
          affordable: false,
          breakChance: 0,
          lastRollSummary: undefined,
        };
      }
      const cost = this.tuning.machine.baseCost;
      const breakChance = this.machineBreakChance(machine);
      if (!this.machinePickerOpenValue) {
        return {
          state: 'unfed',
          pickerOpen: false,
          itemName: undefined,
          itemDescription: undefined,
          cost,
          affordable: this.biermarkenCount >= cost,
          breakChance,
          lastRollSummary: undefined,
        };
      }
      const preview = this.items.at(this.resolveMachinePreviewIndex(eligible));
      return {
        state: 'unfed',
        pickerOpen: true,
        itemName: preview.name,
        itemDescription: preview.description,
        cost,
        affordable: this.biermarkenCount >= cost,
        breakChance,
        lastRollSummary: undefined,
      };
    }
    if (!this.inventory.has(machine.itemIndex)) {
      const lostItem = this.items.at(machine.itemIndex);
      return {
        state: 'empty',
        pickerOpen: false,
        itemName: lostItem.name,
        itemDescription: lostItem.description,
        cost: 0,
        affordable: false,
        breakChance: 0,
        lastRollSummary: this.machineLastRollSummary,
      };
    }
    const item = this.items.at(machine.itemIndex);
    const cost = this.tuning.machine.baseCost + machine.rolls * this.tuning.machine.costIncrement;
    return {
      state: 'fed',
      pickerOpen: false,
      itemName: item.name,
      itemDescription: item.description,
      cost,
      affordable: this.biermarkenCount >= cost,
      breakChance: this.machineBreakChance(machine),
      lastRollSummary: this.machineLastRollSummary,
    };
  }

  /**
   * Every item the Losbrunnen's picker could feed right now, for the real
   * choose-an-item menu (#238) — `null` whenever `machinePreview` isn't in
   * its `'unfed'`-with-`pickerOpen` state, which is the only moment there is
   * a *set* of items to lay out as cards rather than a single locked-in one.
   * Ordered the same stable id order `machineEligibleItemIndices` already
   * walks in, so the grid never reshuffles between frames on its own.
   */
  get machineChoices():
    | readonly {
        readonly id: string;
        readonly name: string;
        readonly description: string;
        readonly selected: boolean;
      }[]
    | null {
    const machine = this.machineRuntime;
    if (
      machine === null ||
      machine.broken ||
      machine.itemIndex >= 0 ||
      !this.machinePickerOpenValue ||
      !this.isNearMachine()
    ) {
      return null;
    }
    const eligible = this.machineEligibleItemIndices();
    if (eligible.length === 0) {
      return null;
    }
    const selectedIndex = this.resolveMachinePreviewIndex(eligible);
    return eligible.map((index) => {
      const item = this.items.at(index);
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        selected: index === selectedIndex,
      };
    });
  }

  /**
   * The picker's rolling/results state, for the redesigned two-pane screen
   * (`render/machine-picker.ts`) — `null` whenever nothing has been rolled
   * yet (still on item-select, or idly `'fed'` waiting for the next press).
   * `'rolling'`'s `progress` is `0` at the first ticking tick and `1` on the
   * last — purely for the anticipation bar's fill, never read for anything
   * that has to be deterministic. `'choosing'`'s candidates carry no item
   * name (the left pane already shows it) and are pre-formatted text
   * (`machineRollCardLabel`) rather than raw tier/stat data, the same
   * "screen reads state, main.ts/sim own the words" split `machineHudLabel`
   * already keeps.
   */
  get machineRollDisplay():
    | { readonly phase: 'rolling'; readonly progress: number }
    | {
        readonly phase: 'choosing';
        readonly candidates: readonly {
          readonly tier: MachineRollTier;
          readonly label: string;
          readonly selected: boolean;
        }[];
      }
    | null {
    const phase = this.machineRollPhase;
    if (phase.kind === 'rolling') {
      const total = Math.max(1, Math.round(this.tuning.machine.rollAnimationTicks));
      return { phase: 'rolling', progress: Math.min(1, 1 - (phase.ticksRemaining - 1) / total) };
    }
    if (phase.kind === 'choosing') {
      return {
        phase: 'choosing',
        candidates: phase.candidates.map((candidate, index) => ({
          tier: candidate.tier,
          label: machineRollCardLabel(candidate.result),
          selected: index === phase.selectedIndex,
        })),
      };
    }
    return null;
  }

  /**
   * `use` near the Losbrunnen (`sim/systems/pedestal.ts`'s priority chain) —
   * the machine's *only* interaction button (`machinePickerOpenValue`'s doc
   * comment on why Bomb was rejected for cycling). What one press does
   * depends on where the dialog already is: a fresh machine opens its
   * picker; an open picker spends the cost and starts a roll for whatever
   * item is currently previewed; an already-fed, unbroken machine's press
   * starts a roll outright, since there is nothing left to choose there; a
   * roll still `'rolling'` ignores the press (the anticipation beat isn't
   * skippable); and a `'choosing'` press confirms whichever candidate is
   * currently selected (`confirmMachineRollChoice`). A no-op whenever
   * nothing eligible exists, the machine is broken, or the player can't
   * afford the cost — nothing is spent on a press that can't do anything.
   */
  useMachine(): void {
    const machine = this.machineRuntime;
    if (machine === null || machine.broken || !this.isNearMachine()) {
      return;
    }
    if (this.machineRollPhase.kind === 'choosing') {
      this.confirmMachineRollChoice(machine);
      return;
    }
    if (this.machineRollPhase.kind === 'rolling') {
      return;
    }
    if (machine.itemIndex < 0) {
      const eligible = this.machineEligibleItemIndices();
      if (eligible.length === 0) {
        return;
      }
      if (!this.machinePickerOpenValue) {
        this.machinePickerOpenValue = true;
        this.machineCyclePreviousSign = 0;
        this.resolveMachinePreviewIndex(eligible);
        return;
      }
      const chosen = this.resolveMachinePreviewIndex(eligible);
      if (!this.spendBiermarken(this.tuning.machine.baseCost)) {
        return;
      }
      machine.itemIndex = chosen;
      this.closeMachinePicker();
      this.startMachineRoll();
      return;
    }
    if (!this.inventory.has(machine.itemIndex)) {
      return;
    }
    const cost = this.tuning.machine.baseCost + machine.rolls * this.tuning.machine.costIncrement;
    if (!this.spendBiermarken(cost)) {
      return;
    }
    this.startMachineRoll();
  }

  /**
   * Breaks the current floor's Losbrunnen if a detonation at `(x, y)` landed
   * within `radius` of it — `sim/systems/bombs.ts`'s `explode`, on every
   * Bierfassl blast regardless of what set it off. The one way to destroy
   * the machine outright rather than merely risking a bad roll — a real
   * cost for planting a bomb carelessly near it, never a side effect of
   * ordinary browsing (`machinePickerOpenValue`'s doc comment).
   */
  breakMachineFromBlast(x: number, y: number, radius: number): void {
    const machine = this.machineRuntime;
    if (machine === null || machine.broken) {
      return;
    }
    const dx = machine.x - x;
    const dy = machine.y - y;
    if (dx * dx + dy * dy > radius * radius) {
      return;
    }
    machine.broken = true;
    this.closeMachinePicker();
    this.reportCollected('Losbrunnen', 'Blown apart.');
  }

  /**
   * Starts the picker's anticipation beat (`MachineTuning.rollAnimationTicks`)
   * for a feed/reroll that was just paid for. Nothing about the roll itself
   * — break, tier, which candidates — is decided yet; that all happens
   * deterministically in `resolveMachineRoll`, on the tick the countdown
   * reaches zero (`advanceMachineRoll`), so the delay is pure presentation
   * and a replay reproduces the same outcome regardless of its length.
   */
  private startMachineRoll(): void {
    this.machineRollPhase = {
      kind: 'rolling',
      ticksRemaining: Math.max(1, Math.round(this.tuning.machine.rollAnimationTicks)),
    };
  }

  /**
   * Ticks down the `'rolling'` anticipation beat, called every tick by
   * `sim/systems/machine.ts`'s `stepMachine` regardless of input — a no-op
   * whenever nothing is actually rolling. Resolves the roll itself
   * (`resolveMachineRoll`) the instant the countdown reaches zero.
   */
  advanceMachineRoll(): void {
    const machine = this.machineRuntime;
    const phase = this.machineRollPhase;
    if (machine === null || phase.kind !== 'rolling') {
      return;
    }
    if (phase.ticksRemaining > 1) {
      this.machineRollPhase = { kind: 'rolling', ticksRemaining: phase.ticksRemaining - 1 };
      return;
    }
    this.resolveMachineRoll(machine);
  }

  /**
   * What a confirmed feed/reroll actually lands on, resolved the instant the
   * `'rolling'` countdown reaches zero (#238's picker redesign,
   * `docs/DECISIONS.md` #69's own parked follow-up). The break chance this
   * roll is gambling on (`machineBreakChance`, read before `rolls`
   * increments — the same "count of rolls already made" the cost
   * calculation elsewhere uses) is rolled *first* and *pre-empts*
   * everything else: on a break, no candidate is ever generated or
   * shown — the dialog simply has nothing left to offer, closes, and the
   * machine is broken from here on. Only once the machine survives that
   * gamble does `rollMachineOutcome` decide whether this pull is the
   * bad-luck one (a single `unlucky` candidate) or a real choice between
   * three favourable/neutral ones, and the phase moves to `'choosing'` for
   * the player to pick from.
   */
  private resolveMachineRoll(machine: MachineRuntime): void {
    const item = this.items.at(machine.itemIndex);
    const breakChance = this.machineBreakChance(machine);
    machine.rolls += 1;
    if (this.random.items.chance(breakChance)) {
      machine.broken = true;
      this.machineRollPhase = { kind: 'idle' };
      this.machineLastRollSummary = `${item.name}: the Losbrunnen broke!`;
      this.reportCollected('Losbrunnen', this.machineLastRollSummary);
      return;
    }
    const state = this.inventory.stateOf(machine.itemIndex);
    const outcome = rollMachineOutcome(
      item,
      state,
      this.stats.value(StatId.Luck),
      this.tuning.machine,
      this.random.items,
    );
    this.machineRollPhase = {
      kind: 'choosing',
      outcome: outcome.kind,
      candidates: outcome.candidates,
      selectedIndex: 0,
    };
  }

  /** `useMachine`'s confirm press while `machineRollPhase.kind === 'choosing'` — applies whichever candidate is currently selected and closes the dialog back to the machine's ordinary `'fed'` idle. */
  private confirmMachineRollChoice(machine: MachineRuntime): void {
    const phase = this.machineRollPhase;
    if (phase.kind !== 'choosing') {
      return;
    }
    const chosen = phase.candidates[phase.selectedIndex];
    this.machineRollPhase = { kind: 'idle' };
    if (chosen === undefined) {
      return;
    }
    this.applyMachineRollResult(machine, chosen.result);
  }

  /**
   * Registers a chosen roll's delta — under `itemRollSourceKey` for a stat
   * target, or into `activeItemCooldownFactor` for a `cooldown` one (#238)
   * — replacing whatever the item's previous roll of *that same kind* was,
   * never stacking with it, which is what makes "reroll" mean reroll rather
   * than accumulate. A hybrid item's other kind of roll (if it has one
   * already registered) is untouched either way, since this roll never
   * targeted it.
   */
  private applyMachineRollResult(machine: MachineRuntime, result: MachineRollResult): void {
    const item = this.items.at(machine.itemIndex);
    if (result.rolled?.kind === 'cooldown') {
      if (result.cooldownFactor !== undefined) {
        this.activeItemCooldownFactor.set(item.id, result.cooldownFactor);
      }
    } else {
      const key = itemRollSourceKey(item.id);
      if (result.modifiers.length === 0) {
        this.stats.clearSource(key);
      } else {
        const source = { kind: 'item' as const, id: item.id, label: `${item.name} (Losbrunnen)` };
        this.stats.setSourceModifiers(
          key,
          result.modifiers.map((modifier) => ({ ...modifier, source })),
        );
      }
    }
    this.machineLastRollSummary = describeMachineRoll(item.name, result);
    this.reportCollected('Losbrunnen', this.machineLastRollSummary);
  }

  /**
   * Chance the machine's *next* roll breaks it (#238) — `breakChance` plus
   * `breakChanceIncrement` per roll already made, clamped to 1 — the same
   * "escalating and visible, not a flat hidden number" the field's own doc
   * comment asks for. Read here right before the gamble happens, and by
   * `machinePreview` so the HUD can show it before the player commits.
   */
  private machineBreakChance(machine: Readonly<MachineRuntime>): number {
    return Math.min(
      1,
      this.tuning.machine.breakChance + machine.rolls * this.tuning.machine.breakChanceIncrement,
    );
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

  /**
   * Rechecks every item set's completion (#137) — every member held at
   * once — and folds the set's `bonus` into the stat pipeline the instant
   * it becomes true, clearing it the instant it stops being true. Called
   * from `pickUpItem`/`removeItem`, the same two places `ItemInventory`
   * itself reacts to a stack starting or ending.
   *
   * A newly-completed set fires the reveal panel and — the same
   * "the bigger notification wins" precedent `takePedestalItem` sets for its
   * own reveal over the ordinary pickup toast — force-clears whichever
   * ordinary toast or pedestal reveal was already showing, so a set's third
   * piece landing never reads as two things happening at once.
   */
  private syncItemSetModifiers(): void {
    for (const set of this.itemSets.all) {
      const complete = set.memberIndices.every((index) => this.inventory.has(index));
      const wasComplete = this.completedSetIds.has(set.id);
      if (complete === wasComplete) {
        continue;
      }
      const key = setStatSourceKey(set.id);
      if (complete) {
        this.completedSetIds.add(set.id);
        const source = { kind: 'set' as const, id: set.id, label: set.name };
        const modifiers: StatModifier[] = set.bonus.map((modifier) => ({ ...modifier, source }));
        if (modifiers.length > 0) {
          this.stats.setSourceModifiers(key, modifiers);
        }
        this.setRevealName = set.name;
        this.setRevealDescription = `The full ${set.name} set — every piece is doing more together.`;
        this.setRevealTicks = Math.round(this.tuning.itemPool.revealHoldTicks);
        this.toastTicks = 0;
        this.pedestalRevealTicks = 0;
      } else {
        this.completedSetIds.delete(set.id);
        this.stats.clearSource(key);
      }
    }
  }

  /**
   * The set-completion notification, or `null` once it has aged out — same
   * "return null past its ticks" shape as `pickupToast`/`pedestalReveal`.
   */
  get setCompletionReveal(): { readonly name: string; readonly description: string } | null {
    if (this.setRevealTicks <= 0) {
      return null;
    }
    return { name: this.setRevealName, description: this.setRevealDescription };
  }

  /** Whether `id` (an `ItemSetDefinition.id`) is currently complete — every member held at once. */
  hasCompletedSet(id: string): boolean {
    return this.completedSetIds.has(id);
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
   * Freezes the simulation for up to `ticks`, before `hitstopScale`.
   *
   * The longest request wins rather than the sum: two enemies dying on the same
   * tick should feel like one big hit, not like the game stalling twice — and
   * comparing the two *scaled* ticks (rather than scaling once at the end)
   * keeps that true regardless of `hitstopScale`, the same way it was already
   * true before this scale existed.
   */
  requestHitstop(ticks: number): void {
    const scaled = Math.round(ticks * this.hitstopScale);
    if (scaled > this.hitstopTicks) {
      this.hitstopTicks = scaled;
    }
  }

  /**
   * Staggers one body for up to `ticks` — see `hitStun`'s doc comment for why
   * this exists instead of another `requestHitstop` call. The longest request
   * wins, same reasoning as `requestHitstop`: a body already reeling from one
   * hit does not get a second, shorter stagger layered under it.
   */
  requestHitStun(index: number, ticks: number): void {
    const current = this.hitStun.data[index] ?? 0;
    if (ticks > current) {
      this.hitStun.data[index] = ticks;
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
    const definitionIndex = this.enemy.data[index * ENEMY_STRIDE] ?? -1;
    const wasEnemy = enemyMasked && this.enemies.at(definitionIndex).locksRoom;
    // Same "read before flush clears it" reasoning as `wasEnemy` above, kept
    // for `enemyIdAt` — `world.flush()` (end of `step()`) frees this slot
    // before `app/audio/impact.ts`'s `playImpactAudio` ever gets to read it,
    // so the Death event's own audio cue has nothing left to look up by the
    // time it runs. Stashed here, at the one moment the slot still reliably
    // names what died.
    if (enemyMasked && definitionIndex >= 0) {
      this.deathEnemyIdByIndex.set(index, this.enemies.at(definitionIndex).id);
    }
    const random = this.random.cosmetic;
    this.decals.spawn(
      this.positionX(index),
      this.positionY(index),
      // Smaller than the body that left it. A splash wider than the thing that
      // died reads as the floor having been painted rather than as a corpse.
      // Off the hurtbox rather than the footprint (#73): "the body that left
      // it" is the drawing, and sizing a decal to the small floor circle would
      // shrink every splash in the game by a third for a reason that is about
      // where a body is collided, not how big it looked.
      hurtboxRadiusOf(this.hurtbox.data[index * 2] ?? 0, this.body.data[index * 2] ?? 8) *
        (0.7 + random.nextFloat() * 0.4),
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
   * uses — flash, knockback, shake, foam, its own loot and, notably,
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

  /**
   * Removes a destructible prop the way something *picking it up* would — no
   * splash, no loot, no death event, nothing for `splitOnDeath` or the loot
   * table to react to.
   *
   * The Maibaum-Dieb grabbing the arena maypole (#199, `grabProp`). A maypole
   * taken this way latches `maypoleStolen`, which is what lets `MaibaumView`
   * switch the same sprite from a planted prop to the pole in his hands.
   */
  consumeProp(index: number): void {
    const wasMaypole =
      ((this.world.masks[index] ?? 0) & this.propKind.bit) !== 0 &&
      (this.propKind.data[index] ?? 0) === propKindIndex('maypole');
    if (this.world.destroy(this.world.entityAt(index)) && wasMaypole) {
      this.maypoleTaken = true;
    }
  }

  /**
   * True once the arena maypole has been picked up by the Maibaum-Dieb this
   * room (#199). Render-only — `MaibaumView` reads it to draw the pole in his
   * hands instead of standing in the arena. Reset on every room load.
   */
  get maypoleStolen(): boolean {
    return this.maypoleTaken;
  }

  step(input: Readonly<InputFrame> = this.idleInput): void {
    this.events.clear();
    this.deathEnemyIdByIndex.clear();

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
    // The character's own per-tick rules (#47) — Ludwig's purse — settled
    // here for the same reason Promille is: movement and shooting both read
    // the stats they change, later in this same tick.
    this.stepCharacter();
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
    // The Losbrunnen's own per-tick upkeep (#218) — closing its picker on
    // distance and reading an axis tap to cycle it, neither of which is a
    // button edge `stepPedestal`'s chain above already resolved `use` for
    // this tick. See `stepMachine`'s own doc comment for why this can't
    // just live inside that chain.
    stepMachine(this, input);
    // Enemies decide after the player has moved and before bodies integrate, so
    // a body moves on the same tick as the decision that moved it.
    stepEnemies(this);
    // A `summon` wave that came due inside `stepEnemies` is spawned here, out
    // of that loop — `spawnEnemyKind` can grow the world (#276).
    stepEnemySummons(this);
    // The same for a `dropProp` bale Der Ladewagen shed this tick (#277):
    // `spawnTarget` grows the world exactly as `spawnEnemyKind` does.
    stepEnemyPropDrops(this);
    // Before `stepBodies`, deliberately: `freezing` (#27) scales velocity
    // down, and that only slows this tick's movement if it runs before the
    // integration that reads velocity. Burn/poison damage has no such
    // ordering requirement — it rides along here rather than earning a
    // second call site.
    stepStatusEffects(this);
    // A curse's per-tick effect (Föhn's wind, Sperrstunde's timer and
    // harassment) — after status effects so an Ordner poison application
    // this tick is picked up by the very next `stepStatusEffects` call
    // rather than sitting unaged for a whole extra tick.
    stepCurse(this);
    stepBodies(this);
    // After `stepBodies`, so a corpse-touch check reads this tick's actual
    // movement rather than last tick's position.
    stepBlutwurz(this);
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
      const rewardLocations: { x: number; y: number }[] = [];
      const loot = this.rollRoomClearLoot();
      if (loot !== null) {
        rewardLocations.push(loot);
      }
      dispatchItemRoomClear(this);
      // The boss's own reward pedestal (`pendingBossPedestals`'s doc
      // comment) — held back until this exact tick rather than spawned the
      // moment the room loaded, so it is not already sitting there during
      // the fight. Spawned before `announceRoomClear` so its location can
      // join `rewardLocations` too.
      for (const pending of this.pendingBossPedestals) {
        this.spawnPedestal(pending.x, pending.y);
        rewardLocations.push({ x: pending.x, y: pending.y });
      }
      this.pendingBossPedestals = [];
      // Der Meisterschlüssel (#275) drops on the same held-until-clear tick,
      // for the same reason: the key that opens the boss door is the mini-
      // boss room's whole reward, and it should not be collectable before
      // the fight it is the reward for is over. And its own pedestal roll
      // (#278) resolves here too — both read `isFirstMiniboss` off
      // `minibossKeyGrantedThisFloor` before setting it, so whichever
      // mini-boss room the player reaches first this floor is the one that
      // pays the guaranteed key and the higher item odds; a second,
      // different mini-boss room (XL floors only, #271) drops no key at all
      // and rolls the lower odds.
      if (this.pendingMinibossKey !== null || this.pendingMinibossPedestal !== null) {
        const isFirstMiniboss = !this.minibossKeyGrantedThisFloor;
        this.minibossKeyGrantedThisFloor = true;
        if (this.pendingMinibossKey !== null) {
          if (isFirstMiniboss) {
            const spot = this.safeSpawnPoint(
              this.pendingMinibossKey.x,
              this.pendingMinibossKey.y,
              this.pickups.get('meisterschluessel').radius,
            );
            this.spawnPickup('meisterschluessel', spot.x, spot.y);
            rewardLocations.push({ x: spot.x, y: spot.y });
          }
          this.pendingMinibossKey = null;
        }
        if (this.pendingMinibossPedestal !== null) {
          const pending = this.pendingMinibossPedestal;
          const itemChance = isFirstMiniboss
            ? this.tuning.minibossReward.firstItemChance
            : this.tuning.minibossReward.secondItemChance;
          if (this.random.items.chance(itemChance)) {
            this.spawnPedestal(pending.x, pending.y);
          } else {
            // The miss case still pays — a compulsory fight that hands back
            // nothing is a tax (#278's own framing).
            this.spawnMinibossConsolationBundle(pending.x, pending.y);
          }
          rewardLocations.push({ x: pending.x, y: pending.y });
          this.pendingMinibossPedestal = null;
        }
      }
      // Der Losbrunnen (#218) waits for the same tick — appearing mid-fight
      // would read as loot sitting out during a boss that hasn't dropped
      // anything yet.
      if (this.pendingBossLosbrunnen !== null) {
        const spot = this.pendingBossLosbrunnen;
        this.machineRuntime = { x: spot.x, y: spot.y, itemIndex: -1, rolls: 0, broken: false };
        rewardLocations.push({ x: spot.x, y: spot.y });
        this.pendingBossLosbrunnen = null;
      }
      // Promille arriving mid-run (#236). Rolled after every other reward on
      // this tick so the first Maß lands *on top of* the boss's own payout
      // rather than instead of it, and so the drops above still roll the
      // `sober` half of their tables — the run was sober right up until this
      // line.
      if (this.roomSpecialRole === 'boss') {
        const unlockSpot = this.maybeUnlockPromille();
        if (unlockSpot !== null) {
          rewardLocations.push(unlockSpot);
        }
      }
      // The single most repeated success moment in the game, and until #153 it
      // had no celebration at all. A ring at each reward that actually
      // appeared, and a puff at each door that just unlocked — the
      // celebration points at the thing that actually changed, which is what
      // keeps it honest when it is switched off.
      this.announceRoomClear(rewardLocations);
    }
    if (this.roomTemplateLoaded && this.roomEnemyCount === 0) {
      this.roomClearedIds.add(this.roomId);
    }
    // Every held item's onTick, once this tick's outcomes (hits, kills, the
    // room-clear check above) have all already happened — an item reacting
    // to "this tick" sees the whole of it, not a partial slice. The active
    // item's blast telegraph (#12) is cleared first, so an item that is no
    // longer fusing stops re-arming it and it disappears.
    this.activeItemBlastValue = null;
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
    const hitStun = this.hitStun.data;
    const highWater = this.world.highWater;
    for (let index = 0; index < highWater; index++) {
      // Read before either ages this tick: a body still staggered holds its
      // white flash right up to the moment it recovers, the local echo of
      // what a global freeze used to give every flash for free.
      const stun = hitStun[index] ?? 0;

      const ticks = flash[index] ?? 0;
      if (ticks > 0 && stun === 0) {
        flash[index] = ticks - 1;
      }
      const bounce = spawnBounce[index] ?? 0;
      if (bounce > 0) {
        spawnBounce[index] = bounce - 1;
      }
      if (stun > 0) {
        hitStun[index] = stun - 1;
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
    if (this.promilleUnlockAnnounceTicks > 0) {
      this.promilleUnlockAnnounceTicks -= 1;
    }
    if (this.curseAnnounceTicks > 0) {
      this.curseAnnounceTicks -= 1;
    }
    if (this.setRevealTicks > 0) {
      this.setRevealTicks -= 1;
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
    const ring = this.ringSearchClearPoint(centreX, centreY, radius);
    if (ring !== null) {
      return ring;
    }
    // Every ring blocked is not a case any authored room should produce
    // (`tests/content/rooms.test.ts` compiles every template), so this is
    // the same "place it anyway rather than not spawn at all" fallback
    // `safeSpawnPoint` uses.
    return { x: centreX, y: centreY };
  }

  /**
   * Spirals outward from `(originX, originY)` in rings, returning the first
   * clear point found, or `null` if every ring out to the room's own extent
   * is blocked. Shared by `findPlayerSpawnPoint` (spiralling from the room
   * centre) and `safeSpawnPoint` (spiralling from whatever point was asked
   * for) — both need "walk off this block" rather than "nudge toward a fixed
   * point that might be the block itself".
   */
  private ringSearchClearPoint(
    originX: number,
    originY: number,
    radius: number,
  ): { x: number; y: number } | null {
    const ringStep = 8;
    const samplesPerRing = 12;
    const maxRadius = Math.max(this.room.maxX - this.room.minX, this.room.maxY - this.room.minY);
    for (let ringRadius = ringStep; ringRadius <= maxRadius; ringRadius += ringStep) {
      for (let sample = 0; sample < samplesPerRing; sample++) {
        const angle = (sample / samplesPerRing) * Math.PI * 2;
        const x = originX + Math.cos(angle) * ringRadius;
        const y = originY + Math.sin(angle) * ringRadius;
        if (this.room.isClear(x, y, radius)) {
          return { x, y };
        }
      }
    }
    return null;
  }

  private spawnPlayer(): Entity {
    const entity = this.world.create();
    this.world.add(entity, this.transform);
    this.world.add(entity, this.velocity);
    this.world.add(entity, this.body);
    this.world.add(entity, this.hurtbox);
    this.world.add(entity, this.push);
    this.world.add(entity, this.collision);
    this.world.add(entity, this.health);
    this.world.add(entity, this.contactDamage);
    this.world.add(entity, this.flash);

    const index = entityIndex(entity);
    const spawnPoint = this.findPlayerSpawnPoint(PLAYER_FOOTPRINT);
    const startX = spawnPoint.x;
    const startY = spawnPoint.y;
    const transform = this.transform.data;
    transform[index * 4] = startX;
    transform[index * 4 + 1] = startY;
    transform[index * 4 + 2] = startX;
    transform[index * 4 + 3] = startY;

    const body = this.body.data;
    body[index * 2] = PLAYER_FOOTPRINT;
    body[index * 2 + 1] = 1;

    // The one hurtbox in the game that is not the size of its drawing — see
    // `PLAYER_FOOTPRINT`. Lifted by the same amount as everything else, so it
    // sits over his body rather than around his boots.
    const hurtbox = this.hurtbox.data;
    hurtbox[index * 2] = PLAYER_FOOTPRINT;
    hurtbox[index * 2 + 1] = hurtboxOffsetY(PLAYER_RADIUS, PLAYER_FOOTPRINT);

    // The character's own pool (#47), not the engine's default: Resi walks in
    // on four Maß and D'Sennerin on five, and `PLAYER_HEALTH` is what
    // `NEUTRAL_TRAITS` — Alois — carries.
    const health = this.health.data;
    const maxHealth = Math.max(1, Math.round(this.character.maxHealth));
    health[index * 2] = maxHealth;
    health[index * 2 + 1] = maxHealth;
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
    this.spawnPickup('mass-full', midX + 30, midY - 30);
    this.spawnPickup('mass-full', this.room.minX + 100, this.room.maxY - 30);
    this.spawnPickup('mass-full', this.room.maxX - 100, this.room.minY + 40);
    this.spawnPickup('mass-full', this.room.minX + 50, midY + 10);
    // A dozen total, well past PROMILLE_MAX even accounting for decay and
    // travel time between them — a full "beer crawl" across the room lets a
    // playtester walk every tier, including Umgfalln, in one lap rather than
    // reaching only partway up Beduselt. Dev/testing convenience; the real
    // drop table is #22.
    this.spawnPickup('mass-full', this.room.minX + 20, midY - 30);
    this.spawnPickup('mass-full', this.room.minX + 90, this.room.minY + 30);
    this.spawnPickup('mass-full', midX - 10, this.room.maxY - 20);
    this.spawnPickup('mass-full', this.room.maxX - 110, midY + 45);
    this.spawnPickup('mass-full', this.room.maxX - 55, this.room.minY + 10);
    this.spawnPickup('mass-full', this.room.maxX - 20, this.room.maxY - 20);
    this.spawnPickup('mass-full', midX + 20, this.room.maxY - 40);
    this.spawnPickup('mass-full', midX - 30, this.room.minY + 20);
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
    body[index * 2] = profile.footprint;
    body[index * 2 + 1] = profile.mass;
    this.hurtbox.data[index * 2 + 1] = hurtboxOffsetY(profile.radius, profile.footprint);

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
   *
   * `healthOverride` replaces `definition`'s own authored `health` outright —
   * `splitOnDeath.healthWithoutProp` (#260) is the one caller that passes it,
   * for a child spawned without the prop its fight was meant to hinge on.
   * Never combined with `elite`: a split child is never rolled as one.
   */
  spawnEnemyKind(
    definition: number,
    x: number,
    y: number,
    elite = false,
    healthOverride?: number,
  ): Entity {
    const compiled = this.enemies.at(definition);
    const sizeMultiplier = elite ? this.tuning.enemy.eliteRadiusMultiplier : 1;
    const entity = this.spawnTarget(x, y, compiled.radius * sizeMultiplier);
    const index = entityIndex(entity);

    this.world.add(entity, this.enemy);
    this.world.add(entity, this.enemyMotion);

    const body = this.body.data;
    // Elite (#156) scales the footprint by the same multiplier `spawnTarget`
    // above already scaled the drawn radius by: a bigger body stands on more
    // floor, and the two circles staying in proportion is what keeps its
    // sprite standing on its own collider rather than floating over it.
    const eliteRadius = compiled.radius * sizeMultiplier;
    const eliteFootprint = compiled.footprint * sizeMultiplier;
    body[index * 2] = eliteFootprint;
    body[index * 2 + 1] = compiled.mass * sizeMultiplier;
    this.hurtbox.data[index * 2 + 1] = hurtboxOffsetY(eliteRadius, eliteFootprint);

    const health = this.health.data;
    const maxHealth =
      healthOverride ??
      (elite
        ? Math.round(compiled.health * this.tuning.enemy.eliteHealthMultiplier)
        : compiled.health);
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

  spawnTarget(
    x: number,
    y: number,
    radius: number = TARGET_RADIUS,
    propKind = 0,
    health: number = TARGET_HEALTH,
    mass = 3,
  ): Entity {
    const entity = this.world.create();
    this.world.add(entity, this.transform);
    this.world.add(entity, this.velocity);
    this.world.add(entity, this.body);
    this.world.add(entity, this.hurtbox);
    this.world.add(entity, this.push);
    this.world.add(entity, this.collision);
    this.world.add(entity, this.health);
    this.world.add(entity, this.contactDamage);
    this.world.add(entity, this.flash);
    this.world.add(entity, this.propKind);
    this.world.add(entity, this.spawnPost);

    const index = entityIndex(entity);
    const transform = this.transform.data;
    transform[index * 4] = x;
    transform[index * 4 + 1] = y;
    transform[index * 4 + 2] = x;
    transform[index * 4 + 3] = y;

    // Written rather than assumed clear, same as `contactDamage` below: an
    // entity slot is recycled, and a barrel inheriting the last occupant's
    // prop kind would draw as a Maibaum.
    this.propKind.data[index] = propKind;

    // `radius` is the *drawn* body — every caller passes a size class's
    // `radius`, a barrel's, the maypole's — so the hurtbox keeps it exactly and
    // the footprint is the smaller circle derived from it (#73). A caller that
    // knows better overwrites `body` afterwards, which is what `spawnEnemy` and
    // `spawnEnemyKind` do with their class's authored footprint.
    const body = this.body.data;
    body[index * 2] = footprintRadius(radius);
    body[index * 2 + 1] = mass;

    const hurtbox = this.hurtbox.data;
    hurtbox[index * 2] = radius;
    hurtbox[index * 2 + 1] = hurtboxOffsetY(radius, footprintRadius(radius));

    const healthData = this.health.data;
    healthData[index * 2] = health;
    healthData[index * 2 + 1] = health;

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
   *
   * `announce` gates the spawn-bounce pop: `true` for a pickup that is
   * genuinely appearing for the first time (a drop, an authored
   * `pickupSpawns` entry), `false` for one that already existed and is only
   * being re-materialised — `restoreOrSpawnRoomLoot` re-entering a room whose
   * loot snapshot was captured on a previous visit. Without this, walking
   * back into a room the player already looted at (nothing new dropped) pops
   * every leftover pickup on the floor as if it had just spawned.
   */
  spawnPickup(kindId: string, x: number, y: number, price?: number, announce = true): Entity {
    const definitionIndex = this.pickups.indexOf(kindId);
    if (definitionIndex < 0) {
      throw new Error(`Unknown pickup kind "${kindId}"`);
    }
    const definition = this.pickups.at(definitionIndex);
    const priced = price !== undefined && price > 0;

    const entity = this.world.create();
    this.world.add(entity, this.transform);
    this.world.add(entity, this.body);
    this.world.add(entity, this.hurtbox);
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

    // Not split into two circles (#73), deliberately: a dropped Maß lies *on*
    // the floor, nothing shoots it, and its radius is grab reach — the one
    // number a player feels about it. Shrinking that to a footprint would make
    // every pickup fiddlier to walk over for no gain in how anything reads.
    const body = this.body.data;
    body[index * 2] = definition.radius;
    body[index * 2 + 1] = 1;
    this.hurtbox.data[index * 2] = definition.radius;
    this.hurtbox.data[index * 2 + 1] = 0;

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
    // spawn, and nothing else in the simulation looks at it. Skipped for a
    // restored pickup (`announce = false`): it was already on the floor, not
    // something that just appeared.
    this.spawnBounce.data[index] = announce ? Math.round(this.tuning.pickup.spawnBounceTicks) : 0;
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
    this.world.add(entity, this.hurtbox);
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
    body[index * 2] = footprintRadius(BOMB_RADIUS);
    body[index * 2 + 1] = 4;
    this.hurtbox.data[index * 2] = BOMB_RADIUS;
    this.hurtbox.data[index * 2 + 1] = hurtboxOffsetY(BOMB_RADIUS, footprintRadius(BOMB_RADIUS));

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
   * A few discrete steps toward the centre first, since a room is usually
   * small enough that "closer to the middle" reliably finds daylight cheaply.
   * That nudge is a no-op when `(x, y)` already *is* the centre — exactly
   * what `rollRoomClearLoot` asks for — so a ring search spiralling out from
   * the requested point (the same fallback `findPlayerSpawnPoint` uses)
   * backs it up before this gives up and places it exactly where asked (same
   * as `splitFromEvent`'s corpse fallback in `systems/enemy.ts`), a better
   * failure than not spawning it.
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
    const ring = this.ringSearchClearPoint(x, y, radius);
    if (ring !== null) {
      return ring;
    }
    return { x, y };
  }

  /**
   * Rolls one outcome from `table` and spawns it near `(x, y)`, or spawns
   * nothing and returns `null` for the `null` "nothing drops" outcome. The
   * one place a drop table is read: `stepLootDrops` (enemy deaths) and
   * `rollRoomClearLoot` (room clear) both call this rather than rolling
   * their own way, so sober/promilled selection and need-weighting only
   * exist once.
   *
   * Returns where the pickup actually landed — `safeSpawnPoint` can push it
   * away from `(x, y)` if that point is blocked — so a caller that wants a
   * visual cue tied to the reward itself (`rollRoomClearLoot`'s ring, below)
   * can point it at the real spawn rather than assuming its own `(x, y)`.
   *
   * `guaranteed` drops the `null` "nothing" outcome from the roll entirely, so
   * the table always yields a real pickup — an elite kill (#156) uses it, the
   * "always drop loot" half of its risk-and-reward: still that enemy's own
   * tier table, just with the miss taken out. The mix (which pickup) is
   * unchanged; only the drop *rate* for that one roll goes to 1.
   */
  dropLoot(
    table: DropTable,
    x: number,
    y: number,
    guaranteed = false,
  ): { x: number; y: number } | null {
    const entries = this.promilleUnlocked ? table.promilled : table.sober;
    let total = 0;
    for (const entry of entries) {
      if (guaranteed && entry.pickupId === null) {
        continue;
      }
      total += entry.weight * this.needMultiplierFor(entry.pickupId);
    }
    if (total <= 0) {
      return null;
    }
    let roll = this.random.items.nextFloat() * total;
    let chosen: string | null = null;
    for (const entry of entries) {
      if (guaranteed && entry.pickupId === null) {
        continue;
      }
      roll -= entry.weight * this.needMultiplierFor(entry.pickupId);
      if (roll < 0) {
        chosen = entry.pickupId;
        break;
      }
    }
    if (chosen === null) {
      return null;
    }
    const radius = this.pickups.get(chosen).radius;
    const safe = this.safeSpawnPoint(x, y, radius);
    this.spawnPickup(chosen, safe.x, safe.y);
    return safe;
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
    if (effect.kind === 'food') {
      low =
        effect.pool === 'red'
          ? this.playerHealth < this.playerMaxHealth * tuning.needThreshold
          : effect.pool === 'soul'
            ? this.soulHp === 0
            : this.eternalHp === 0;
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
  private rollRoomClearLoot(): { x: number; y: number } | null {
    const centreX = (this.room.minX + this.room.maxX) / 2;
    const centreY = (this.room.minY + this.room.maxY) / 2;
    const table = this.roomSpecialRole === 'boss' ? BOSS_REWARD_DROP_TABLE : ROOM_CLEAR_DROP_TABLE;
    return this.dropLoot(table, centreX, centreY);
  }

  private setCollisionLayer(index: number, layer: CollisionLayerId): void {
    const collision = this.collision.data;
    collision[index * 2] = layer;
    collision[index * 2 + 1] = collisionMaskFor(layer);
  }
}

/**
 * Whether a component mask belongs to an enemy body rather than a plain prop.
 *
 * `GameSim.countProps`/`propWithin` (#277) both need it, and both need the
 * same reason written down once: an enemy is spawned through `spawnTarget`
 * and so carries `propKind` like a barrel does. See `countProps`' own doc
 * comment.
 */
function isEnemyBody(mask: number, enemyMask: number): boolean {
  return (mask & enemyMask) === enemyMask;
}
