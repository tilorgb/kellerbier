import { Group } from 'three';
import { ROOM_TILE_UNITS } from '../content/rooms/definition.js';
import { CollisionLayer } from '../sim/collision/layers.js';
import { hurtboxRadiusOf } from '../sim/collision/footprint.js';
import { World } from '../sim/ecs/world.js';
import { PLAYER_FOOTPRINT, type GameSim } from '../sim/game/sim.js';
import { propKindIndex } from '../sim/game/prop-kinds.js';
import { EnemyFacing } from '../sim/enemy/registry.js';
import { lerp } from '../sim/math.js';
import { bombBlastArmLength, bombFuseProgress } from '../sim/systems/bombs.js';
import {
  ENEMY_FLAG_LATCHED,
  ENEMY_MOTION_STRIDE,
  ENEMY_STRIDE,
  type EnemyEatMarkInfo,
  type EnemyTelegraphShapeInfo,
  enemyEatMark,
  enemyFlightHeight,
  enemyGrounded,
  enemyHidden,
  enemyHopProgress,
  enemySubmerged,
  type LobbedVolleyFlight,
  lobbedVolleyCount,
  lobbedVolleyFlight,
  enemyTelegraphProgress,
  enemyTelegraphShape,
  isEnemyElite,
  isEnemyInvulnerable,
  TelegraphShape,
} from '../sim/systems/enemy.js';
import { EntityAnimator } from './animation/animator.js';
import { AnimationState } from './animation/definition.js';
import {
  AUTHORED_FACING,
  resolveAnimationState,
  resolveFacing,
  resolveMirrorFacing,
} from './animation/state.js';
import type { AnimatedSpriteSet } from './floor-art.js';
import { type BitmapText, type Container, type Texture } from './gfx/index.js';
import { ENTITY_PALETTE } from './palette.js';
import { tileGridScale } from './tiles.js';
import { Billboard } from './world/billboard.js';
import {
  FloorHazardBar,
  FloorHazardDisc,
  FloorRing,
  FloorShade,
  FloorWedge,
} from './world/flat.js';
import { WorldLabel } from './world/label.js';

/**
 * Every collidable body that is not the player: enemies, bosses, pickups,
 * destructible props, placed Bierfassl bombs — each a `Billboard` standing at
 * its footprint, plus the flat shapes on the floor that tell the player what
 * is about to happen there.
 *
 * ## What survived the move to 3D, and what did not
 *
 * The gameplay signals are all here and read from the same simulation state
 * they always did: the hit flash (now the billboard's emissive term, so the
 * frame's own shape blows out white — what the silhouette texture swap used to
 * do), the invulnerable and elite tints, a boss's wind-up flush, a bomb's fuse
 * ramp and blink, all four telegraph shapes sized by their countdown, the bomb
 * cross the blast will actually fill, a pickup's spawn pop, shop prices and
 * pickup labels, and the death clips of bodies that just left the world.
 *
 * What went: the hand-drawn ground shadows (the shadow map casts the
 * silhouette), the foot-line sort (the depth buffer), and the scenery tinting
 * (the lights fall on a body because it stands in them).
 *
 * ## Telegraphs lie on the floor
 *
 * A ring, a wedge, a bar is the area the attack will cover, so it is drawn
 * *as* that area: flat on the floor, in room units, where the 2D game drew
 * it over the body. Under a tilted camera a flat shape is exactly as
 * foreshortened as the floor it marks, which is what makes "will that reach
 * me" answerable at a glance.
 */
const TELEGRAPH_SCALE = 2.6;
const LINE_TELEGRAPH_SCALE = 6;
const LINE_TELEGRAPH_HALF_ANGLE = 0.12;
const MAYPOLE_PROP_KIND = propKindIndex('maypole');
const BOMB_PICKUP_ID = 'bierfassl';
const RING_PULSE_RATE = 0.011;
const BOMB_BLINK_RATE = 0.045;
/** Every explosion hatch (#3, #12) rests here and blinks up by `SWING` on top. */
const BOMB_TELEGRAPH_MIN_ALPHA = 0.26;
const BOMB_TELEGRAPH_ALPHA_SWING = 0.4;

/**
 * The blink alpha every explosion telegraph shares (#12) — a Bierfassl's
 * crossed hatch, a lobbed Böller's disc, the player's own item. Rests dim
 * and pulses brighter, faster the closer the fuse is to zero (`fuse` 0..1);
 * a flat mid value with `ringPulses` off (reduced flashes).
 */
function hazardBlinkAlpha(nowMs: number, fuse: number, ringPulses: boolean): number {
  const blink = ringPulses ? Math.sin(nowMs * BOMB_BLINK_RATE * (1 + fuse * 2)) * 0.5 + 0.5 : 0.5;
  return BOMB_TELEGRAPH_MIN_ALPHA + blink * BOMB_TELEGRAPH_ALPHA_SWING;
}
/**
 * The plank a Borkenkäfer is eating (#410): black, from faint the moment it
 * starts to nearly a hole on its last bite.
 */
const EAT_SHADE_COLOUR = 0x000000;
const EAT_SHADE_MIN_ALPHA = 0.15;
const EAT_SHADE_MAX_ALPHA = 0.85;

/** How much bigger a `telegraphLook: 'bloat'` body (#405) stands at the end of its wind-up. */
const BLOAT_SWELL = 0.45;
/** The telegraph fraction a bloating body starts glowing green at — its last third. */
const BLOAT_GLOW_FROM = 2 / 3;
/** The emissive strength of that glow at the end of the wind-up. */
const BLOAT_GLOW_STRENGTH = 0.85;
/** A cloud edge's line width, as a fraction of its radius — thin, since at 40 units the red ring's 0.14 is a band. */
const CLOUD_EDGE_THICKNESS = 0.05;
/** A cloud edge fades in from this alpha to `MIN + SWING` over the wind-up — never as loud as an attack ring. */
const CLOUD_EDGE_MIN_ALPHA = 0.2;
const CLOUD_EDGE_ALPHA_SWING = 0.35;
/**
 * An ordinary enemy's wind-up (#429): how much wider and how much shorter
 * its sprite stands at the end of the telegraph — a crouch, loading a
 * spring — and how strongly it glows `ENTITY_PALETTE.windUpGlow` by then.
 */
const WIND_UP_WIDEN = 0.14;
const WIND_UP_SQUASH = 0.16;
const WIND_UP_GLOW_STRENGTH = 0.7;
const LABEL_POINT = { x: 0, y: 0 };
/** How far above the floor a pickup hovers, so its shadow separates it from the ground. */
const PICKUP_LIFT = 1.5;
/** Room units a `hopCardinal` body (#407, the Kaninchen) rises at the top of a hop — the sim moves it along the floor, this makes it a hop. */
const HOP_BOB = 2.5;
/**
 * Room units above the floor a flying body (#411, the Specht) is drawn —
 * clinging high on the wall, gliding back to it — scaled by
 * `enemyFlightHeight`, which is zero while it is down with its beak stuck.
 */
const FLY_HEIGHT = 7;
/** How far a drumming body (#411's `telegraphLook: 'drum'`) hammers back and forth, in room units, and how fast. */
const DRUM_SHAKE = 0.6;
const DRUM_SHAKE_RATE = 0.16;
/** How flat a submerged body's shadow is drawn, as a fraction of its height (#408). */
const SUBMERGED_FLATTEN = 0.6;
/** The sprite-name suffix a creature's under-the-water art is authored with (#408). */
const SHADOW_SUFFIX = '-shadow';
/** The sprite-name suffix a flying creature's down-on-the-floor art is authored with (#411's beak stuck in the plank). */
const LANDED_SUFFIX = '-landed';
/** Strength of the shadow's glow — enough to find it in the dark, not enough to read as lit. */
const SUBMERGED_GLOW_STRENGTH = 0.5;
/**
 * How far up Alois's billboard a latched Zecke's feet sit (#406), in room
 * units: his hat's crown is the top six rows of his 32-pixel frame, so 12
 * units (24 pixels) up sets the tick into the crown, standing in for part of
 * the hat — where it reads at a glance, instead of at his boots where his own
 * legs and the poison sparkles hid it.
 */
const LATCH_HAT_HEIGHT = 12;
/** How far in front of Alois's plane a latched tick is drawn, so the depth buffer always puts it over the hat. */
const LATCH_HAT_FORWARD = 0.3;
/**
 * Where on a `facing: 'crawl'` canvas the drawn body's middle is, as a
 * fraction of its height from the bottom edge: the Zecke's 16-row canvas
 * draws its bug in the bottom eight rows, so a quarter of the way up.
 */
const CRAWL_BODY_ANCHOR = 0.25;
/** Unit headings for a crawler's four quarter turns, by `crawlTurn`: east, south, west, north (room axes, +y south). */
const CRAWL_HEAD_X = [1, 0, -1, 0] as const;
const CRAWL_HEAD_Z = [0, 1, 0, -1] as const;

export function mixColor(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const r = Math.round(ar + (((b >> 16) & 0xff) - ar) * k);
  const g = Math.round(ag + (((b >> 8) & 0xff) - ag) * k);
  const bl = Math.round(ab + ((b & 0xff) - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

export interface EntityArt {
  /** What a body with no art of its own draws as. */
  readonly fallback: Texture;
  readonly enemyArt: Readonly<Record<string, Texture>>;
  readonly enemyAnimation: Readonly<Record<string, AnimatedSpriteSet>>;
  readonly pickupArt: Readonly<Record<string, Texture>>;
  readonly bossIds: ReadonlySet<string>;
}

export class EntityView {
  /** Everything this view draws in the world. */
  readonly group = new Group();
  readonly animator = new EntityAnimator();

  private readonly sim: GameSim;
  private readonly art: EntityArt;
  /**
   * Per enemy definition index, the art a submerged body draws instead of
   * its own (#408): `<id>-shadow` when the roster has one, so a creature can
   * look different under the water than out of it — the Bachforelle swims as
   * its whole silhouette and surfaces as only its head and shoulders. Unset:
   * the body's own art, darkened, is its shadow. Resolved once, here, so no
   * frame builds a name.
   */
  private readonly shadowArt: readonly (Texture | undefined)[];
  /**
   * Per enemy definition index, the art a flying body draws while it is
   * down in a `land` state (#411): `<id>-landed` when the roster has one —
   * the Specht's beak stuck in the plank, wings up. Unset: its own art.
   */
  private readonly landedArt: readonly (Texture | undefined)[];
  private readonly bodies: Billboard[] = [];
  /** Per body slot, 1 when that body is an enemy telegraphing this frame (#404's see-through pass). */
  private readonly bodyTelegraphing: number[] = [];
  /** Body slots drawn last `sync` — `enableSeeThrough` reads no further. */
  private bodiesUsed = 0;
  private readonly corpses: Billboard[] = [];
  private readonly rings: FloorRing[] = [];
  /** The thin green edge a poison cloud will settle at (#405) — see `TelegraphShape.Cloud`. */
  private readonly cloudEdges: FloorRing[] = [];
  private readonly wedges: FloorWedge[] = [];
  /** The bomb blast telegraph's crossed hatch arms (#3) — see `FloorHazardBar`. */
  private readonly hazardBars: FloorHazardBar[] = [];
  /** The radial-blast hatch disc — a lobbed Böller, the player's own item (#12). */
  private readonly hazardDiscs: FloorHazardDisc[] = [];
  /** The floor plank a Borkenkäfer is eating, darkening as it goes (#410). */
  private readonly eatShades: FloorShade[] = [];
  private readonly eatMark: EnemyEatMarkInfo = { progress: 0, x: 0, y: 0 };
  private readonly labels: WorldLabel[] = [];
  private readonly pickupTints: readonly number[];
  private readonly pickupLabels: readonly string[];
  private readonly pickupSprites: readonly (Texture | undefined)[];
  private readonly bombTexture: Texture | undefined;
  private targetTextures: readonly Texture[] = [];
  private ringPulses = true;
  /** Whether the plain `Ring` telegraph is drawn (#429) — `AccessibilitySettings.telegraphRings`. */
  private telegraphRings = false;
  private lean = 0;
  /**
   * Per entity slot, the facing a `facing` body with no animation strip last
   * showed — left/right (`-1`/`1`) for a mirror, a quarter turn (0-3,
   * `CRAWL_HEAD_X`) for a crawler — held while the sim gives no opinion.
   * Keyed by the entity in the slot, so a body spawned into a dead one's slot
   * does not inherit its facing.
   */
  private readonly heldFacing: number[] = [];
  private readonly heldFacingEntity: number[] = [];
  private readonly telegraphShape: EnemyTelegraphShapeInfo = {
    shape: TelegraphShape.Ring,
    progress: 0,
    x: 0,
    y: 0,
    angle: 0,
    arc: 0,
    reach: 0,
  };
  private readonly volleyScratch: LobbedVolleyFlight = {
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    progress: 0,
    radius: 0,
  };

  constructor(
    sim: GameSim,
    art: EntityArt,
    private readonly labelLayer: Container,
    private readonly makeLabel: () => BitmapText,
  ) {
    this.sim = sim;
    this.art = art;
    this.shadowArt = sim.enemies.all.map((enemy) => art.enemyArt[`${enemy.id}${SHADOW_SUFFIX}`]);
    this.landedArt = sim.enemies.all.map((enemy) => art.enemyArt[`${enemy.id}${LANDED_SUFFIX}`]);
    this.bombTexture = art.pickupArt[BOMB_PICKUP_ID];
    this.pickupTints = sim.pickups.all.map((definition) => definition.tint);
    this.pickupLabels = sim.pickups.all.map((definition) => definition.label);
    this.pickupSprites = sim.pickups.all.map((definition) => art.pickupArt[definition.id]);
    // One of each telegraph shape built up front, hidden, so their (unlit,
    // colour-only) materials are in the scene for `GameView.render`'s
    // first-frame `renderer.compile` — otherwise the first enemy to telegraph
    // an attack linked their programs mid-fight (`docs/DECISIONS.md` #80).
    // Bodies and corpses need no such seed: they share the pedestal item's
    // `Billboard` material shape, which `PedestalView` seeds the same way.
    this.ringAt(0).hide();
    this.cloudEdgeAt(0).hide();
    this.wedgeAt(0).hide();
    this.hazardBarAt(0).hide();
    this.hazardDiscAt(0).hide();
    this.eatShadeAt(0).hide();
    // Likewise one world label (a shop price, a pickup name) — `WorldLabel`
    // constructs hidden — so the first priced pickup does not link the label
    // text's program on the way into the shop.
    this.labelAt(0);
  }

  /** The held slot value for `index`, or `fallback` when the slot holds another entity's. */
  private heldFor(index: number, fallback: number): number {
    const entity = this.sim.world.entityAt(index);
    if (this.heldFacingEntity[index] !== entity) {
      this.heldFacingEntity[index] = entity;
      this.heldFacing[index] = fallback;
    }
    return this.heldFacing[index] ?? fallback;
  }

  /** A `facing: 'mirror'` body's left/right facing this frame (`resolveMirrorFacing`, held). */
  private mirrorOf(index: number): number {
    const held = this.heldFor(index, AUTHORED_FACING);
    const facing = resolveMirrorFacing(this.sim, index);
    if (facing === 0) {
      return held;
    }
    this.heldFacing[index] = facing;
    return facing;
  }

  /**
   * A `facing: 'crawl'` body's quarter turn this frame: its heading (the
   * hop it is on, `hopTowardPlayer`) snapped to the nearest of the four,
   * held while it has none. A fresh one faces south, at the camera.
   */
  private crawlTurnOf(index: number): number {
    const held = this.heldFor(index, 1);
    const motionBase = index * ENEMY_MOTION_STRIDE;
    const headingX = this.sim.enemyMotion.data[motionBase] ?? 0;
    const headingY = this.sim.enemyMotion.data[motionBase + 1] ?? 0;
    if (headingX === 0 && headingY === 0) {
      return held;
    }
    const turn = (Math.round(Math.atan2(headingY, headingX) / (Math.PI / 2)) + 4) % 4;
    this.heldFacing[index] = turn;
    return turn;
  }

  static get telegraphScale(): number {
    return TELEGRAPH_SCALE;
  }

  /** The floor's destructible-prop art, by `DESTRUCTIBLE_PROP_KINDS` index. */
  setTargetTextures(textures: readonly Texture[] | undefined): void {
    this.targetTextures = textures ?? [];
  }

  setRingPulses(enabled: boolean): void {
    this.ringPulses = enabled;
  }

  /** Draws the plain telegraph ring on top of the body wind-up (#429). Off by default. */
  setTelegraphRings(enabled: boolean): void {
    this.telegraphRings = enabled;
  }

  setLean(lean: number): void {
    this.lean = lean;
  }

  /** Drops every animation and corpse — a room just changed under them. */
  resetAnimation(): void {
    this.animator.reset();
    this.heldFacingEntity.length = 0;
    for (const corpse of this.corpses) {
      corpse.visible = false;
    }
  }

  /** How many billboards are live this frame — the benchmark's proxy for draw work. */
  get spriteCount(): number {
    return this.bodies.length;
  }

  /**
   * `project` maps a world point (x, height, z) to internal-frame pixels — the
   * camera's job, handed in so labels can sit over the heads they belong to.
   */
  sync(
    alpha: number,
    nowMs: number,
    project: (x: number, height: number, z: number, out: { x: number; y: number }) => void,
  ): void {
    this.animator.beginFrame(nowMs);
    const sim = this.sim;
    const world = sim.world;
    const states = world.states;
    const masks = world.masks;
    const required = sim.collidableMask;
    const collision = sim.collision.data;
    const body = sim.body.data;
    const hurtbox = sim.hurtbox.data;
    const flash = sim.flash.data;

    let used = 0;
    let ringsUsed = 0;
    let cloudEdgesUsed = 0;
    let wedgesUsed = 0;
    let hazardBarsUsed = 0;
    let hazardDiscsUsed = 0;
    let eatShadesUsed = 0;
    let labelsUsed = 0;
    const highWater = world.highWater;
    for (let index = 0; index < highWater; index++) {
      if (states[index] !== World.ALIVE) {
        continue;
      }
      const mask = masks[index] ?? 0;
      if ((mask & required) !== required) {
        continue;
      }
      const layer = collision[index * 2] ?? 0;
      if ((layer & CollisionLayer.Player) !== 0) {
        continue;
      }
      const isEnemyBody = (mask & sim.enemyMask) === sim.enemyMask;
      const isPickup = (layer & CollisionLayer.Pickup) !== 0;
      const isBomb = (mask & sim.bombFuse.bit) !== 0;
      // Off the arena (#412, the Waldradler between his two passes): not drawn.
      // Its ramps (`RampView`) are the telegraph of where it comes back.
      if (isEnemyBody && enemyHidden(sim, index)) {
        continue;
      }
      // The arena maypole is `MaibaumView`'s to draw (#199) — skip it here.
      if (
        !isEnemyBody &&
        !isPickup &&
        (mask & sim.propKind.bit) !== 0 &&
        (sim.propKind.data[index] ?? 0) === MAYPOLE_PROP_KIND
      ) {
        continue;
      }

      const footprint = body[index * 2] ?? 1;
      const hurtRadius = hurtboxRadiusOf(hurtbox[index * 2] ?? 0, footprint);
      const x = lerp(sim.previousX(index), sim.positionX(index), alpha);
      const y = lerp(sim.previousY(index), sim.positionY(index), alpha);
      const footZ = y + footprint;

      const compiledEnemy = isEnemyBody
        ? sim.enemies.at(sim.enemy.data[index * ENEMY_STRIDE] ?? 0)
        : null;
      const enemyId = compiledEnemy === null ? null : compiledEnemy.id;
      const isBoss = enemyId !== null && this.art.bossIds.has(enemyId);
      const telegraph = isEnemyBody ? enemyTelegraphProgress(sim, index) : 0;
      const bloat = compiledEnemy?.telegraphBloat === true ? telegraph : 0;
      // Every other ordinary enemy winds up on its own body (#429). A boss
      // has its own flush and pose (#193) and is left alone here.
      const windUp = !isBoss && bloat === 0 ? telegraph : 0;
      const bossTelegraph = isBoss ? telegraph : 0;
      const bombFuse = isBomb ? bombFuseProgress(sim, index) : 0;

      const animation = enemyId === null ? undefined : this.art.enemyAnimation[enemyId];
      let animationFrame = 0;
      let mirror = 1;
      if (animation !== undefined) {
        animationFrame = this.animator.track(
          index,
          world.entityAt(index),
          animation.clips,
          resolveAnimationState(sim, index),
          // A `facing: 'mirror'` body turns to the player while it stands
          // still (the Boar, the Kaninchen); every other strip faces its
          // stored heading, as it always has.
          compiledEnemy?.facing === EnemyFacing.Mirror
            ? resolveMirrorFacing(sim, index)
            : resolveFacing(sim, index),
          x,
          y,
          footprint,
        );
        mirror = this.animator.facingOf(index) === AUTHORED_FACING ? 1 : -1;
      }
      const latched =
        isEnemyBody && ((sim.enemy.data[index * ENEMY_STRIDE + 3] ?? 0) & ENEMY_FLAG_LATCHED) !== 0;
      // A crawler lies flat (the Zecke) — but not while riding on Alois's
      // hat, where it stands up on his billboard as before.
      const crawlTurn =
        animation === undefined && compiledEnemy?.facing === EnemyFacing.Crawl && !latched
          ? this.crawlTurnOf(index)
          : -1;
      if (animation === undefined && compiledEnemy?.facing === EnemyFacing.Mirror) {
        mirror = this.mirrorOf(index) === AUTHORED_FACING ? 1 : -1;
      }

      // Under the water (#408): the same silhouette, dark and flattened onto
      // the stream, with a faint glow so a lantern-dark room cannot hide it.
      const submerged = isEnemyBody && enemySubmerged(sim, index);

      const isPropTarget = !isPickup && enemyId === null && !isBomb;
      const pickupKindIndex = sim.pickupKind.data[index] ?? -1;
      const pickupSprite = isPickup ? this.pickupSprites[pickupKindIndex] : undefined;
      let texture: Texture =
        pickupSprite ??
        (isPickup
          ? this.art.fallback
          : animation !== undefined
            ? (animation.frames[animationFrame] ?? this.art.fallback)
            : isBomb
              ? (this.bombTexture ?? this.art.fallback)
              : enemyId === null
                ? (this.targetTextures[sim.propKind.data[index] ?? 0] ??
                  this.targetTextures[0] ??
                  this.art.fallback)
                : (this.art.enemyArt[enemyId] ?? this.art.fallback));

      const billboard = this.bodyAt(used);
      this.bodyTelegraphing[used] = telegraph > 0 ? 1 : 0;
      used += 1;
      if (submerged) {
        const shadow = this.shadowArt[sim.enemy.data[index * ENEMY_STRIDE] ?? 0];
        if (shadow !== undefined) {
          texture = shadow;
        }
        // A swimmer faces the way it swims: its heading is in the motion slots
        // (`swimInZone`), and creature art is authored facing left.
        const headingX = sim.enemyMotion.data[index * ENEMY_MOTION_STRIDE] ?? 0;
        if (animation === undefined && headingX !== 0) {
          mirror = headingX > 0 ? -1 : 1;
        }
      }
      if (isEnemyBody && compiledEnemy?.flying === true && enemyGrounded(sim, index)) {
        texture = this.landedArt[sim.enemy.data[index * ENEMY_STRIDE] ?? 0] ?? texture;
      }
      billboard.visible = true;
      billboard.setTexture(texture, mirror);
      const flashing = !isPickup && (flash[index] ?? 0) > 0;
      billboard.flash = flashing;
      if (bloat > BLOAT_GLOW_FROM && !flashing) {
        // The green comes in over the last third of the swell (#405), on the
        // emissive channel so a lantern-dark room (#404) cannot swallow it.
        const glow = (bloat - BLOAT_GLOW_FROM) / (1 - BLOAT_GLOW_FROM);
        billboard.setGlow(ENTITY_PALETTE.bloatTelegraphGlow, glow * BLOAT_GLOW_STRENGTH);
      } else if (windUp > 0 && !flashing) {
        // The load-up colour (#429): a warm glow that builds over the whole
        // wind-up, emissive for the same lantern-dark reason as the bloat.
        billboard.setGlow(ENTITY_PALETTE.windUpGlow, windUp * WIND_UP_GLOW_STRENGTH);
      }
      billboard.tint = isPickup
        ? pickupSprite !== undefined
          ? ENTITY_PALETTE.normalTint
          : (this.pickupTints[pickupKindIndex] ?? ENTITY_PALETTE.unknownPickupTint)
        : isEnemyInvulnerable(sim, index)
          ? ENTITY_PALETTE.invulnerableShellTint
          : isEnemyElite(sim, index)
            ? ENTITY_PALETTE.eliteTint
            : bossTelegraph > 0
              ? mixColor(
                  ENTITY_PALETTE.normalTint,
                  ENTITY_PALETTE.bossTelegraphTint,
                  Math.min(1, bossTelegraph * 1.15),
                )
              : bombFuse > 0
                ? mixColor(
                    ENTITY_PALETTE.normalTint,
                    ENTITY_PALETTE.bombFuseTint,
                    Math.min(
                      1,
                      bombFuse +
                        Math.max(0, bombFuse - 0.5) *
                          (Math.sin(nowMs * BOMB_BLINK_RATE * (1 + bombFuse * 3)) * 0.5 + 0.5),
                    ),
                  )
                : ENTITY_PALETTE.normalTint;

      if (submerged && !flashing) {
        billboard.tint = ENTITY_PALETTE.submergedShadow;
        billboard.setGlow(ENTITY_PALETTE.submergedGlow, SUBMERGED_GLOW_STRENGTH);
      }

      // A prop tile draws on the tile grid (a 32px barrel covers one cell), a
      // creature on the actor grid — the same two rules the 2D renderer had.
      const gridScale = isPropTarget ? tileGridScale(texture) * 2 : 1;
      const bounceTicks = isPickup ? (sim.spawnBounce.data[index] ?? 0) : 0;
      const bounceMax = Math.max(1, sim.tuning.pickup.spawnBounceTicks);
      const bounceProgress = bounceTicks / bounceMax;
      const pop = bounceTicks > 0 ? 1 + 0.4 * Math.sin(bounceProgress * Math.PI) : 1;
      // A pickup hovers a fixed amount so its shadow separates it from the
      // floor — it does not bob. A per-frame sine here made every static
      // sprite in a still room read as "breathing".
      const lift = isPickup
        ? PICKUP_LIFT
        : isEnemyBody
          ? HOP_BOB * Math.sin(Math.PI * enemyHopProgress(sim, index)) +
            FLY_HEIGHT * enemyFlightHeight(sim, index)
          : 0;
      // A bloating body (#405) swells over its wind-up and snaps back the
      // tick the telegraph ends — the deflate is the burst.
      const swell = 1 + BLOAT_SWELL * bloat;
      // The wind-up crouch (#429): wider and lower as the attack loads, eased
      // in so it reads as a spring compressing, released the tick the
      // telegraph ends. Skipped for a body whose strip authors its own
      // telegraph clip — the drawn pose is the animation then.
      const crouch =
        windUp > 0 && (animation?.clips.clips[AnimationState.Telegraph] ?? null) === null
          ? windUp * windUp * (3 - 2 * windUp)
          : 0;
      const widen = 1 + WIND_UP_WIDEN * crouch;
      // Drumming (#411): the head hammers back and forth for the whole
      // wind-up — the visible half of the drumroll.
      let placeX =
        compiledEnemy?.telegraphDrum === true && telegraph > 0
          ? x + DRUM_SHAKE * Math.sin(nowMs * DRUM_SHAKE_RATE)
          : x;
      let placeY = 0.2 + lift;
      let placeZ = footZ;
      if (latched) {
        // Riding on Alois (#406): on his own leaned plane, `LATCH_HAT_HEIGHT`
        // up it and a hair in front, at his interpolated position so it never
        // lags a frame behind him. The sim's offset (`latchToPlayer`) only
        // says which side of the hat.
        const player = sim.playerIndex;
        const playerX = lerp(sim.previousX(player), sim.positionX(player), alpha);
        const playerY = lerp(sim.previousY(player), sim.positionY(player), alpha);
        const sin = Math.sin(this.lean);
        const cos = Math.cos(this.lean);
        placeX = playerX + (sim.positionX(index) - sim.positionX(player));
        placeY = 0.2 + LATCH_HAT_HEIGHT * cos - LATCH_HAT_FORWARD * sin;
        placeZ = playerY + PLAYER_FOOTPRINT + LATCH_HAT_HEIGHT * sin + LATCH_HAT_FORWARD * cos;
      }
      if (crawlTurn >= 0) {
        // Flat on the floor at the body's centre, not standing at its feet.
        billboard.placeFlat(
          x,
          placeY,
          y,
          CRAWL_HEAD_X[crawlTurn] ?? 0,
          CRAWL_HEAD_Z[crawlTurn] ?? 0,
          CRAWL_BODY_ANCHOR,
          gridScale * pop * swell * widen,
          (1 - WIND_UP_SQUASH * crouch) / widen,
        );
      } else {
        if (billboard.isFlat) {
          billboard.standUp();
        }
        billboard.place(
          placeX,
          placeY,
          placeZ,
          this.lean,
          gridScale * pop * swell * widen,
          ((1 - WIND_UP_SQUASH * crouch) / widen) * (submerged ? SUBMERGED_FLATTEN : 1),
        );
      }

      const priced = isPickup && (mask & sim.pickupPrice.bit) !== 0;
      if (isPickup && (priced || pickupSprite === undefined)) {
        const label = this.labelAt(labelsUsed);
        labelsUsed += 1;
        const kindLabel = this.pickupLabels[pickupKindIndex] ?? '?';
        label.text.text = priced
          ? pickupSprite === undefined
            ? `${kindLabel} · ${String(sim.pickupPrice.data[index] ?? 0)}`
            : String(sim.pickupPrice.data[index] ?? 0)
          : kindLabel;
        // Over the body's head: project its top and stand the label there.
        project(x, billboard.heightUnits + lift + 2, footZ, LABEL_POINT);
        label.place(LABEL_POINT.x, LABEL_POINT.y);
        label.show();
      }

      if (!isBoss && enemyTelegraphShape(sim, index, this.telegraphShape)) {
        const info = this.telegraphShape;
        const pulse = this.ringPulses ? Math.sin(nowMs * RING_PULSE_RATE) * 0.12 : 0;
        const shapeAlpha = Math.min(1, 0.35 + info.progress * 0.5 + pulse);
        switch (info.shape) {
          case TelegraphShape.Line: {
            const wedge = this.wedgeAt(wedgesUsed);
            wedgesUsed += 1;
            const reach = hurtRadius * (1 + (LINE_TELEGRAPH_SCALE - 1) * info.progress);
            wedge.place(info.x, info.y, info.angle, reach, LINE_TELEGRAPH_HALF_ANGLE, shapeAlpha);
            break;
          }
          case TelegraphShape.Arc: {
            const wedge = this.wedgeAt(wedgesUsed);
            wedgesUsed += 1;
            wedge.place(
              info.x,
              info.y,
              info.angle,
              info.reach * info.progress,
              info.arc / 2,
              shapeAlpha,
            );
            break;
          }
          case TelegraphShape.Ground: {
            // A lobbed Böller's landing zone (#12): the same hazard hatch
            // every explosive shows, as a disc for a radial blast, at its
            // true radius from the moment the throw is readable — the fuse
            // is in the blink, not a growing footprint.
            const disc = this.hazardDiscAt(hazardDiscsUsed);
            hazardDiscsUsed += 1;
            disc.place(
              info.x,
              info.y,
              info.reach,
              hazardBlinkAlpha(nowMs, info.progress, this.ringPulses),
            );
            break;
          }
          case TelegraphShape.Cloud: {
            // The edge a poison cloud will settle at (#405): a thin, faint
            // line in the cloud's own green at its true radius, not the red
            // attack ring — it says "this is where the cloud will reach",
            // and the bloating body says "when".
            const edge = this.cloudEdgeAt(cloudEdgesUsed);
            cloudEdgesUsed += 1;
            edge.place(
              info.x,
              info.y,
              info.reach,
              CLOUD_EDGE_MIN_ALPHA + CLOUD_EDGE_ALPHA_SWING * info.progress,
            );
            break;
          }
          default: {
            // The plain ring is an accessibility option now (#429): the
            // body's wind-up is the telegraph, and this ring adds nothing
            // about *where* the attack goes that the body does not.
            if (!this.telegraphRings) {
              break;
            }
            const ring = this.ringAt(ringsUsed);
            ringsUsed += 1;
            const ringRadius = hurtRadius * (1 + (TELEGRAPH_SCALE - 1) * info.progress);
            ring.place(info.x, info.y, ringRadius, shapeAlpha);
            break;
          }
        }
      }

      // A volley's landing markers (#412), a boss's included — the one
      // telegraph that is not drawn from the body: the poison cloud's own edge
      // at every point a wrapper will land, brightening through the flight.
      const wrappers = isEnemyBody ? lobbedVolleyCount(sim, index) : 0;
      for (let point = 0; point < wrappers; point++) {
        lobbedVolleyFlight(sim, index, point, this.volleyScratch);
        const edge = this.cloudEdgeAt(cloudEdgesUsed);
        cloudEdgesUsed += 1;
        edge.place(
          this.volleyScratch.endX,
          this.volleyScratch.endY,
          this.volleyScratch.radius,
          CLOUD_EDGE_MIN_ALPHA + CLOUD_EDGE_ALPHA_SWING * this.volleyScratch.progress,
        );
      }

      if (isEnemyBody && enemyEatMark(sim, index, this.eatMark)) {
        // The plank going dark under the swarm (#410): the one that is about
        // to be a hole, readable before it is one.
        this.eatShadeAt(eatShadesUsed).place(
          this.eatMark.x,
          this.eatMark.y,
          ROOM_TILE_UNITS,
          EAT_SHADE_MIN_ALPHA + (EAT_SHADE_MAX_ALPHA - EAT_SHADE_MIN_ALPHA) * this.eatMark.progress,
        );
        eatShadesUsed += 1;
      }

      if (isBomb && bombFuse > 0) {
        // The exact cross `blastCandidate` damages: two arms `armSpan` long,
        // one tile wide. Shown at full size from the moment the Bierfassl is
        // set down (#3) — it never grows; the fuse is read from the blink,
        // not the footprint. It just blinks between a low rest alpha and a
        // brighter one, faster as the countdown runs out, so the whole area
        // that is about to be hit is legible the entire time.
        const armSpan = bombBlastArmLength(sim) * 2;
        const barAlpha = hazardBlinkAlpha(nowMs, bombFuse, this.ringPulses);
        this.hazardBarAt(hazardBarsUsed).place(x, y, armSpan, ROOM_TILE_UNITS, barAlpha);
        hazardBarsUsed += 1;
        this.hazardBarAt(hazardBarsUsed).place(x, y, ROOM_TILE_UNITS, armSpan, barAlpha);
        hazardBarsUsed += 1;
      }
    }

    // The player's own Böllerschmeißer item (#12): while its fuse burns, the
    // same hatch disc marks where it will go off, following the player the
    // way the blast itself does.
    const itemBlast = sim.activeItemBlastTelegraph;
    if (itemBlast !== null) {
      this.hazardDiscAt(hazardDiscsUsed).place(
        itemBlast.x,
        itemBlast.y,
        itemBlast.radius,
        hazardBlinkAlpha(nowMs, itemBlast.progress, this.ringPulses),
      );
      hazardDiscsUsed += 1;
    }

    this.animator.endFrame();
    this.syncCorpses();
    this.bodiesUsed = used;

    for (let slot = used; slot < this.bodies.length; slot++) {
      const body = this.bodies[slot];
      if (body !== undefined) {
        body.visible = false;
      }
    }
    for (let slot = ringsUsed; slot < this.rings.length; slot++) {
      this.rings[slot]?.hide();
    }
    for (let slot = cloudEdgesUsed; slot < this.cloudEdges.length; slot++) {
      this.cloudEdges[slot]?.hide();
    }
    for (let slot = wedgesUsed; slot < this.wedges.length; slot++) {
      this.wedges[slot]?.hide();
    }
    for (let slot = hazardBarsUsed; slot < this.hazardBars.length; slot++) {
      this.hazardBars[slot]?.hide();
    }
    for (let slot = hazardDiscsUsed; slot < this.hazardDiscs.length; slot++) {
      this.hazardDiscs[slot]?.hide();
    }
    for (let slot = eatShadesUsed; slot < this.eatShades.length; slot++) {
      this.eatShades[slot]?.hide();
    }
    for (let slot = labelsUsed; slot < this.labels.length; slot++) {
      this.labels[slot]?.hide();
    }
  }

  /** Death clips of bodies no longer in the world, fading where they fell. */
  private syncCorpses(): void {
    const animator = this.animator;
    let used = 0;
    for (let entry = 0; entry < animator.corpseCount; entry++) {
      const slot = animator.corpseSlotAt(entry);
      const clips = animator.corpseSetAt(slot);
      if (clips === null) {
        continue;
      }
      const frame = this.art.enemyAnimation[clips.name]?.frames[animator.corpseFrameAt(slot)];
      if (frame === undefined) {
        continue;
      }
      const corpse = this.corpseAt(used);
      used += 1;
      corpse.visible = true;
      corpse.setTexture(frame, animator.corpseFacingAt(slot) === AUTHORED_FACING ? 1 : -1);
      corpse.alpha = animator.corpseAlphaAt(slot);
      corpse.flash = false;
      corpse.tint = ENTITY_PALETTE.normalTint;
      corpse.place(
        animator.corpseXAt(slot),
        0.2,
        animator.corpseYAt(slot) + animator.corpseRadiusAt(slot),
        this.lean,
      );
    }
    for (let slot = used; slot < this.corpses.length; slot++) {
      const corpse = this.corpses[slot];
      if (corpse !== undefined) {
        corpse.visible = false;
      }
    }
  }

  private bodyAt(slot: number): Billboard {
    const existing = this.bodies[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Billboard();
    this.bodies.push(created);
    this.group.add(created.mesh);
    return created;
  }

  private corpseAt(slot: number): Billboard {
    const existing = this.corpses[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Billboard();
    this.corpses.push(created);
    this.group.add(created.mesh);
    return created;
  }

  /**
   * Puts everything a lantern-dark room (#404) must not hide on `layer`:
   * every telegraph shape (hidden ones draw nothing either way), and the
   * body of every enemy that is telegraphing this frame. Called by
   * `GameView.render` after its actor-layer sweep, only in a dark room.
   */
  enableSeeThrough(layer: number): void {
    for (let slot = 0; slot < this.bodiesUsed; slot++) {
      if (this.bodyTelegraphing[slot] === 1) {
        this.bodies[slot]?.mesh.layers.enable(layer);
      }
    }
    for (const shape of this.rings) {
      shape.mesh.layers.enable(layer);
    }
    for (const shape of this.cloudEdges) {
      shape.mesh.layers.enable(layer);
    }
    for (const shape of this.wedges) {
      shape.mesh.layers.enable(layer);
    }
    for (const shape of this.hazardBars) {
      shape.mesh.layers.enable(layer);
    }
    for (const shape of this.hazardDiscs) {
      shape.mesh.layers.enable(layer);
    }
    for (const shape of this.eatShades) {
      shape.mesh.layers.enable(layer);
    }
  }

  private ringAt(slot: number): FloorRing {
    const existing = this.rings[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new FloorRing(ENTITY_PALETTE.telegraphRing);
    this.rings.push(created);
    this.group.add(created.mesh);
    return created;
  }

  private cloudEdgeAt(slot: number): FloorRing {
    const existing = this.cloudEdges[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new FloorRing(ENTITY_PALETTE.cloudEdgeTelegraph, CLOUD_EDGE_THICKNESS);
    this.cloudEdges.push(created);
    this.group.add(created.mesh);
    return created;
  }

  private wedgeAt(slot: number): FloorWedge {
    const existing = this.wedges[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new FloorWedge(ENTITY_PALETTE.telegraphRing);
    this.wedges.push(created);
    this.group.add(created.mesh);
    return created;
  }

  private hazardBarAt(slot: number): FloorHazardBar {
    const existing = this.hazardBars[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new FloorHazardBar(ENTITY_PALETTE.bombFuseTint);
    this.hazardBars.push(created);
    this.group.add(created.mesh);
    return created;
  }

  private hazardDiscAt(slot: number): FloorHazardDisc {
    const existing = this.hazardDiscs[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new FloorHazardDisc(ENTITY_PALETTE.bombFuseTint);
    this.hazardDiscs.push(created);
    this.group.add(created.mesh);
    return created;
  }

  private eatShadeAt(slot: number): FloorShade {
    const existing = this.eatShades[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new FloorShade(EAT_SHADE_COLOUR);
    this.eatShades.push(created);
    this.group.add(created.mesh);
    return created;
  }

  private labelAt(slot: number): WorldLabel {
    const existing = this.labels[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new WorldLabel(this.makeLabel(), this.labelLayer);
    this.labels.push(created);
    return created;
  }

  destroy(): void {
    for (const body of [...this.bodies, ...this.corpses]) {
      body.dispose();
    }
    for (const shape of [
      ...this.rings,
      ...this.cloudEdges,
      ...this.wedges,
      ...this.hazardBars,
      ...this.hazardDiscs,
      ...this.eatShades,
    ]) {
      shape.dispose();
    }
    for (const label of this.labels) {
      label.dispose();
    }
    this.group.removeFromParent();
  }
}
