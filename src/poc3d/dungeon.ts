import * as THREE from 'three';
import { ROOM_TILE_UNITS } from '../content/rooms/definition.js';
import { CollisionLayer } from '../sim/collision/layers.js';
import { World } from '../sim/ecs/world.js';
import type { GameSim } from '../sim/game/sim.js';
import { lerp } from '../sim/math.js';
import { ProjectileTeam } from '../sim/projectile/store.js';
import { BLOCK_STRIDE, DOOR_SPAN, type RoomGeometry, roomFrameSize } from '../sim/room/geometry.js';
import { type CompiledDoor, doorCentre } from '../sim/room/template.js';
import { ENEMY_STRIDE } from '../sim/systems/enemy.js';
import { AnimationState, type CompiledAnimationSet } from '../render/animation/definition.js';
import {
  PLAYER_FACING_IDS,
  type PlayerHeading,
  PlayerFacing,
  resolveAnimationState,
  resolveFacing,
  resolvePlayerAnimationState,
  resolvePlayerHeading,
  schlauchOctant,
} from '../render/animation/state.js';
import { ACTOR_PIXELS_PER_UNIT, INTERNAL_HEIGHT, INTERNAL_WIDTH } from '../render/resolution.js';
import type { SpriteSheet } from './art.js';

/**
 * The 3D dungeon the 2D game is drawn into.
 *
 * ## The one idea
 *
 * The simulation is untouched and still two-dimensional: a sim `(x, y)` in
 * room units becomes a three.js `(x, 0, y)` on a floor plane at height 0, so
 * every collider, door, block and spawn is exactly where it always was and the
 * game plays identically. What changes is that the room *around* those
 * positions has volume — walls have height, blocks are boxes, the floor
 * receives light and shadow — and the characters are the authored pixel
 * sprites, standing up in that room as billboards. Fixed camera, same frame:
 * the perspective preset frames the room the way the 2D game does, so a `1x1`
 * room still fills the screen and nothing scrolls.
 *
 * ## Units
 *
 * Room units throughout, one unit = one sim pixel. `docs/DECISIONS.md` #45
 * says a sprite's canvas is its size on the 640×360 frame, and the world is
 * drawn at `WORLD_ZOOM` 2 — so a 20×32 px Alois is a 10×16 unit billboard,
 * and at the default internal resolution his texels come out ~1:1 with
 * screen pixels, same as the Pixi renderer.
 */

/** Height of the back and side walls, in room units. The front wall is a kerb — see `buildWalls`. */
const WALL_HEIGHT = 26;
const FRONT_WALL_HEIGHT = 5;
const WALL_THICKNESS = ROOM_TILE_UNITS;
/** How far past the room the dark wall base extends, so a letterboxed viewport never shows void. */
const BLEED = ROOM_TILE_UNITS * 6;
const BLOCK_HEIGHT = 13;
const CRATE_HEIGHT = 11;
const BULB_HEIGHT = 34;

/** Point lights riding along with live player shots — the "throwing things lights the room" effect. */
const SHOT_LIGHT_COUNT = 8;

const UNITS_PER_PIXEL = 1 / ACTOR_PIXELS_PER_UNIT;

const ROOM_UP = new THREE.Vector3(0, 1, 0);
const SCRATCH_MATRIX = new THREE.Matrix4();
const SCRATCH_POSITION = new THREE.Vector3();
const SCRATCH_QUATERNION = new THREE.Quaternion();
const SCRATCH_SCALE = new THREE.Vector3();
const SCRATCH_COLOR = new THREE.Color();
const SCRATCH_PROJECT = new THREE.Vector3();

export type CameraPresetId = 'perspective' | 'top-down' | 'low';

export const CAMERA_PRESETS: readonly CameraPresetId[] = ['perspective', 'top-down', 'low'];

interface CameraPreset {
  /** Elevation above the floor plane, radians. π/2 is straight down — the 2D game. */
  readonly elevation: number;
  readonly fov: number;
  readonly orthographic: boolean;
}

const PRESETS: Readonly<Record<CameraPresetId, CameraPreset>> = {
  perspective: { elevation: THREE.MathUtils.degToRad(56), fov: 34, orthographic: false },
  'top-down': { elevation: Math.PI / 2, fov: 0, orthographic: true },
  low: { elevation: THREE.MathUtils.degToRad(38), fov: 30, orthographic: false },
};

/**
 * Which tile each floor-1 decorative prop is drawn as, and how. The Pixi
 * renderer has `PROP_TILE_NAMES` for the same job (`render/floor-art.ts`);
 * this is that table for the props the POC gives a *shape* to rather than a
 * flat tile — a crate is a box now, and a bulb is a real light.
 */
const CRATE_PROPS: Readonly<Record<string, string>> = {
  'crate-opa': 'crate-opa',
  'crate-neu': 'crate-neu',
  'crate-stack': 'crate-stack',
};

const FLAT_PROPS: Readonly<Record<string, string>> = {
  'boss-plate': 'boss-plate',
  pedestal: 'pedestal',
  'shopkeeper-stand': 'shopkeeper-stand',
};

/** Floor 1's destructible prop art, by `DESTRUCTIBLE_PROP_KINDS` index — `FLOOR_TILESETS[1].destructibles`. */
const DESTRUCTIBLES = ['cellar-barrel'];
const BLOCK_VARIANTS = [
  'cellar-boulder-1',
  'cellar-boulder-2',
  'cellar-boulder-3',
  'cellar-boulder-4',
];

/**
 * One pooled billboard: a unit quad anchored at its bottom-centre, with its
 * own UV attribute so it can show any frame of any sheet without touching
 * the shared texture. `depth` is what the shadow pass draws it with, so the
 * shadow it casts has the sprite's silhouette rather than the quad's.
 */
class BillboardSlot {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly depth: THREE.MeshDepthMaterial;
  private readonly uv: THREE.BufferAttribute;
  private sheet: SpriteSheet | null = null;
  private frame = -1;
  private mirrored = false;

  constructor() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    const material = new THREE.MeshStandardMaterial({
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0,
      emissive: 0x000000,
    });
    this.depth = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.customDepthMaterial = this.depth;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  }

  show(
    sheet: SpriteSheet,
    frame: number,
    mirrored: boolean,
    x: number,
    y: number,
    z: number,
    lean: number,
    flash: boolean,
    scale = 1,
  ): void {
    const mesh = this.mesh;
    mesh.visible = true;
    if (this.sheet !== sheet) {
      this.sheet = sheet;
      const hadMap = mesh.material.map !== null;
      mesh.material.map = sheet.texture;
      this.depth.map = sheet.texture;
      if (!hadMap) {
        mesh.material.needsUpdate = true;
        this.depth.needsUpdate = true;
      }
      this.frame = -1;
    }
    if (this.frame !== frame || this.mirrored !== mirrored) {
      this.frame = frame;
      this.mirrored = mirrored;
      let u0 = frame / sheet.frames;
      let u1 = (frame + 1) / sheet.frames;
      if (mirrored) {
        const swap = u0;
        u0 = u1;
        u1 = swap;
      }
      // PlaneGeometry's corners run top-left, top-right, bottom-left, bottom-right.
      this.uv.setX(0, u0);
      this.uv.setX(1, u1);
      this.uv.setX(2, u0);
      this.uv.setX(3, u1);
      this.uv.needsUpdate = true;
    }
    mesh.scale.set(
      sheet.frameWidth * UNITS_PER_PIXEL * scale,
      sheet.frameHeight * UNITS_PER_PIXEL * scale,
      1,
    );
    mesh.position.set(x, y, z);
    mesh.rotation.x = lean;
    mesh.material.emissive.setScalar(flash ? 1 : 0);
  }

  hide(): void {
    this.mesh.visible = false;
  }
}

/** Which frame of `clips` a body in `state` shows, `elapsedMs` after entering that state. */
function frameAt(clips: CompiledAnimationSet, state: number, elapsedMs: number): number {
  const clip = clips.clips[state] ?? clips.idle;
  let t = elapsedMs;
  if (clip.repeats) {
    t %= clip.totalMs;
  } else if (t >= clip.totalMs) {
    // A finished one-shot holds its last frame, or hands back to idle.
    return clip.holds
      ? (clip.sequence[clip.sequence.length - 1] ?? 0)
      : frameAt(clips, AnimationState.Idle, elapsedMs - clip.totalMs);
  }
  for (let i = 0; i < clip.sequence.length; i++) {
    t -= clip.durations[i] ?? 0;
    if (t < 0) {
      return clip.sequence[i] ?? 0;
    }
  }
  return clip.sequence[clip.sequence.length - 1] ?? 0;
}

function tileTexture(sheet: SpriteSheet, repeatX: number, repeatY: number): THREE.Texture {
  const texture = sheet.texture.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.needsUpdate = true;
  return texture;
}

/**
 * A textured box whose texture tiles at one authored tile per
 * `ROOM_TILE_UNITS` on every face — so a three-tile wall run shows three
 * tiles rather than one stretched across it.
 */
function tiledBox(
  sheet: SpriteSheet,
  width: number,
  height: number,
  depth: number,
  topSheet: SpriteSheet = sheet,
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const side = (w: number, h: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({
      map: tileTexture(sheet, w / ROOM_TILE_UNITS, h / ROOM_TILE_UNITS),
      roughness: 0.95,
    });
  const top = new THREE.MeshStandardMaterial({
    map: tileTexture(topSheet, width / ROOM_TILE_UNITS, depth / ROOM_TILE_UNITS),
    roughness: 0.95,
  });
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z.
  const mesh = new THREE.Mesh(geometry, [
    side(depth, height),
    side(depth, height),
    top,
    top,
    side(width, height),
    side(width, height),
  ]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class Dungeon {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  presetId: CameraPresetId = 'perspective';

  private readonly sim: GameSim;
  private readonly sheets: Readonly<Record<string, SpriteSheet>>;
  private readonly fallbackSheet: SpriteSheet;

  private roomGroup = new THREE.Group();
  private roomGeometry: RoomGeometry | null = null;
  private doorsLocked = false;
  private roomWidth = 0;
  private roomHeight = 0;

  private readonly slots: BillboardSlot[] = [];
  private readonly playerBody = new BillboardSlot();
  private readonly playerSchlauch = new BillboardSlot();
  private readonly heading: PlayerHeading = { facing: PlayerFacing.South, mirror: 1 };
  /** Per entity slot: the animation state it was last seen in, and when it entered it. */
  private readonly entityState: Uint8Array;
  private readonly entityStateSince: Float64Array;
  private playerState = -1;
  private playerStateSince = 0;

  private readonly shots: THREE.InstancedMesh;
  private readonly shotLights: THREE.PointLight[] = [];
  private readonly sparks: THREE.InstancedMesh;

  private readonly key: THREE.DirectionalLight;
  private readonly lantern: THREE.PointLight;
  private readonly bulbs = new THREE.Group();

  private lean = 0;

  constructor(
    canvas: HTMLCanvasElement,
    sim: GameSim,
    sheets: Readonly<Record<string, SpriteSheet>>,
  ) {
    this.sim = sim;
    this.sheets = sheets;
    const fallback = sheets.foam;
    if (fallback === undefined) {
      throw new Error('vfx/foam.png missing — nothing to draw an un-drawn creature as');
    }
    this.fallbackSheet = fallback;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(INTERNAL_WIDTH, INTERNAL_HEIGHT, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene.background = new THREE.Color(0x07060a);
    this.scene.add(new THREE.AmbientLight(0x7a6c88, 1.3));
    this.scene.add(new THREE.HemisphereLight(0x8a7aa0, 0x3a2a1a, 0.5));

    this.key = new THREE.DirectionalLight(0xffe2b8, 2.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.6;
    this.scene.add(this.key);
    this.scene.add(this.key.target);

    this.lantern = new THREE.PointLight(0xffd9a6, 420, 120, 2);
    this.scene.add(this.lantern);
    this.scene.add(this.bulbs);

    this.entityState = new Uint8Array(sim.world.capacity);
    this.entityStateSince = new Float64Array(sim.world.capacity);

    this.scene.add(this.playerBody.mesh);
    this.scene.add(this.playerSchlauch.mesh);
    // The Schlauch is a nozzle held in front of the body; it casts no shadow of its own.
    this.playerSchlauch.mesh.castShadow = false;

    const shotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.shots = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 8),
      shotMaterial,
      sim.projectiles.capacity,
    );
    this.shots.count = 0;
    this.shots.frustumCulled = false;
    this.scene.add(this.shots);
    for (let i = 0; i < SHOT_LIGHT_COUNT; i++) {
      const light = new THREE.PointLight(0xffb347, 0, 70, 2);
      this.shotLights.push(light);
      this.scene.add(light);
    }

    this.sparks = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      sim.particles.capacity,
    );
    this.sparks.count = 0;
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);

    this.camera = new THREE.PerspectiveCamera(30, INTERNAL_WIDTH / INTERNAL_HEIGHT, 1, 2000);
    this.scene.add(this.roomGroup);
    this.rebuildRoom();
  }

  /** Internal render resolution — the canvas's own pixel size, before CSS scales it up. */
  setResolution(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.fitCamera();
  }

  setPreset(id: CameraPresetId): void {
    this.presetId = id;
    this.fitCamera();
  }

  /** Called once per rendered frame, after the sim has stepped. */
  sync(alpha: number, nowMs: number): void {
    if (this.sim.room !== this.roomGeometry || this.sim.doorsLocked !== this.doorsLocked) {
      this.rebuildRoom();
    }
    this.syncPlayer(alpha, nowMs);
    this.syncEntities(alpha, nowMs);
    this.syncProjectiles(alpha);
    this.syncParticles(alpha);
    this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------- room

  private rebuildRoom(): void {
    const room = this.sim.room;
    this.roomGeometry = room;
    this.doorsLocked = this.sim.doorsLocked;
    this.scene.remove(this.roomGroup);
    this.roomGroup = new THREE.Group();
    this.scene.add(this.roomGroup);
    this.bulbs.clear();

    const frame = roomFrameSize(room);
    this.roomWidth = frame.width;
    this.roomHeight = frame.height;

    const floorSheet = this.sheet('cellar-floor');
    const wallSheet = this.sheet('cellar-wall');
    const lipSheet = this.sheet('cellar-wall-lip');

    // The floor the game is played on: the interior, one authored tile per cell.
    const interiorW = room.maxX - room.minX;
    const interiorH = room.maxY - room.minY;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(interiorW, interiorH),
      new THREE.MeshStandardMaterial({
        map: tileTexture(floorSheet, interiorW / ROOM_TILE_UNITS, interiorH / ROOM_TILE_UNITS),
        roughness: 0.85,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.minX + interiorW / 2, 0, room.minY + interiorH / 2);
    floor.receiveShadow = true;
    this.roomGroup.add(floor);

    // The dark wall base under and beyond the walls, so nothing outside the room is void.
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(frame.width + BLEED * 2, frame.height + BLEED * 2),
      new THREE.MeshStandardMaterial({
        map: tileTexture(
          wallSheet,
          (frame.width + BLEED * 2) / ROOM_TILE_UNITS,
          (frame.height + BLEED * 2) / ROOM_TILE_UNITS,
        ),
        color: 0x555555,
        roughness: 1,
      }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(frame.width / 2, -0.05, frame.height / 2);
    base.receiveShadow = true;
    this.roomGroup.add(base);

    this.buildWalls(room, wallSheet, lipSheet);
    this.buildBlocks(room);
    this.buildPuddles(room);
    this.buildProps();

    // Key light from high on the camera's own side, a touch east of centre:
    // the back wall's inner face — the one the camera looks at — is lit, the
    // side walls' shadows fall *outside* the room rather than across its
    // floor, and every body's shadow lands behind it, up-screen.
    this.key.position.set(frame.width * 0.62, 240, frame.height * 1.9);
    this.key.target.position.set(frame.width / 2, 0, frame.height / 2);
    const shadowCamera = this.key.shadow.camera;
    shadowCamera.left = -frame.width * 0.7;
    shadowCamera.right = frame.width * 0.7;
    shadowCamera.top = frame.height * 0.8;
    shadowCamera.bottom = -frame.height * 0.8;
    shadowCamera.near = 50;
    shadowCamera.far = 500;
    shadowCamera.updateProjectionMatrix();

    this.fitCamera();
  }

  private buildWalls(room: RoomGeometry, wall: SpriteSheet, lip: SpriteSheet): void {
    const doors = this.sim.doors;
    const gaps = (direction: CompiledDoor['direction']): { at: number; span: number }[] =>
      doors
        .filter((door) => door.direction === direction)
        .map((door) => {
          const centre = doorCentre(room, door);
          return {
            at: direction === 'north' || direction === 'south' ? centre.x : centre.y,
            span: door.span ?? DOOR_SPAN,
          };
        })
        .sort((a, b) => a.at - b.at);

    const run = (
      from: number,
      to: number,
      height: number,
      direction: CompiledDoor['direction'],
      place: (start: number, length: number) => THREE.Vector3,
    ): void => {
      let cursor = from;
      for (const gap of gaps(direction)) {
        const gapStart = gap.at - gap.span / 2;
        const gapEnd = gap.at + gap.span / 2;
        if (gapStart > cursor) {
          this.addWallSegment(
            wall,
            lip,
            place(cursor, gapStart - cursor),
            gapStart - cursor,
            height,
            direction,
          );
        }
        this.addDoorway(place(gapStart, gap.span), gap.span, height, direction);
        cursor = gapEnd;
      }
      if (to > cursor) {
        this.addWallSegment(wall, lip, place(cursor, to - cursor), to - cursor, height, direction);
      }
    };

    const t = WALL_THICKNESS;
    // Back wall (north): full height, the one the camera looks at.
    run(
      room.minX - t,
      room.maxX + t,
      WALL_HEIGHT,
      'north',
      (start, length) => new THREE.Vector3(start + length / 2, 0, room.minY - t / 2),
    );
    // Front wall (south): a kerb, so it never hides the near rows of the floor.
    run(
      room.minX - t,
      room.maxX + t,
      FRONT_WALL_HEIGHT,
      'south',
      (start, length) => new THREE.Vector3(start + length / 2, 0, room.maxY + t / 2),
    );
    run(
      room.minY,
      room.maxY,
      WALL_HEIGHT,
      'west',
      (start, length) => new THREE.Vector3(room.minX - t / 2, 0, start + length / 2),
    );
    run(
      room.minY,
      room.maxY,
      WALL_HEIGHT,
      'east',
      (start, length) => new THREE.Vector3(room.maxX + t / 2, 0, start + length / 2),
    );
  }

  private addWallSegment(
    wall: SpriteSheet,
    lip: SpriteSheet,
    centre: THREE.Vector3,
    length: number,
    height: number,
    direction: CompiledDoor['direction'],
  ): void {
    const alongX = direction === 'north' || direction === 'south';
    const mesh = alongX
      ? tiledBox(wall, length, height, WALL_THICKNESS, lip)
      : tiledBox(wall, WALL_THICKNESS, height, length, lip);
    mesh.position.set(centre.x, height / 2, centre.z);
    this.roomGroup.add(mesh);
  }

  /**
   * A door gap: a dark passage receding into the wall, with a warm glow from
   * the room beyond when the doors are open, and a closed door standing in
   * it while the room's enemies are still up.
   */
  private addDoorway(
    centre: THREE.Vector3,
    span: number,
    height: number,
    direction: CompiledDoor['direction'],
  ): void {
    const alongX = direction === 'north' || direction === 'south';
    const passage = new THREE.Mesh(
      new THREE.BoxGeometry(
        alongX ? span : WALL_THICKNESS,
        Math.max(height, FRONT_WALL_HEIGHT),
        alongX ? WALL_THICKNESS : span,
      ),
      new THREE.MeshStandardMaterial({ color: 0x0b0810, roughness: 1 }),
    );
    // Recessed a whole wall thickness outward: the opening reads as a way out, not a black tile.
    const outward = direction === 'north' ? -1 : direction === 'south' ? 1 : 0;
    const outwardX = direction === 'west' ? -1 : direction === 'east' ? 1 : 0;
    passage.position.set(
      centre.x + outwardX * WALL_THICKNESS,
      Math.max(height, FRONT_WALL_HEIGHT) / 2,
      centre.z + outward * WALL_THICKNESS,
    );
    passage.receiveShadow = true;
    this.roomGroup.add(passage);

    if (this.doorsLocked) {
      const door = this.sheet('door-closed');
      const leaf = new THREE.Mesh(
        new THREE.PlaneGeometry(span, Math.max(height, ROOM_TILE_UNITS)),
        new THREE.MeshStandardMaterial({
          map: tileTexture(door, span / ROOM_TILE_UNITS, 1),
          side: THREE.DoubleSide,
          roughness: 0.8,
        }),
      );
      leaf.position.set(centre.x, Math.max(height, ROOM_TILE_UNITS) / 2, centre.z);
      if (!alongX) {
        leaf.rotation.y = Math.PI / 2;
      }
      leaf.castShadow = true;
      this.roomGroup.add(leaf);
    } else {
      const glow = new THREE.PointLight(0xff9a3c, 120, 60, 2);
      glow.position.set(centre.x, 8, centre.z);
      this.roomGroup.add(glow);
    }
  }

  private buildBlocks(room: RoomGeometry): void {
    const blocks = room.blocks;
    for (let i = 0; i < room.blockCount; i++) {
      const minX = blocks[i * BLOCK_STRIDE] ?? 0;
      const minY = blocks[i * BLOCK_STRIDE + 1] ?? 0;
      const maxX = blocks[i * BLOCK_STRIDE + 2] ?? 0;
      const maxY = blocks[i * BLOCK_STRIDE + 3] ?? 0;
      const furniture = (room.blockOverflyable[i] ?? 0) === 1;
      const height = furniture ? BLOCK_HEIGHT : WALL_HEIGHT;
      const variant = this.sheet(BLOCK_VARIANTS[i % BLOCK_VARIANTS.length] ?? 'cellar-boulder-1');
      const mesh = tiledBox(variant, maxX - minX, height, maxY - minY);
      mesh.position.set((minX + maxX) / 2, height / 2, (minY + maxY) / 2);
      this.roomGroup.add(mesh);
    }
  }

  /** A slick puddle is the one thing in the room that reflects: low roughness, so the lights glint off it. */
  private buildPuddles(room: RoomGeometry): void {
    const puddles = room.puddles;
    for (let i = 0; i < room.puddleCount; i++) {
      const minX = puddles[i * BLOCK_STRIDE] ?? 0;
      const minY = puddles[i * BLOCK_STRIDE + 1] ?? 0;
      const maxX = puddles[i * BLOCK_STRIDE + 2] ?? 0;
      const maxY = puddles[i * BLOCK_STRIDE + 3] ?? 0;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(maxX - minX, maxY - minY),
        new THREE.MeshStandardMaterial({
          color: 0x2a2418,
          roughness: 0.15,
          metalness: 0.6,
          transparent: true,
          opacity: 0.8,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((minX + maxX) / 2, 0.15, (minY + maxY) / 2);
      mesh.receiveShadow = true;
      this.roomGroup.add(mesh);
    }
  }

  private buildProps(): void {
    let bulbCount = 0;
    for (const prop of this.sim.roomDecorativeProps) {
      const crate = CRATE_PROPS[prop.type];
      if (crate !== undefined) {
        const mesh = tiledBox(this.sheet(crate), ROOM_TILE_UNITS, CRATE_HEIGHT, ROOM_TILE_UNITS);
        mesh.position.set(prop.x, CRATE_HEIGHT / 2, prop.y);
        this.roomGroup.add(mesh);
        continue;
      }
      const flat = FLAT_PROPS[prop.type];
      if (flat !== undefined) {
        const sheet = this.sheet(flat);
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(
            sheet.frameWidth * UNITS_PER_PIXEL,
            sheet.frameHeight * UNITS_PER_PIXEL,
          ),
          new THREE.MeshStandardMaterial({ map: sheet.texture, alphaTest: 0.5, roughness: 0.9 }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(prop.x, 0.1, prop.y);
        mesh.receiveShadow = true;
        this.roomGroup.add(mesh);
        continue;
      }
      if (prop.type === 'bulb') {
        this.addBulb(prop.x, prop.y);
        bulbCount += 1;
      }
    }
    // A cellar with no authored bulbs still gets lit like one.
    if (bulbCount === 0) {
      this.addBulb(this.roomWidth * 0.3, this.roomHeight * 0.45);
      this.addBulb(this.roomWidth * 0.7, this.roomHeight * 0.45);
    }
  }

  /** A bare bulb on a cord: a warm point light with a small emissive sphere where the glass is. */
  private addBulb(x: number, z: number): void {
    const light = new THREE.PointLight(0xffb870, 9000, 300, 2);
    light.position.set(x, BULB_HEIGHT, z);
    this.bulbs.add(light);
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(2, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff1c8 }),
    );
    glass.position.copy(light.position);
    this.bulbs.add(glass);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 40, 4),
      new THREE.MeshBasicMaterial({ color: 0x141018 }),
    );
    cord.position.set(x, BULB_HEIGHT + 22, z);
    this.bulbs.add(cord);
  }

  // -------------------------------------------------------------- camera

  /**
   * Places the fixed camera so the room's frame fills the internal
   * resolution — the same "one room, one screen" the 2D game has, with the
   * viewpoint tilted so the walls and lighting can read as depth.
   */
  private fitCamera(): void {
    const preset = PRESETS[this.presetId];
    const size = this.renderer.getSize(new THREE.Vector2());
    const aspect = size.x / size.y;
    const cx = this.roomWidth / 2;
    const cz = this.roomHeight / 2;

    if (preset.orthographic) {
      // Straight down, north up: exactly the frame the Pixi renderer draws.
      const halfH = this.roomHeight / 2;
      const halfW = halfH * aspect;
      const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 1, 600);
      camera.position.set(cx, 300, cz);
      camera.up.set(0, 0, -1);
      camera.lookAt(cx, 0, cz);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      this.camera = camera;
      this.lean = -Math.PI / 2 + 0.001;
      return;
    }

    const camera = new THREE.PerspectiveCamera(preset.fov, aspect, 1, 2000);
    const dir = new THREE.Vector3(0, Math.sin(preset.elevation), Math.cos(preset.elevation));
    // Aim a little north of the room's centre: the near wall is a kerb but the
    // far wall stands tall, so the interesting half of the frame is the top.
    const target = new THREE.Vector3(cx, 0, cz - this.roomHeight * 0.02);
    let distance = 300;
    const corners = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(this.roomWidth, 0, 0),
      new THREE.Vector3(0, 0, this.roomHeight),
      new THREE.Vector3(this.roomWidth, 0, this.roomHeight),
      new THREE.Vector3(0, WALL_HEIGHT, 0),
      new THREE.Vector3(this.roomWidth, WALL_HEIGHT, 0),
    ];
    for (let pass = 0; pass < 6; pass++) {
      camera.position.copy(target).addScaledVector(dir, distance);
      camera.up.copy(ROOM_UP);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      let extent = 0;
      for (const corner of corners) {
        SCRATCH_PROJECT.copy(corner).project(camera);
        extent = Math.max(extent, Math.abs(SCRATCH_PROJECT.x), Math.abs(SCRATCH_PROJECT.y));
      }
      distance *= extent / 0.985;
    }
    this.camera = camera;
    // Billboards lean back to face the camera square-on, so a sprite's
    // projected height is its authored height — no foreshortening.
    this.lean = -preset.elevation;
  }

  // ------------------------------------------------------------- bodies

  private sheet(name: string): SpriteSheet {
    return this.sheets[name] ?? this.fallbackSheet;
  }

  private slot(index: number): BillboardSlot {
    let slot = this.slots[index];
    if (slot === undefined) {
      slot = new BillboardSlot();
      this.slots.push(slot);
      this.scene.add(slot.mesh);
    }
    return slot;
  }

  private syncPlayer(alpha: number, nowMs: number): void {
    const sim = this.sim;
    const index = sim.playerIndex;
    const x = lerp(sim.previousX(index), sim.positionX(index), alpha);
    const y = lerp(sim.previousY(index), sim.positionY(index), alpha);
    const radius = sim.body.data[index * 2] ?? 4;

    const state = resolvePlayerAnimationState(sim);
    if (state !== this.playerState) {
      this.playerState = state;
      this.playerStateSince = nowMs;
    }
    resolvePlayerHeading(sim, this.heading);
    const body = this.sheet(`alois-${PLAYER_FACING_IDS[this.heading.facing]}`);
    const frame =
      body.clips === null ? 0 : frameAt(body.clips, state, nowMs - this.playerStateSince);
    const feetZ = y + radius * 0.5;
    const flash = sim.playerHurtTick >= 0 && sim.tick - sim.playerHurtTick < 4;
    this.playerBody.show(body, frame, this.heading.mirror < 0, x, 0.2, feetZ, this.lean, flash);

    const schlauch = this.sheet('alois-schlauch');
    const octant = schlauchOctant(sim.aimDirectionX, sim.aimDirectionY);
    // Held a little in front of the body along the view direction so depth
    // testing orders it over the body rather than fighting it.
    this.playerSchlauch.show(
      schlauch,
      octant,
      false,
      x,
      0.2 + 4 * Math.cos(this.lean),
      feetZ - 4 * Math.sin(this.lean) + 0.6,
      this.lean,
      false,
    );

    this.lantern.position.set(x, 16, y);
    this.lantern.intensity = sim.playerDead ? 0 : 420;
  }

  private syncEntities(alpha: number, nowMs: number): void {
    const sim = this.sim;
    const world = sim.world;
    const states = world.states;
    const masks = world.masks;
    const required = sim.collidableMask;
    const collision = sim.collision.data;
    const body = sim.body.data;
    const flash = sim.flash.data;
    let used = 0;
    for (let index = 0; index < world.highWater; index++) {
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
      const radius = body[index * 2] ?? 1;
      const x = lerp(sim.previousX(index), sim.positionX(index), alpha);
      const y = lerp(sim.previousY(index), sim.positionY(index), alpha);
      const isPickup = (layer & CollisionLayer.Pickup) !== 0;
      const isEnemy = (mask & sim.enemyMask) === sim.enemyMask;
      const isBomb = (mask & sim.bombFuse.bit) !== 0;

      let sheet: SpriteSheet;
      let frame = 0;
      let mirrored = false;
      let lift = 0;
      if (isEnemy) {
        const id = sim.enemies.at(sim.enemy.data[index * ENEMY_STRIDE] ?? 0).id;
        sheet = this.sheet(id);
        if (sheet.clips !== null) {
          const state = resolveAnimationState(sim, index);
          if (this.entityState[index] !== state) {
            this.entityState[index] = state;
            this.entityStateSince[index] = nowMs;
          }
          frame = frameAt(sheet.clips, state, nowMs - (this.entityStateSince[index] ?? nowMs));
          // Strips are authored facing left; a body heading right is mirrored.
          mirrored = resolveFacing(sim, index) > 0;
        }
      } else if (isPickup) {
        const kind = sim.pickupKind.data[index] ?? 0;
        sheet = this.sheet(`pickup-${sim.pickups.at(kind).id}`);
        // A dropped pickup hops in the 2D game too; here it hovers a touch so
        // its shadow separates it from the floor.
        lift = 1.5 + Math.sin(nowMs * 0.004 + index) * 1;
      } else if (isBomb) {
        sheet = this.sheet('pickup-bierfassl');
      } else {
        sheet = this.sheet(
          DESTRUCTIBLES[sim.propKind.data[index] ?? 0] ?? DESTRUCTIBLES[0] ?? 'cellar-barrel',
        );
      }
      const slot = this.slot(used);
      used += 1;
      slot.show(
        sheet,
        frame,
        mirrored,
        x,
        0.2 + lift,
        y + radius * 0.5,
        this.lean,
        (flash[index] ?? 0) > 0,
      );
    }
    for (let i = used; i < this.slots.length; i++) {
      this.slots[i]?.hide();
    }
  }

  // -------------------------------------------------------- projectiles

  private syncProjectiles(alpha: number): void {
    const store = this.sim.projectiles;
    const shots = this.shots;
    let count = 0;
    let lights = 0;
    SCRATCH_QUATERNION.identity();
    for (let index = 0; index < store.capacity; index++) {
      if (!store.isLive(index)) {
        continue;
      }
      const x = lerp(store.previousX[index] ?? 0, store.x[index] ?? 0, alpha);
      const z = lerp(store.previousY[index] ?? 0, store.y[index] ?? 0, alpha);
      const radius = store.radius[index] ?? 2;
      const isPlayer = (store.team[index] ?? 0) === ProjectileTeam.Player;
      // The sim is flat; the *arc* is presentation only. A thrown Maß lobs up
      // and comes back down over its first ~50 ticks, an enemy shot skims.
      const t = Math.min(1, (store.ticksAlive[index] ?? 0) / 50);
      const height = isPlayer ? 6 + 7 * Math.sin(t * Math.PI) : 5;
      SCRATCH_POSITION.set(x, height, z);
      SCRATCH_SCALE.setScalar(Math.max(1.2, radius));
      SCRATCH_MATRIX.compose(SCRATCH_POSITION, SCRATCH_QUATERNION, SCRATCH_SCALE);
      shots.setMatrixAt(count, SCRATCH_MATRIX);
      shots.setColorAt(
        count,
        isPlayer ? SCRATCH_COLOR.setHex(0xffc24a) : SCRATCH_COLOR.setHex(0xff5a3c),
      );
      count += 1;
      if (isPlayer && lights < SHOT_LIGHT_COUNT) {
        const light = this.shotLights[lights];
        if (light !== undefined) {
          light.position.set(x, height + 1, z);
          light.intensity = 220;
          lights += 1;
        }
      }
    }
    for (let i = lights; i < SHOT_LIGHT_COUNT; i++) {
      const light = this.shotLights[i];
      if (light !== undefined) {
        light.intensity = 0;
      }
    }
    shots.count = count;
    shots.instanceMatrix.needsUpdate = true;
    if (shots.instanceColor !== null) {
      shots.instanceColor.needsUpdate = true;
    }
  }

  private syncParticles(alpha: number): void {
    const store = this.sim.particles;
    const sparks = this.sparks;
    let count = 0;
    SCRATCH_QUATERNION.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.lean);
    for (let index = 0; index < store.capacity; index++) {
      if ((store.life[index] ?? 0) <= 0) {
        continue;
      }
      const x = lerp(store.previousX[index] ?? 0, store.x[index] ?? 0, alpha);
      const z = lerp(store.previousY[index] ?? 0, store.y[index] ?? 0, alpha);
      const life = (store.life[index] ?? 0) / Math.max(1, store.maxLife[index] ?? 1);
      const size = Math.max(0.6, (store.size[index] ?? 1) * life);
      SCRATCH_POSITION.set(x, 3 + (1 - life) * 6, z);
      SCRATCH_SCALE.set(size, size, 1);
      SCRATCH_MATRIX.compose(SCRATCH_POSITION, SCRATCH_QUATERNION, SCRATCH_SCALE);
      sparks.setMatrixAt(count, SCRATCH_MATRIX);
      sparks.setColorAt(count, SCRATCH_COLOR.setHex(0xfff0c0));
      count += 1;
    }
    sparks.count = count;
    sparks.instanceMatrix.needsUpdate = true;
    if (sparks.instanceColor !== null) {
      sparks.instanceColor.needsUpdate = true;
    }
  }
}
