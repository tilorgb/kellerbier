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
  SphereGeometry,
  CylinderGeometry,
  CanvasTexture,
} from 'three';
import { TICKS_PER_SECOND } from '../../sim/time.js';

/**
 * Light. The reason the room is 3D.
 *
 * ## Two rigs
 *
 * A floor is either a **cellar** — dark, lit by the bulbs that hang in it,
 * every one a real point light with a cord and a glass — or under
 * **daylight**: a sky, a sun that casts the shadows, and a cloud that drifts
 * across the room every fifty seconds and takes the light with it. The
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
export type LightingRig = 'cellar' | 'daylight';

/** Point lights riding along with live player shots. */
export const SHOT_LIGHT_COUNT = 8;

/**
 * How many door glows can be lit across the whole scene at once.
 *
 * A `DoorPiece` owns one for its whole lifetime (constructed with the door,
 * released when the door is disposed). Two things can hold doors at once:
 * the room-transition slide (the outgoing room, mid-slide, alongside the
 * incoming one), and — since #293 — `SceneryCache` keeping up to
 * `SCENERY_CACHE_CAPACITY` recently-visited rooms' whole `Scenery` alive
 * (doors included) so a revisit rebuilds nothing. Measured across 300
 * generated floors on both authored floor tags
 * (`tests/unit/lighting-pool.test.ts` pins the measurement), the worst room
 * had 5 doors and the 4+ case was under 1% of rooms; typical is 1–3. 12
 * covers `SCENERY_CACHE_CAPACITY` (4) cached rooms at 3 doors each with
 * headroom for the slide's extra room on top — a deliberately larger
 * constant than tier 1 alone would have wanted (every point light is a
 * per-fragment loop iteration — see F7), traded for not rebuilding a cached
 * room's doors just to keep the pool small. Overflow beyond that still
 * degrades gracefully — `acquireDoorGlow` returns `null` and the door just
 * doesn't glow (`docs/DECISIONS.md` #19) — rather than reintroducing the
 * count churn this pool exists to remove.
 */
export const MAX_DOOR_GLOWS = 12;

/**
 * How many bulb rigs (light + glass + cord) a cellar room can light at once.
 * Authored content has never used more than one `bulb` prop; the unauthored
 * default is two. 6 is headroom for content growth, not a measured ceiling.
 */
export const MAX_ROOM_BULBS = 6;

const BULB_HEIGHT = 34;
const CLOUD_HEIGHT = 90;
const CLOUD_CYCLE_TICKS = TICKS_PER_SECOND * 50;
const CLOUD_CROSS_TICKS = TICKS_PER_SECOND * 16;
const DOOR_GLOW_COLOUR = 0xff9a3c;

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
};

interface BulbRig {
  readonly light: PointLight;
  readonly glass: Mesh;
  readonly cord: Mesh;
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
  /** Fixed pool of bulb rigs — see `MAX_ROOM_BULBS`. Reassigned wholesale by `onRoomChanged`, not acquired/released. */
  private readonly bulbRigs: BulbRig[] = [];
  private warnedBulbOverflow = false;
  /** One persistent cloud mesh, repositioned and resized per room rather than rebuilt — see `positionCloud`. */
  private readonly cloud: Mesh | null;
  private cloudSpanX = 0;
  private cloudCentreZ = 0;
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
    for (let i = 0; i < MAX_ROOM_BULBS; i++) {
      this.bulbRigs.push(this.buildBulbRig());
    }
    this.cloud = buildCloudMesh();
    if (this.cloud !== null) {
      scene.add(this.cloud);
    }
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  /**
   * Re-lights for a room: which rig, where its bulbs hang, how big it is (for
   * the key light's shadow frustum and the cloud's run).
   */
  onRoomChanged(
    rig: LightingRig,
    frameWidth: number,
    frameHeight: number,
    bulbs: readonly { readonly x: number; readonly y: number }[],
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
    shadow.left = -frameWidth * 0.75;
    shadow.right = frameWidth * 0.75;
    shadow.top = frameHeight * 0.9;
    shadow.bottom = -frameHeight * 0.9;
    shadow.near = 50;
    shadow.far = 700;
    shadow.updateProjectionMatrix();

    if (rig === 'cellar') {
      this.hideCloud();
      this.setBulbs(bulbs.length > 0 ? bulbs : defaultBulbs(frameWidth, frameHeight));
    } else {
      this.setBulbs([]);
      this.positionCloud(frameWidth, frameHeight);
    }
  }

  /** Lights exactly `placed.length` bulb rigs (clamped to the pool) and dims the rest. */
  private setBulbs(placed: readonly { readonly x: number; readonly y: number }[]): void {
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
      rig.light.intensity = 9000;
      rig.glass.position.copy(rig.light.position);
      rig.glass.visible = true;
      rig.cord.position.set(bulb.x, BULB_HEIGHT + 22, bulb.y);
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

  private buildBulbRig(): BulbRig {
    const light = new PointLight(0xffb870, 0, 300, 2);
    light.layers.enableAll();
    this.scene.add(light);
    const glass = new Mesh(
      new SphereGeometry(2, 10, 8),
      new MeshBasicMaterial({ color: 0xfff1c8 }),
    );
    glass.visible = false;
    this.scene.add(glass);
    const cord = new Mesh(
      new CylinderGeometry(0.4, 0.4, 40, 4),
      new MeshBasicMaterial({ color: 0x141018 }),
    );
    cord.visible = false;
    this.scene.add(cord);
    return { light, glass, cord };
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
   * Re-parents the light directly onto the scene root: a `DoorPiece` adds
   * its glow as a child of its own group (so it tracks the room's
   * transition-slide translation while the door is live), and that group is
   * about to be disposed. Left as a child of it, the light would be pulled
   * out of the scene graph along with it — invisible to three.js's light
   * traversal, which is exactly the "count changed" bug this pool exists to
   * prevent, just via a different door.
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
    light.position.set(0, 0, 0);
    this.scene.add(light);
    this.doorGlowFree[index] = true;
  }

  private hideCloud(): void {
    if (this.cloud !== null) {
      this.cloud.visible = false;
    }
    this.cloudMovingValue = false;
  }

  /** Sizes and places the persistent cloud mesh for this room, rather than rebuilding its geometry. */
  private positionCloud(frameWidth: number, frameHeight: number): void {
    const cloud = this.cloud;
    if (cloud === null) {
      return;
    }
    const width = frameWidth * 0.85;
    const depth = frameHeight * 0.6;
    cloud.scale.set(width, depth, 1);
    this.cloudSpanX = frameWidth + width;
    this.cloudCentreZ = frameHeight / 2;
    cloud.position.set(-width, CLOUD_HEIGHT, frameHeight / 2);
  }

  /** Drives the cloud along its cycle. Pure function of the tick, so a replay clouds over at the same moment. */
  sync(tick: number): void {
    const cloud = this.cloud;
    if (cloud === null || this.rig !== 'daylight') {
      return;
    }
    const phase = tick % CLOUD_CYCLE_TICKS;
    if (phase >= CLOUD_CROSS_TICKS || this.reducedMotion) {
      cloud.visible = false;
      this.cloudMovingValue = false;
      return;
    }
    cloud.visible = true;
    this.cloudMovingValue = true;
    const t = phase / CLOUD_CROSS_TICKS;
    const width = cloud.scale.x;
    cloud.position.set(-width / 2 + this.cloudSpanX * t, CLOUD_HEIGHT, this.cloudCentreZ);
  }

  /** Whether the cloud is currently visible and crossing — the shadow map needs a fresh render while it is. */
  get cloudMoving(): boolean {
    return this.cloudMovingValue;
  }

  /** Alois's lantern follows him; out when he is dead. */
  syncLantern(x: number, z: number, lit: boolean): void {
    this.lantern.position.set(x, 16, z);
    this.lantern.intensity = lit ? (this.rig === 'cellar' ? 420 : 120) : 0;
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

/**
 * A soft cloud silhouette painted into a canvas, or null with no DOM (the
 * headless bench). Built once and shared across every `Lighting` instance —
 * but only a *successful* build is cached: a `Lighting` constructed before a
 * DOM exists (this module loading in a worker, a test's own sequencing)
 * leaves the next one free to try again, rather than a transient "no DOM
 * yet" wrongly becoming a permanent "no cloud ever" for the whole process.
 */
let sharedCloudTexture: CanvasTexture | null = null;

function cloudTexture(): CanvasTexture | null {
  if (sharedCloudTexture !== null) {
    return sharedCloudTexture;
  }
  if (typeof document === 'undefined') {
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
  context.fillStyle = 'rgba(0,0,0,1)';
  for (const puff of CLOUD_PUFFS) {
    const gradient = context.createRadialGradient(
      puff.x * size,
      puff.y * size,
      0,
      puff.x * size,
      puff.y * size,
      puff.r * size,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.7, 'rgba(0,0,0,0.9)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  sharedCloudTexture = new CanvasTexture(canvas);
  return sharedCloudTexture;
}

/** A unit-square cloud plane, scaled and positioned per room by `positionCloud` rather than rebuilt. */
function buildCloudMesh(): Mesh | null {
  const texture = cloudTexture();
  if (texture === null) {
    return null;
  }
  const material = new MeshBasicMaterial({
    map: texture,
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
  cloud.visible = false;
  return cloud;
}

const CLOUD_PUFFS: readonly { readonly x: number; readonly y: number; readonly r: number }[] = [
  { x: 0.3, y: 0.5, r: 0.22 },
  { x: 0.5, y: 0.42, r: 0.26 },
  { x: 0.7, y: 0.52, r: 0.2 },
  { x: 0.45, y: 0.6, r: 0.18 },
  { x: 0.6, y: 0.6, r: 0.16 },
];
