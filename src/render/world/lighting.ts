import {
  AmbientLight,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  PlaneGeometry,
  PointLight,
  RGBADepthPacking,
  type Scene,
  type Texture,
  CanvasTexture,
} from 'three';
import { TICKS_PER_SECOND } from '../../sim/time.js';
import { ACTOR_PIXELS_PER_UNIT } from '../resolution.js';
import { ELEVATION } from './camera.js';
import { Canopy, type CanopyKind, canopyLayout } from './canopy.js';
import { buildLanternSprite, LANTERN_HALF_HEIGHT, setLanternArt } from './lantern-sprite.js';
import { OCCLUDER_LAYER } from './layers.js';
import { pixelDisc, pixelShapeGeometry } from './pixel-shape.js';
import { LANTERN_REACH, type WallLantern } from './wall-lanterns.js';

/**
 * Light. The reason the room is 3D.
 *
 * ## Two rigs
 *
 * A floor is either a **cellar** — dark, lit by the bulbs that hang in it,
 * every one a real point light with a cord and a glass — or under
 * **daylight**: a sky, a sun that casts the shadows, and two clouds that
 * drift across the room on their own cycles, each crossing on a different
 * lane and in one of a few shapes, and take the light with them — or
 * **forest** (Floor 3, #402/#424): the same sun, but the whole room is under
 * a canopy that shades it the way a cloud would, with a few gaps the light
 * comes down through (`world/canopy.ts`). Nothing drifts there. One of its
 * lantern rooms has no gaps at all and is lit by the lanterns on its walls
 * (`world/wall-lanterns.ts`) instead. The
 * tileset says which (`FloorTileset.lighting`), and a room with no authored
 * `bulb` prop in a cellar gets two by default, because a cellar with no light
 * in it is a black screen, not a mood.
 *
 * ## What every rig shares
 *
 * A key directional light from high on the camera's side does the shadow
 * map: the back wall's inner face is the one the camera looks at and it is
 * lit, the side walls' shadows fall *outside* the room, and every body's
 * shadow lands behind it, up-screen, where it does not hide anything the
 * player is aiming at. Alois carries a soft lantern so he is never lost in a
 * dark corner, and every live player shot carries a small light of its own —
 * a thrown Maß lights the floor it flies over, which is the effect that
 * argued for all of this.
 *
 * ## The cloud, and why it is a shadow caster
 *
 * The 2D renderer drew Dorf & Acker's cloud as a multiply-blended sprite. Here
 * it is a plane above the room with a soft alpha texture that *casts a
 * shadow* through the same alpha-tested depth pass the sprites use: the
 * shadow it throws is a real one, it darkens the barrels and the Bauer as it
 * passes over them, not only the floor, and it costs one more caster.
 *
 * ## A constant point-light count (#292 / F1, F7)
 *
 * `numPointLights` is part of three.js's program cache key — every lit
 * material's shader is keyed on it, so a scene where the count changes as
 * rooms load and unload relinks every one of those shaders, twice per
 * crossing. The fix is that the *set* of `PointLight`s added to the scene
 * never changes after this constructor returns: the lantern, the shot
 * lights, a fixed pool of door glows and a fixed pool of bulb rigs are all
 * created once, here, and every later "add a light to this room" is really
 * "claim an already-scene-resident light and move it." A slot nobody claims
 * this room sits at intensity 0, still in the scene, still part of the
 * count. See `MAX_DOOR_GLOWS`/`MAX_ROOM_BULBS` below for how the pools are
 * sized, and `docs/DECISIONS.md` #74 for the shadow-casting decision that
 * went with this change.
 */
export type LightingRig = 'cellar' | 'daylight' | 'forest';

/** Rigs lit by a sky — a sun key whose shadows reach well past the room — rather than by bulbs. */
function skyLit(rig: LightingRig): boolean {
  return rig !== 'cellar';
}

/** Point lights riding along with live player shots. */
export const SHOT_LIGHT_COUNT = 8;

/**
 * How many door glows can be lit across the whole scene at once.
 *
 * A `DoorPiece` claims one while its room is *on screen* — `Scenery.attach`
 * hands the room's doors their glows, `detach` takes them back — so the pool
 * only has to cover the rooms three.js is actually drawing: the room being
 * played and, for the ~1 s of the transition slide, the room just left. (Before
 * #80's follow-up a door held its glow for its whole lifetime, so #293's
 * `SceneryCache` kept up to four off-screen rooms' worth of glows claimed and
 * the pool had to be 12; a cached room's glows are dark anyway.) Measured
 * across 300 generated floors on both authored floor tags
 * (`tests/unit/lighting-pool.test.ts` pins the measurement), the worst single
 * room has 5 doors and the worst *adjacent pair* — the two rooms a slide holds
 * — totals 9, in 34 of 22,000 pairs; 8 or more is under 2%. 10 covers the
 * worst pair with one spare. Every point light is a per-fragment loop
 * iteration in every lit shader (F7), so this is sized to the measurement, not
 * padded. Overflow still degrades gracefully — `acquireDoorGlow` returns `null`
 * and that door just doesn't glow for the slide (`docs/DECISIONS.md` #19) —
 * rather than reintroducing the count churn this pool exists to remove.
 */
export const MAX_DOOR_GLOWS = 10;

/**
 * How many bulb rigs (light + glass + cord) a cellar room can light at once.
 * Authored content has never used more than one `bulb` prop; the unauthored
 * default (`defaultBulbs`) is two. 3 is that plus one spare — trimmed from 6
 * in #80's follow-up, since every slot is a per-fragment loop iteration in
 * every lit shader whether or not a bulb hangs there (F7). A room that asks
 * for more gets its first three lit and a one-time dev warning.
 */
export const MAX_ROOM_BULBS = 3;

/**
 * How many prop lights — the white beam over an item pedestal
 * (`render/pedestal-view.ts`) and over a vending machine
 * (`render/machine-view.ts`) — can be lit at once. Those views used to own a
 * `PointLight` each, parented under a per-slot group that was hidden when the
 * room had no pedestal there: three.js's light traversal skips a hidden
 * subtree, so `numPointLights` — a `#define` in every lit shader, and part of
 * every program's cache key — changed with the room's pedestal count, and the
 * whole lit program set relinked on the crossing (`docs/DECISIONS.md` #80).
 * Authored rooms place at most one pedestal (`tests/unit/lighting-pool.test.ts`
 * measures it) and a floor has at most one machine, so 3 is both plus one
 * spare; overflow degrades the same way a door glow's does — the beam just
 * casts no light.
 */
export const MAX_PROP_LIGHTS = 3;

const BULB_HEIGHT = 34;
/** The glass's radius and the cord's length, in room units. */
const BULB_RADIUS = 2;
const BULB_CORD_LENGTH = 40;
/** One cell of the bulb's baked outline: the same grid a sprite's texels sit on. */
const BULB_CELL = 1 / ACTOR_PIXELS_PER_UNIT;
const CLOUD_HEIGHT = 90;
/** How long one cloud takes to cross the room, west edge to east edge. */
export const CLOUD_CROSS_TICKS = TICKS_PER_SECOND * 18;
/**
 * The two clouds' cycles: each crosses once per `cycleTicks`, starting
 * `offsetTicks` into the run. Different, co-prime-ish cycle lengths so the
 * pair drifts in and out of step — usually one shadow somewhere in the room,
 * sometimes two, sometimes a stretch of clear sun — instead of a pattern the
 * player can clock.
 */
export const CLOUD_CYCLES: readonly {
  readonly cycleTicks: number;
  readonly offsetTicks: number;
}[] = [
  { cycleTicks: TICKS_PER_SECOND * 34, offsetTicks: 0 },
  { cycleTicks: TICKS_PER_SECOND * 47, offsetTicks: TICKS_PER_SECOND * 17 },
];
/** How far a crossing's shadow lane may drift north/south over the run, as a fraction of the room's depth. */
const CLOUD_DRIFT = 0.15;
const DOOR_GLOW_COLOUR = 0xff9a3c;
/**
 * Alois's lantern per rig: a cellar needs it most. Under the canopy it is
 * fainter than anywhere (#424) — a body in the shade has to *look* shaded, and
 * a light of his own would lift him back out of it; this is only enough that
 * his outline holds against dark ground.
 */
const LANTERN_INTENSITY: Readonly<Record<LightingRig, number>> = {
  cellar: 420,
  daylight: 120,
  forest: 45,
};

/**
 * A wall lantern (#424): a candle or a small gas lamp, so warmer and far
 * weaker than a cellar bulb, hung low, and reaching only as far as its pool.
 */
const WALL_LANTERN_COLOUR = 0xff9a45;
const WALL_LANTERN_INTENSITY = 5200;
const WALL_LANTERN_HEIGHT = 14;
/** How far into the room from the lantern its light source sits — see `setWallLanterns`. */
const WALL_LANTERN_THROW = 9;
const WALL_LANTERN_DISTANCE = LANTERN_REACH * 2.8;
const BULB_COLOUR = 0xffb870;
const BULB_INTENSITY = 9000;
const BULB_DISTANCE = 300;
/** The key light's shadow filter radius under the canopy, in shadow-map texels — see `onRoomChanged`. */
const FOREST_SHADOW_RADIUS = 4;
/** How far a lantern's brightness wavers either side of its own level. */
export const WALL_LANTERN_FLICKER = 0.12;

/**
 * Lantern `index`'s brightness at `tick`, around 1: three slow sines with
 * periods that share no beat, offset per lantern, so each wavers like a
 * sheltered flame and no two do it together. A pure function of the tick —
 * a replay's lanterns flicker the same way.
 */
export function lanternFlicker(index: number, tick: number): number {
  const t = tick / TICKS_PER_SECOND + index * 7.31;
  const wave = Math.sin(t * 2.1) * 0.5 + Math.sin(t * 5.3 + index) * 0.3 + Math.sin(t * 11.7) * 0.2;
  return 1 + wave * WALL_LANTERN_FLICKER;
}

/** What a forest room needs beyond its size: see `Lighting.onRoomChanged`. */
export interface ForestRoom {
  /** Seeds where the canopy opens — `forestLightSeed`. */
  readonly seed: number;
  readonly canopy: CanopyKind;
  /** The lanterns to light; empty for a room that is not a lantern room. */
  readonly lanterns: readonly WallLantern[];
}

interface RigColours {
  readonly ambient: number;
  readonly ambientIntensity: number;
  readonly sky: number;
  readonly ground: number;
  readonly hemisphereIntensity: number;
  readonly key: number;
  readonly keyIntensity: number;
  readonly background: number;
}

const RIGS: Readonly<Record<LightingRig, RigColours>> = {
  cellar: {
    ambient: 0x7a6c88,
    ambientIntensity: 1.3,
    sky: 0x8a7aa0,
    ground: 0x3a2a1a,
    hemisphereIntensity: 0.5,
    key: 0xffe2b8,
    keyIntensity: 2.6,
    background: 0x07060a,
  },
  daylight: {
    ambient: 0xa8b4d0,
    ambientIntensity: 1.7,
    sky: 0xbfd4ff,
    ground: 0x6a5a3a,
    hemisphereIntensity: 1.1,
    key: 0xfff2d8,
    keyIntensity: 3.4,
    background: 0x2a3a2a,
  },
  // Under the trees: the ambient and the sky bounce are what a shaded floor
  // is lit by, cool and green, since the canopy (`world/canopy.ts`) keeps the
  // key off nearly all of it. The key is the full sun, warm — it only ever
  // lands in a gap, and the contrast with the shade is the point.
  forest: {
    ambient: 0x6f8a86,
    ambientIntensity: 1.45,
    sky: 0x88aaa0,
    ground: 0x2a2a1a,
    hemisphereIntensity: 0.95,
    key: 0xfff0cc,
    keyIntensity: 4.5,
    background: 0x0a120c,
  },
};

interface BulbRig {
  readonly light: PointLight;
  readonly glass: Mesh;
  readonly cord: Mesh;
  /** What the rig is drawn as when it is a wall lantern rather than a bulb (#424). */
  readonly lantern: Mesh;
}

export class Lighting {
  private readonly scene: Scene;
  private readonly ambient = new AmbientLight(0xffffff, 1);
  private readonly hemisphere = new HemisphereLight(0xffffff, 0x000000, 1);
  private readonly key = new DirectionalLight(0xffffff, 1);
  /**
   * Two soft fills from the east and the west, no shadows: the side walls'
   * inner faces look across the room, square to neither the key nor the
   * camera, and without these they read as black slabs with a hole where the
   * door is.
   */
  private readonly fillEast = new DirectionalLight(0xffffff, 1.2);
  private readonly fillWest = new DirectionalLight(0xffffff, 1.2);
  private readonly lantern = new PointLight(0xffd9a6, 420, 120, 2);
  private readonly shotLights: PointLight[] = [];
  /** Fixed pool of door glows — see `MAX_DOOR_GLOWS`. `acquireDoorGlow`/`releaseDoorGlow` hand them out. */
  private readonly doorGlows: PointLight[] = [];
  private readonly doorGlowFree: boolean[] = [];
  private warnedDoorGlowOverflow = false;
  /** Fixed pool of prop lights — see `MAX_PROP_LIGHTS`. `acquirePropLight`/`releasePropLight` hand them out. */
  private readonly propLights: PointLight[] = [];
  private readonly propLightFree: boolean[] = [];
  private warnedPropLightOverflow = false;
  /** Fixed pool of bulb rigs — see `MAX_ROOM_BULBS`. Reassigned wholesale by `onRoomChanged`, not acquired/released. */
  private readonly bulbRigs: BulbRig[] = [];
  private warnedBulbOverflow = false;
  /** How far the bulb glass leans back to face the camera — see `setLean`. */
  private lean = -ELEVATION;
  /** One persistent mesh per `CLOUD_CYCLES` entry, re-shaped and re-laned per crossing rather than rebuilt — see `sync`. */
  private readonly clouds: readonly Mesh[];
  /** Floor 3's canopy and the shafts under its gaps (#424) — hidden on every other rig. */
  private readonly canopy = new Canopy();
  /** How many of the bulb rigs are wall lanterns this room, and so flicker — see `sync`. */
  private wallLanternCount = 0;
  private frameWidth = 0;
  private frameHeight = 0;
  /** Where a cloud at `CLOUD_HEIGHT` throws its shadow, relative to itself — see `positionCloud`. */
  private shadowOffsetX = 0;
  private shadowOffsetZ = 0;
  private cloudMovingValue = false;
  private rig: LightingRig = 'cellar';
  private reducedMotion = false;

  constructor(scene: Scene) {
    this.scene = scene;
    // `fillEast`/`fillWest` are deliberately not added to the scene here,
    // unchanged from before #292: that was already the case before this
    // pass, and re-attaching them would both be a visual change out of this
    // issue's "no intended visual change" scope and a new NUM_DIR_LIGHTS
    // shader-cache-key source — exactly the kind of churn this issue removes.
    scene.add(this.ambient, this.hemisphere, this.key, this.key.target, this.lantern);
    // Every light reaches both render passes — GameView draws the actor layer
    // a second time (see `world/layers.ts`), and a light seen only on layer 0
    // would leave those sprites unlit in that pass.
    for (const light of [this.ambient, this.hemisphere, this.key, this.lantern]) {
      light.layers.enableAll();
    }
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.6;
    // The shadow pass filters casters by its own camera's layers, not the
    // light's — without this the actor-layer sprites cast no shadow. (They
    // do not currently cast at all — see the class doc and `docs/DECISIONS.md`
    // #74 — but the room architecture that *is* on layer 0 still needs this.)
    this.key.shadow.camera.layers.enableAll();
    for (let i = 0; i < SHOT_LIGHT_COUNT; i++) {
      const light = new PointLight(0xffb347, 0, 70, 2);
      light.layers.enableAll();
      this.shotLights.push(light);
      scene.add(light);
    }
    for (let i = 0; i < MAX_DOOR_GLOWS; i++) {
      const light = new PointLight(DOOR_GLOW_COLOUR, 0, 60, 2);
      light.layers.enableAll();
      this.doorGlows.push(light);
      this.doorGlowFree.push(true);
      scene.add(light);
    }
    for (let i = 0; i < MAX_PROP_LIGHTS; i++) {
      const light = new PointLight(0xffffff, 0, 90, 2);
      light.layers.enableAll();
      this.propLights.push(light);
      this.propLightFree.push(true);
      scene.add(light);
    }
    for (let i = 0; i < MAX_ROOM_BULBS; i++) {
      this.bulbRigs.push(this.buildBulbRig());
    }
    const clouds: Mesh[] = [];
    for (const _cycle of CLOUD_CYCLES) {
      const cloud = buildCloudMesh();
      if (cloud !== null) {
        clouds.push(cloud);
        scene.add(cloud);
      }
    }
    this.clouds = clouds;
    if (this.canopy.plane !== null) {
      scene.add(this.canopy.plane);
    }
    scene.add(this.canopy.shafts);
    this.canopy.setLean(this.lean);
  }

  /** The wall lantern's tile (`wald-lantern`) from the art bundle — see `world/lantern-sprite.ts`. */
  setLanternArt(texture: Texture | undefined): void {
    for (const rig of this.bulbRigs) {
      setLanternArt(rig.lantern, texture);
    }
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  /**
   * Re-lights for a room: which rig, where its bulbs hang, how big it is (for
   * the key light's shadow frustum and the cloud's run). `forest` is what the
   * forest rig additionally needs — where its canopy opens and which lanterns
   * burn; without it a forest room is simply shaded, gaps from seed 0.
   */
  onRoomChanged(
    rig: LightingRig,
    frameWidth: number,
    frameHeight: number,
    bulbs: readonly { readonly x: number; readonly y: number }[],
    forest: ForestRoom = { seed: 0, canopy: 'ordinary', lanterns: [] },
  ): void {
    this.rig = rig;
    const colours = RIGS[rig];
    this.ambient.color.setHex(colours.ambient);
    this.ambient.intensity = colours.ambientIntensity;
    this.hemisphere.color.setHex(colours.sky);
    this.hemisphere.groundColor.setHex(colours.ground);
    this.hemisphere.intensity = colours.hemisphereIntensity;
    this.key.color.setHex(colours.key);
    this.key.intensity = colours.keyIntensity;
    for (const [fill, side] of [
      [this.fillEast, 1],
      [this.fillWest, -1],
    ] as const) {
      fill.color.setHex(colours.key);
      fill.position.set(frameWidth / 2 + side * frameWidth, 60, frameHeight / 2);
      fill.target.position.set(frameWidth / 2, 0, frameHeight / 2);
    }
    this.scene.background = null;

    // High on the camera's side, a touch east of centre; see the class comment.
    // Steep and not far south: a shallower, more-southern key raked the
    // (now full-height) south wall's shadow a long way north across the floor.
    this.key.position.set(frameWidth * 0.62, 340, frameHeight * 1.5);
    this.key.target.position.set(frameWidth / 2, 0, frameHeight / 2);
    const shadow = this.key.shadow.camera;
    // Wide enough left/right that the drifting cloud's shadow (#11) is never
    // clipped against the frustum edge — a straight cut there was most of why
    // it read as a box. The daylight rig widens further than the cellar needs
    // because only it has the cloud; the extra span costs a little shadow-map
    // resolution, acceptable for a floor lit by a soft overcast key anyway.
    const halfWidth = skyLit(rig) ? frameWidth * 1.4 : frameWidth * 0.75;
    shadow.left = -halfWidth;
    shadow.right = halfWidth;
    shadow.top = frameHeight * 0.9;
    shadow.bottom = -frameHeight * 0.9;
    shadow.near = 50;
    shadow.far = 700;
    // Under the canopy the shadow's edge *is* the picture — the rim of every
    // gap — so it is filtered wide there, into the soft, leafy edge a gap in
    // the trees has. Everywhere else a shadow keeps its crisper default.
    this.key.shadow.radius = rig === 'forest' ? FOREST_SHADOW_RADIUS : 1;
    shadow.updateProjectionMatrix();

    if (rig === 'cellar') {
      this.hideCloud();
      this.canopy.hide();
      this.setBulbs(bulbs.length > 0 ? bulbs : defaultBulbs(frameWidth, frameHeight));
    } else if (rig === 'forest') {
      // `positionCloud` for the shadow offset the canopy hangs by; the clouds
      // themselves stay hidden — `sync` only drives them in daylight.
      this.positionCloud(frameWidth, frameHeight);
      this.canopy.apply(
        canopyLayout(forest.seed, frameWidth, frameHeight, forest.canopy),
        frameWidth,
        frameHeight,
        CLOUD_HEIGHT,
        this.shadowOffsetX,
        this.shadowOffsetZ,
      );
      this.setWallLanterns(forest.lanterns);
    } else {
      this.canopy.hide();
      this.setBulbs([]);
      this.positionCloud(frameWidth, frameHeight);
    }
  }

  /** The bulb glass turns to a new camera angle, the way a billboard does. */
  setLean(lean: number): void {
    this.lean = lean;
    for (const rig of this.bulbRigs) {
      rig.glass.rotation.x = lean;
      rig.lantern.rotation.x = lean;
    }
    this.canopy.setLean(lean);
  }

  /** Lights exactly `placed.length` bulb rigs (clamped to the pool) and dims the rest. */
  private setBulbs(placed: readonly { readonly x: number; readonly y: number }[]): void {
    this.wallLanternCount = 0;
    for (const rig of this.bulbRigs) {
      rig.lantern.visible = false;
    }
    const count = Math.min(placed.length, MAX_ROOM_BULBS);
    if (placed.length > MAX_ROOM_BULBS) {
      this.warnBulbOverflow(placed.length);
    }
    for (let i = 0; i < count; i++) {
      const bulb = placed[i];
      const rig = this.bulbRigs[i];
      if (bulb === undefined || rig === undefined) {
        continue;
      }
      rig.light.position.set(bulb.x, BULB_HEIGHT, bulb.y);
      rig.light.color.setHex(BULB_COLOUR);
      rig.light.distance = BULB_DISTANCE;
      rig.light.intensity = BULB_INTENSITY;
      rig.glass.position.copy(rig.light.position);
      rig.glass.visible = true;
      rig.cord.position.set(bulb.x, BULB_HEIGHT + BULB_RADIUS + BULB_CORD_LENGTH / 2, bulb.y);
      rig.cord.visible = true;
    }
    for (let i = count; i < MAX_ROOM_BULBS; i++) {
      const rig = this.bulbRigs[i];
      if (rig === undefined) {
        continue;
      }
      rig.light.intensity = 0;
      rig.glass.visible = false;
      rig.cord.visible = false;
    }
  }

  /**
   * Lights a lantern room's wall lanterns from the bulb pool — the rigs a
   * forest room would otherwise leave dark, so the scene's point-light count
   * is what it always was (see the class comment). A lantern on the south
   * wall hangs on the face the camera cannot see, so only its light shows.
   */
  private setWallLanterns(placed: readonly WallLantern[]): void {
    this.setBulbs([]);
    const count = Math.min(placed.length, MAX_ROOM_BULBS);
    for (let i = 0; i < count; i++) {
      const lantern = placed[i];
      const rig = this.bulbRigs[i];
      if (lantern === undefined || rig === undefined) {
        continue;
      }
      // The light itself sits a little out from the wall, so it falls on the
      // floor in front of the lantern rather than mostly on the wall behind it.
      const out = WALL_LANTERN_THROW;
      const dx = lantern.wall === 'west' ? out : lantern.wall === 'east' ? -out : 0;
      const dz = lantern.wall === 'north' ? out : lantern.wall === 'south' ? -out : 0;
      rig.light.position.set(lantern.x + dx, WALL_LANTERN_HEIGHT, lantern.z + dz);
      rig.light.color.setHex(WALL_LANTERN_COLOUR);
      rig.light.distance = WALL_LANTERN_DISTANCE;
      rig.light.intensity = WALL_LANTERN_INTENSITY;
      rig.lantern.position.set(lantern.x, WALL_LANTERN_HEIGHT - LANTERN_HALF_HEIGHT / 2, lantern.z);
      rig.lantern.visible = lantern.wall !== 'south';
    }
    this.wallLanternCount = count;
  }

  private buildBulbRig(): BulbRig {
    const light = new PointLight(BULB_COLOUR, 0, BULB_DISTANCE, 2);
    light.layers.enableAll();
    this.scene.add(light);
    // Baked onto the sprite grid rather than left as a sphere and a cylinder:
    // at display resolution those have a clean edge no pixel art in the room
    // has (`world/pixel-shape.ts`). The glass is a pixel disc that faces the
    // camera the way a billboard does; the cord is one cell wide.
    const cells = Math.round(BULB_RADIUS * 2 * ACTOR_PIXELS_PER_UNIT);
    const glass = new Mesh(
      pixelShapeGeometry(cells, cells, pixelDisc(cells), BULB_CELL, BULB_CELL),
      new MeshBasicMaterial({ color: 0xfff1c8, side: DoubleSide }),
    );
    glass.rotation.x = this.lean;
    glass.visible = false;
    this.scene.add(glass);
    const cord = new Mesh(
      new PlaneGeometry(BULB_CELL, BULB_CORD_LENGTH),
      new MeshBasicMaterial({ color: 0x141018, side: DoubleSide }),
    );
    cord.visible = false;
    this.scene.add(cord);
    // The bulb hangs in the room, not on the ceiling plane — an actor north
    // of it is behind it. `GameView.render`'s pass two clears the depth
    // buffer before drawing actors, so anything drawn only in pass one (this
    // glass and cord, on the default layer) loses its depth and every actor
    // then paints over it. Putting the rig on `OCCLUDER_LAYER` too gets its
    // depth re-seeded by the occluder pre-pass, so a body behind the bulb
    // reads as behind it again — the same footing as a wall — without the
    // pass-one draw or the head-clip fix changing. See `world/layers.ts`.
    glass.layers.enable(OCCLUDER_LAYER);
    cord.layers.enable(OCCLUDER_LAYER);
    const lantern = buildLanternSprite();
    lantern.rotation.x = this.lean;
    this.scene.add(lantern);
    return { light, glass, cord, lantern };
  }

  private warnBulbOverflow(requested: number): void {
    if (!import.meta.env.DEV || this.warnedBulbOverflow) {
      return;
    }
    this.warnedBulbOverflow = true;
    console.warn(
      `Lighting: room asked for ${String(requested)} bulbs, pool holds ${String(MAX_ROOM_BULBS)} — ` +
        'the rest go unlit (docs/DECISIONS.md #19).',
    );
  }

  /** Claims a door glow for a `DoorPiece`'s whole lifetime, or `null` if the pool is exhausted. */
  acquireDoorGlow(): PointLight | null {
    for (let i = 0; i < this.doorGlowFree.length; i++) {
      if (this.doorGlowFree[i] === true) {
        this.doorGlowFree[i] = false;
        const light = this.doorGlows[i];
        if (light !== undefined) {
          light.intensity = 0;
          return light;
        }
      }
    }
    if (import.meta.env.DEV && !this.warnedDoorGlowOverflow) {
      this.warnedDoorGlowOverflow = true;
      console.warn(
        `Lighting: door-glow pool exhausted at ${String(MAX_DOOR_GLOWS)} — ` +
          'this door will not glow when open (docs/DECISIONS.md #19).',
      );
    }
    return null;
  }

  /**
   * Returns a light `acquireDoorGlow` handed out. Safe to call with `null`.
   *
   * The light never left the scene root — a `DoorPiece` positions its glow in
   * world space rather than parenting it (`DoorPiece.placeGlow`), precisely so
   * that detaching a room's group (the cache, the end of the transition slide)
   * cannot pull the light out of three.js's light traversal and change the
   * count. All there is to release is to put it out and mark the slot free.
   */
  releaseDoorGlow(light: PointLight | null): void {
    if (light === null) {
      return;
    }
    const index = this.doorGlows.indexOf(light);
    if (index === -1) {
      return;
    }
    light.intensity = 0;
    this.doorGlowFree[index] = true;
  }

  /**
   * Claims a prop light — a pedestal's or a machine's beam — for the caller's
   * whole lifetime, or `null` if the pool is exhausted (the beam then simply
   * casts no light; `docs/DECISIONS.md` #19). Handed out at intensity 0 and
   * sitting at the scene root, where it must stay: the caller drives its
   * world-space `position` and `intensity` every frame, and never parents it.
   */
  acquirePropLight(): PointLight | null {
    for (let i = 0; i < this.propLightFree.length; i++) {
      if (this.propLightFree[i] === true) {
        this.propLightFree[i] = false;
        const light = this.propLights[i];
        if (light !== undefined) {
          light.intensity = 0;
          return light;
        }
      }
    }
    if (import.meta.env.DEV && !this.warnedPropLightOverflow) {
      this.warnedPropLightOverflow = true;
      console.warn(
        `Lighting: prop-light pool exhausted at ${String(MAX_PROP_LIGHTS)} — ` +
          'this pedestal or machine beam will cast no light (docs/DECISIONS.md #19).',
      );
    }
    return null;
  }

  /** Returns a light `acquirePropLight` handed out. Safe to call with `null`. */
  releasePropLight(light: PointLight | null): void {
    if (light === null) {
      return;
    }
    const index = this.propLights.indexOf(light);
    if (index === -1) {
      return;
    }
    light.intensity = 0;
    this.propLightFree[index] = true;
  }

  private hideCloud(): void {
    for (const cloud of this.clouds) {
      cloud.visible = false;
    }
    this.cloudMovingValue = false;
  }

  /**
   * Remembers this room's size and where the key light throws a cloud's
   * shadow. The cloud hangs `CLOUD_HEIGHT` up and the key comes from high on
   * the camera's side, so the shadow lands well north of the plane casting it
   * — about a quarter of the room's depth. Before #11's follow-up the plane
   * sat over the room's centre and that offset put every crossing's shadow in
   * the top half; the lane is now chosen for the *shadow*, and the plane is
   * placed back along the light ray from it.
   */
  private positionCloud(frameWidth: number, frameHeight: number): void {
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    const key = this.key.position;
    const target = this.key.target.position;
    const drop = CLOUD_HEIGHT / Math.max(1, key.y - target.y);
    this.shadowOffsetX = (target.x - key.x) * drop;
    this.shadowOffsetZ = (target.z - key.z) * drop;
    this.hideCloud();
  }

  /**
   * Drives the clouds along their cycles. Each crossing — cloud `i`'s `n`th —
   * picks its silhouette, size and shadow lane from a hash of `(i, n)`, so the
   * sky varies crossing to crossing and is still a pure function of the tick:
   * a replay clouds over at the same moment, in the same place.
   */
  sync(tick: number): void {
    for (let i = 0; i < this.wallLanternCount; i++) {
      const rig = this.bulbRigs[i];
      if (rig !== undefined) {
        rig.light.intensity =
          WALL_LANTERN_INTENSITY * (this.reducedMotion ? 1 : lanternFlicker(i, tick));
      }
    }
    if (this.clouds.length === 0 || this.rig !== 'daylight') {
      return;
    }
    let moving = false;
    for (let i = 0; i < this.clouds.length; i++) {
      const cloud = this.clouds[i];
      const cycle = CLOUD_CYCLES[i];
      if (cloud === undefined || cycle === undefined) {
        continue;
      }
      const shifted = tick + cycle.cycleTicks - cycle.offsetTicks;
      const phase = shifted % cycle.cycleTicks;
      if (phase >= CLOUD_CROSS_TICKS || this.reducedMotion) {
        cloud.visible = false;
        continue;
      }
      moving = true;
      cloud.visible = true;
      this.placeCrossing(
        cloud,
        crossingOf(i, Math.floor(shifted / cycle.cycleTicks)),
        phase / CLOUD_CROSS_TICKS,
      );
    }
    this.cloudMovingValue = moving;
  }

  /** Shapes one cloud for its crossing and puts it `t` of the way across, so that its *shadow* runs along the lane. */
  private placeCrossing(cloud: Mesh, crossing: CloudCrossing, t: number): void {
    const silhouette = CLOUD_SILHOUETTES[crossing.silhouette];
    if (silhouette === undefined) {
      return;
    }
    const texture = cloudTexture(crossing.silhouette);
    const material = cloud.material as MeshBasicMaterial;
    if (texture !== null && material.map !== texture) {
      material.map = texture;
      (cloud.customDepthMaterial as MeshDepthMaterial).map = texture;
    }
    const h = this.frameHeight;
    const width = silhouette.width * h * crossing.scale;
    const depth = silhouette.depth * h * crossing.scale;
    cloud.scale.set(width, depth, 1);
    // Enter fully off the west edge, leave fully off the east one — measured on the shadow.
    const shadowX = -width / 2 + (this.frameWidth + width) * t;
    const shadowZ = h * (crossing.lane + crossing.drift * (t - 0.5));
    cloud.position.set(shadowX - this.shadowOffsetX, CLOUD_HEIGHT, shadowZ - this.shadowOffsetZ);
  }

  /** Whether any cloud is currently visible and crossing — the shadow map needs a fresh render while it is. */
  get cloudMoving(): boolean {
    return this.cloudMovingValue;
  }

  /** Alois's lantern follows him; out when he is dead. */
  syncLantern(x: number, z: number, lit: boolean): void {
    this.lantern.position.set(x, 16, z);
    this.lantern.intensity = lit ? LANTERN_INTENSITY[this.rig] : 0;
  }

  /** Hands out the shot lights in order; `count` used this frame, the rest go dark. */
  shotLight(slot: number): PointLight | null {
    return this.shotLights[slot] ?? null;
  }

  dimShotLightsFrom(count: number): void {
    for (let i = count; i < SHOT_LIGHT_COUNT; i++) {
      const light = this.shotLights[i];
      if (light !== undefined) {
        light.intensity = 0;
      }
    }
  }

  get backgroundColour(): number {
    return RIGS[this.rig].background;
  }
}

function defaultBulbs(
  frameWidth: number,
  frameHeight: number,
): readonly { readonly x: number; readonly y: number }[] {
  return [
    { x: frameWidth * 0.3, y: frameHeight * 0.45 },
    { x: frameWidth * 0.7, y: frameHeight * 0.45 },
  ];
}

/**
 * The shadow map's resolution — 640×360 is the whole game's internal frame,
 * so 1024² is already 4.5× that frame's own pixel count; the 2048² this
 * replaced was 18× it, re-rendered every frame for content that is static
 * within a room (`docs/PERFORMANCE_AUDIT.md` F6). `GameView` also turns off
 * `renderer.shadowMap.autoUpdate` and only asks for a fresh render on the
 * frames something the key light shadows actually moved.
 */
export const SHADOW_MAP_SIZE = 1024;

/** Which silhouette, how big, and which lane one crossing takes — see `crossingOf`. */
interface CloudCrossing {
  readonly silhouette: number;
  /** Size multiplier on the silhouette's own dimensions, 0.8-1.2. */
  readonly scale: number;
  /** Where the shadow's centre runs, as a fraction of the room's depth (0 = north wall). */
  readonly lane: number;
  /** How far the lane drifts north (-) or south (+) over the crossing, same units. */
  readonly drift: number;
}

/**
 * Cloud `cloud`'s `n`th crossing, deterministically: a small integer hash of
 * the pair, so every crossing looks different but a replay's are the same.
 * The lane spans the whole room — north wall to south — which is the point:
 * a shadow the player can be caught in anywhere, not only up by the back wall.
 */
export function crossingOf(cloud: number, n: number): CloudCrossing {
  let state = (Math.imul(cloud + 1, 0x9e3779b1) ^ Math.imul(n + 1, 0x85ebca77)) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  return {
    silhouette: Math.floor(next() * CLOUD_SILHOUETTES.length),
    scale: 0.8 + next() * 0.4,
    lane: 0.12 + next() * 0.76,
    drift: (next() * 2 - 1) * CLOUD_DRIFT,
  };
}

interface Puff {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * The cloud shapes a crossing picks from. `puffs` are painted into a square
 * texture (unit coordinates); `width`/`depth` are the plane's size in units of
 * the room's depth, which stretches that square into the silhouette's
 * proportions — so a streak's puffs are drawn tall and round and come out
 * long and low on the floor.
 */
const CLOUD_SILHOUETTES: readonly {
  readonly width: number;
  readonly depth: number;
  readonly puffs: readonly Puff[];
}[] = [
  // A broad cumulus — the original shape.
  {
    width: 1.3,
    depth: 0.6,
    puffs: [
      { x: 0.32, y: 0.48, r: 0.24 },
      { x: 0.5, y: 0.4, r: 0.27 },
      { x: 0.68, y: 0.5, r: 0.22 },
      { x: 0.42, y: 0.6, r: 0.19 },
      { x: 0.6, y: 0.62, r: 0.18 },
      { x: 0.24, y: 0.56, r: 0.14 },
      { x: 0.78, y: 0.42, r: 0.13 },
      { x: 0.55, y: 0.52, r: 0.2 },
      { x: 0.37, y: 0.38, r: 0.12 },
    ],
  },
  // A small, round puff.
  {
    width: 0.75,
    depth: 0.6,
    puffs: [
      { x: 0.5, y: 0.5, r: 0.28 },
      { x: 0.33, y: 0.55, r: 0.2 },
      { x: 0.67, y: 0.55, r: 0.2 },
      { x: 0.42, y: 0.35, r: 0.18 },
      { x: 0.6, y: 0.37, r: 0.17 },
      { x: 0.5, y: 0.68, r: 0.17 },
      { x: 0.25, y: 0.45, r: 0.12 },
      { x: 0.76, y: 0.44, r: 0.12 },
    ],
  },
  // A long, low streak with a ragged tail.
  {
    width: 1.7,
    depth: 0.4,
    puffs: [
      { x: 0.1, y: 0.6, r: 0.08 },
      { x: 0.2, y: 0.55, r: 0.14 },
      { x: 0.32, y: 0.45, r: 0.2 },
      { x: 0.46, y: 0.5, r: 0.24 },
      { x: 0.6, y: 0.42, r: 0.2 },
      { x: 0.72, y: 0.55, r: 0.18 },
      { x: 0.84, y: 0.5, r: 0.12 },
      { x: 0.4, y: 0.64, r: 0.16 },
      { x: 0.56, y: 0.63, r: 0.15 },
    ],
  },
];

/**
 * Soft cloud silhouettes painted into canvases, one per `CLOUD_SILHOUETTES`
 * entry, or null with no DOM (the headless bench). Built once and shared
 * across every `Lighting` instance — but only a *successful* build is cached:
 * a `Lighting` constructed before a DOM exists (this module loading in a
 * worker, a test's own sequencing) leaves the next one free to try again,
 * rather than a transient "no DOM yet" wrongly becoming a permanent "no cloud
 * ever" for the whole process.
 */
const sharedCloudTextures: (CanvasTexture | undefined)[] = [];

function cloudTexture(index: number): CanvasTexture | null {
  const cached = sharedCloudTextures[index];
  if (cached !== undefined) {
    return cached;
  }
  const silhouette = CLOUD_SILHOUETTES[index];
  if (silhouette === undefined || typeof document === 'undefined') {
    return null;
  }
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    return null;
  }
  // A union of many solid lobes, not soft gradients — the shadow's
  // `alphaTest` cut then lands on a hard, unmistakably lumpy contour rather
  // than somewhere on a gradient's falloff where the shape could read as a
  // rounded rectangle (#11). The shadow map's own filtering is what softens
  // the edge on the floor. A faint outer haze (`blur`) rounds the union's
  // concave joins so it never looks like tiled circles either.
  context.filter = 'blur(3px)';
  for (const puff of silhouette.puffs) {
    context.beginPath();
    context.arc(puff.x * size, puff.y * size, puff.r * size, 0, Math.PI * 2);
    context.fillStyle = 'rgba(0,0,0,1)';
    context.fill();
  }
  context.filter = 'none';
  const texture = new CanvasTexture(canvas);
  sharedCloudTextures[index] = texture;
  return texture;
}

/** A unit-square cloud plane, shaped and positioned per crossing by `Lighting.placeCrossing` rather than rebuilt. */
function buildCloudMesh(): Mesh | null {
  const texture = cloudTexture(0);
  if (texture === null) {
    return null;
  }
  // `alphaTest` has to be on the mesh's *own* material, not only on the
  // custom depth material: three.js's shadow pass copies `material.alphaTest`
  // (and `map`) onto whatever depth material it uses, custom or not
  // (`WebGLShadowMap.getDepthMaterial`). With it left at 0 here, the depth
  // material's 0.5 was overwritten every frame and the whole square plane cast
  // its shadow — the "cloud is a box" bug. The plane itself is never seen
  // (opacity 0), so the cut changes nothing on screen, only in the shadow.
  const material = new MeshBasicMaterial({
    map: texture,
    alphaTest: 0.5,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
  });
  const cloud = new Mesh(new PlaneGeometry(1, 1), material);
  cloud.customDepthMaterial = new MeshDepthMaterial({
    depthPacking: RGBADepthPacking,
    map: texture,
    alphaTest: 0.5,
  });
  cloud.castShadow = true;
  cloud.rotation.x = -Math.PI / 2;
  cloud.position.y = CLOUD_HEIGHT;
  cloud.visible = false;
  return cloud;
}
