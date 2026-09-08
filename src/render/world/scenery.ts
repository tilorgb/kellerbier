import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  type PointLight,
} from 'three';
import { ROOM_TILE_UNITS } from '../../content/rooms/definition.js';
import {
  BLOCK_STRIDE,
  DOOR_SPAN,
  type RoomGeometry,
  roomFrameSize,
} from '../../sim/room/geometry.js';
import { type CompiledDoor, doorCentre } from '../../sim/room/template.js';
import { MAIBAUM_TOP_TILE, PROP_TILE_NAMES, type RoomTileArt } from '../floor-art.js';
import { type Texture, textureFromPixels } from '../gfx/index.js';
import { ROOM_HAZARD_PALETTE, roomThemeForFloor } from '../palette.js';
import { pickTileVariant, tileGridScale } from '../tiles.js';
import { Billboard } from './billboard.js';
import { DECAL_HEIGHT, FloorSprite, tilingTexture } from './flat.js';
import { ACTOR_LAYER, OCCLUDER_LAYER } from './layers.js';
import type { Lighting } from './lighting.js';
import type { MaterialCache } from './material-cache.js';

/**
 * The room as a place: floor, walls with height, doorways, obstacles, props,
 * hazards. Built once per room load and thrown away on the next.
 *
 * ## What is 3D and what is a sprite
 *
 * The *architecture* has volume — the floor is a plane, the walls are boxes
 * the tileset's wall art wraps around, a doorway is a real gap with a dark
 * passage behind it. Everything that *stands in* the room is a sprite: a
 * boulder, a barrel, a crate, a hay bale, a Maibaum are the authored tiles
 * standing up on their cell (`Billboard`), lit and casting shadows like the
 * creatures next to them. A boulder drawn as a textured box read as a black
 * crate with rock wallpaper; the authored tile is already the illusion of a
 * rock, and standing it up is enough to say "this blocks you" — collision is
 * the simulation's rectangle either way.
 *
 * ## Void cells
 *
 * An `L` or `T` room's unclaimed cells are wall standing in for floor that is
 * not there (`RoomGeometry.voidRects`), so they are built as wall boxes and
 * not as obstacles.
 */
export type DoorState = 'open' | 'closed' | 'locked';

export interface SceneryArt {
  readonly tiles?: RoomTileArt | undefined;
  readonly tileTextures: Readonly<Record<string, Texture>>;
}

export interface DecorativeProp {
  readonly x: number;
  readonly y: number;
  readonly type: string;
}

const WALL_THICKNESS = ROOM_TILE_UNITS;
/** How far past the room the dark base extends, so a letterboxed frame never shows void. */
const BLEED = ROOM_TILE_UNITS * 6;
const TRELLIS_HEIGHT = 14;
const DEFAULT_WALL_HEIGHT = 26;

/** Props that are floor markings rather than things standing on the floor. */
const FLAT_PROPS: ReadonlySet<string> = new Set(['boss-plate', 'shopkeeper-stand']);

const warnedProps = new Set<string>();

/**
 * One doorway: a frame set into the wall, a door hinged in it that swings open
 * when the room is cleared, a dark passage behind, and the glow of the next
 * room once the door stands open.
 *
 * Built in the doorway's own frame — the gap along local x, the room at +z,
 * outward at -z — and turned to face its wall, so a north, south, east or
 * west door is the same object rotated. The door is a single leaf as wide as
 * the gap less its jambs, hinged on one side and swinging *outward* into the
 * passage so it never intrudes on the playfield. The way into a boss room
 * gets two leaves (`setDouble`), because a boss room's door should look like
 * one.
 *
 * Collision is the simulation's `DOOR_SPAN` gap either way; the frame's jambs
 * take two units off each side of what is drawn, not of what is walkable.
 */
export class DoorPiece {
  readonly door: CompiledDoor;
  readonly group = new Group();
  /** The leaf pivots, hinged at the jambs: one for an ordinary door, two for a boss door. */
  readonly hinges: Group[] = [];
  private readonly lighting: Lighting;
  private readonly materials: MaterialCache;
  /**
   * Claimed from `Lighting`'s fixed pool (`docs/PERFORMANCE_AUDIT.md` F1) for
   * as long as this door's room is on screen — `setLive(true)` claims,
   * `setLive(false)` and `dispose` return it — and `null` in between, or if
   * the pool is exhausted (`docs/DECISIONS.md` #19: the door just doesn't
   * glow). Claiming per attach rather than per lifetime is what lets the
   * pool be sized for the two rooms a slide draws instead of every room
   * `SceneryCache` holds (`MAX_DOOR_GLOWS`).
   *
   * Never a child of `group`: it stays at the scene root, where `Lighting`
   * put it, and `placeGlow` moves it to the door's world position instead.
   * Parenting it here was how the point-light count still changed after #292
   * — a cached room's group leaves the scene graph with its doors' glows
   * inside it, three.js counts only the lights it can traverse to, and every
   * lit shader relinked on the count (`docs/DECISIONS.md` #80).
   */
  private glow: PointLight | null = null;
  /** Where the glow's local `(0, 10, -t/2)` lands in room space once the door's rotation is applied. */
  private readonly glowX: number;
  private readonly glowZ: number;
  /** Whether this door's room is on screen — a cached, detached room's doors must not light the live one. */
  private live = false;
  private pulseStrength = 0;
  /** The room group's current slide shift, so a glow claimed mid-slide lands in the right place. */
  private roomOffsetX = 0;
  private roomOffsetZ = 0;
  private readonly span: number;
  private readonly doorHeight: number;
  private state: DoorState = 'closed';
  private opennessValue = 0;
  private double = false;
  private lock: Mesh | null = null;
  /** Parallel to `hinges` — kept so `disposeLeaves` can free each leaf's own (uncached) material. */
  private readonly leaves: Mesh[] = [];

  constructor(
    door: CompiledDoor,
    centreX: number,
    centreZ: number,
    span: number,
    wallHeight: number,
    wall: Texture | undefined,
    wallColour: number,
    lighting: Lighting,
    materials: MaterialCache,
  ) {
    this.door = door;
    this.span = span;
    this.lighting = lighting;
    this.materials = materials;
    const t = WALL_THICKNESS;
    // A door in a tall wall stops short of the top so a lintel and a course of
    // wall can sit over it; a gate in a low hedge stands above it.
    this.doorHeight = wallHeight >= 16 ? Math.min(wallHeight - LINTEL, DOOR_HEIGHT) : GATE_HEIGHT;
    const frameHeight = this.doorHeight + LINTEL;

    this.group.position.set(centreX, 0, centreZ);
    this.group.rotation.y = DOOR_FACING[door.direction];

    // The passage: a dark floor through the wall and out past the door's
    // swing, so an open leaf stands on something rather than on the room's
    // wall texture. No back wall — the dark beyond the room is dark enough,
    // and a box standing out there is a slab the camera sees over a side wall.
    const reach = span + 2;
    const floor = new Mesh(
      new PlaneGeometry(span, reach + t / 2),
      materials.flatMaterial(0x141018, { roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.06, -(reach + t / 2) / 2 + t / 4);
    floor.receiveShadow = true;
    this.group.add(floor);

    // The frame: two jambs and a lintel in dark timber, proud of the wall face.
    const timber = materials.flatMaterial(FRAME_TIMBER, { roughness: 0.9 });
    for (const side of [-1, 1]) {
      const jamb = new Mesh(new BoxGeometry(JAMB, frameHeight, t + 1), timber);
      jamb.position.set(side * (span / 2 - JAMB / 2), frameHeight / 2, 0);
      jamb.castShadow = true;
      this.group.add(jamb);
    }
    const lintel = new Mesh(new BoxGeometry(span, LINTEL, t + 1), timber);
    lintel.position.set(0, this.doorHeight + LINTEL / 2, 0);
    lintel.castShadow = true;
    this.group.add(lintel);
    // Wall above the lintel, so the run reads as one wall with a doorway cut in it.
    if (wallHeight > frameHeight) {
      const above =
        wall === undefined
          ? flatBox(materials, wallColour, span, wallHeight - frameHeight, t)
          : tiledBox(materials, wall, span, wallHeight - frameHeight, t);
      above.position.set(0, frameHeight + (wallHeight - frameHeight) / 2, 0);
      this.group.add(above);
    }

    // The glow sits a half wall-thickness *behind* the door (through the
    // passage, local -z), which after the door's facing rotation is a room
    // space offset from the door's centre — worked out once here, so
    // `placeGlow` is a couple of adds per call.
    const facing = DOOR_FACING[door.direction];
    this.glowX = centreX - (t / 2) * Math.sin(facing);
    this.glowZ = centreZ - (t / 2) * Math.cos(facing);

    this.buildLeaves();
    this.setState('closed');
  }

  /** The pooled passage light behind this door while its room is on screen; `null` off screen or when the pool was exhausted. */
  get glowLight(): PointLight | null {
    return this.glow;
  }

  /**
   * Moves the glow to this door's world position, given where the room's
   * group currently sits — `(0, 0)` normally, the slide shift while this
   * room is the outgoing one (`Scenery.setOffset`).
   */
  placeGlow(roomOffsetX: number, roomOffsetZ: number): void {
    this.roomOffsetX = roomOffsetX;
    this.roomOffsetZ = roomOffsetZ;
    if (this.glow !== null) {
      this.glow.position.set(this.glowX + roomOffsetX, 10, this.glowZ + roomOffsetZ);
    }
  }

  /**
   * Whether this door's room is currently attached to the scene. Going live
   * claims a glow from the pool and lights it per the door's state; going
   * dark returns it. The light itself never leaves the scene either way, so
   * the count holds, and a cached room's open doors cannot light the room
   * actually on screen.
   */
  setLive(live: boolean): void {
    if (live === this.live) {
      return;
    }
    this.live = live;
    if (live) {
      this.glow = this.lighting.acquireDoorGlow();
      this.placeGlow(this.roomOffsetX, this.roomOffsetZ);
    } else {
      this.lighting.releaseDoorGlow(this.glow);
      this.glow = null;
    }
    this.applyGlow();
  }

  private applyGlow(): void {
    if (this.glow === null) {
      return;
    }
    this.glow.intensity = this.live && this.state === 'open' ? 120 + this.pulseStrength * 400 : 0;
  }

  /** One leaf or two. Rebuilds the leaves; the state and openness carry over. */
  setDouble(double: boolean): void {
    if (double === this.double) {
      return;
    }
    this.double = double;
    this.buildLeaves();
    this.setState(this.state);
    this.setOpenness(this.opennessValue);
  }

  get isDouble(): boolean {
    return this.double;
  }

  /** Disposes the current leaves and lock — their geometry always, the leaves' own uncached material too. */
  private disposeLeaves(): void {
    for (let i = 0; i < this.hinges.length; i++) {
      const hinge = this.hinges[i];
      const leaf = this.leaves[i];
      if (leaf !== undefined) {
        leaf.geometry.dispose();
        (leaf.material as MeshStandardMaterial).dispose();
      }
      if (hinge !== undefined) {
        this.group.remove(hinge);
      }
    }
    this.lock?.geometry.dispose();
    this.hinges.length = 0;
    this.leaves.length = 0;
    this.lock = null;
  }

  private buildLeaves(): void {
    this.disposeLeaves();
    const inner = this.span / 2 - JAMB;
    const leafHeight = this.doorHeight - 0.5;
    const leafWidth = this.double ? inner - 0.25 : inner * 2 - 0.5;
    const sides = this.double ? [-1, 1] : [-1];
    for (const side of sides) {
      const hinge = new Group();
      hinge.position.set(side * inner, 0, 0);
      // The leaf's own material is never cached: `setState` tints it per-door
      // (locked vs. not), which a shared instance would broadcast to every
      // other door borrowing it. Its *shape* — textured, roughness-only — is
      // the same as every wall material the cache does hand out, so its
      // program stays warm anyway; only the instance is one-off.
      const leaf = new Mesh(
        new BoxGeometry(leafWidth, leafHeight, LEAF_THICKNESS),
        new MeshStandardMaterial({
          map: tilingTexture(plankTexture(), leafWidth, leafHeight),
          roughness: 0.85,
        }),
      );
      // The leaf extends from its hinge toward the gap's centre.
      leaf.position.set(-side * (leafWidth / 2), leafHeight / 2 + 0.25, 0);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      hinge.add(leaf);
      this.hinges.push(hinge);
      this.leaves.push(leaf);
      this.group.add(hinge);
    }
    // A padlock on the leading edge, shown only while the door is key-locked.
    // Never tinted, so — unlike the leaf — it can safely borrow a shared material.
    const lock = new Mesh(
      new BoxGeometry(2, 2.5, 1.2),
      this.materials.flatMaterial(LOCK_BRASS, { roughness: 0.4, metalness: 0.6 }),
    );
    const firstHinge = this.hinges[0];
    if (firstHinge !== undefined) {
      const edge = this.double ? inner - 1.5 : inner * 2 - 2;
      lock.position.set(edge, this.doorHeight * 0.45, LEAF_THICKNESS / 2 + 0.6);
      firstHinge.add(lock);
    }
    this.lock = lock;
  }

  setState(state: DoorState): void {
    this.state = state;
    if (this.lock !== null) {
      this.lock.visible = state === 'locked';
    }
    for (const leaf of this.leaves) {
      (leaf.material as MeshStandardMaterial).color.setHex(
        state === 'locked' ? LOCKED_TINT : 0xffffff,
      );
    }
    this.setOpenness(state === 'open' ? 1 : 0);
    this.pulseStrength = 0;
    this.applyGlow();
  }

  get currentState(): DoorState {
    return this.state;
  }

  /** How far the door stands open: 0 shut, 1 swung fully outward. */
  setOpenness(openness: number): void {
    this.opennessValue = Math.max(0, Math.min(1, openness));
    const angle = this.opennessValue * OPEN_ANGLE;
    this.hinges.forEach((hinge, index) => {
      // The left hinge swings positive, the right negative: both leaves go outward.
      const sign = (this.double ? (index === 0 ? -1 : 1) : -1) * -1;
      hinge.rotation.y = sign * angle;
    });
  }

  get openness(): number {
    return this.opennessValue;
  }

  /** The room-clear amber pulse on the passage light. */
  setPulse(strength: number): void {
    this.pulseStrength = strength;
    this.applyGlow();
  }

  dispose(): void {
    this.disposeLeaves();
    // Returns the glow if the room was still on screen. Forgotten as well as
    // released: the pool hands the same light to the next door that goes
    // live, and a late `setPulse` on this disposed piece must not reach into
    // that door's light.
    this.lighting.releaseDoorGlow(this.glow);
    this.glow = null;
    this.live = false;
    disposeMeshes(this.group);
    this.group.removeFromParent();
  }
}

/**
 * Frees every mesh's geometry under `root`. Materials are not disposed here:
 * everything a `Scenery`/`DoorPiece` builds now borrows its material from
 * `MaterialCache` (kept alive for the run) rather than owning one — the one
 * exception, a door leaf's per-instance tint, disposes itself explicitly in
 * `disposeLeaves` before this ever sees it. Geometry stays per-instance; #293
 * is where that gets pooled too.
 */
function disposeMeshes(root: Group): void {
  root.traverse((object) => {
    if (object instanceof Mesh) {
      const mesh = object as Mesh;
      mesh.geometry.dispose();
    }
  });
}

/** Which way each wall's doorway faces: the local -z (outward) turned to point out of the room. */
const DOOR_FACING: Readonly<Record<CompiledDoor['direction'], number>> = {
  north: 0,
  south: Math.PI,
  west: Math.PI / 2,
  east: -Math.PI / 2,
};

const DOOR_HEIGHT = 20;
const GATE_HEIGHT = 12;
const LINTEL = 2;
const JAMB = 2;
const LEAF_THICKNESS = 1.2;
const OPEN_ANGLE = (95 / 180) * Math.PI;
const FRAME_TIMBER = 0x3a2a1e;
const LOCK_BRASS = 0xd6a53a;
const LOCKED_TINT = 0xa8a0b8;

let plankTextureCache: Texture | null = null;

/**
 * Vertical planks with two iron bands, drawn as pixels: the door is the one
 * piece of room architecture with no authored tile, and a texture built from
 * a palette needs no canvas, so the room editor's playtest and a headless
 * test get the same door.
 */
function plankTexture(): Texture {
  if (plankTextureCache !== null) {
    return plankTextureCache;
  }
  const w = 16;
  const h = 32;
  const colours = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const plank = Math.floor(x / 4);
      let colour = plank % 2 === 0 ? 0x7a4a2a : 0x6e4226;
      if (x % 4 === 0) {
        colour = 0x3e2415;
      } else if ((y * 7 + x * 3) % 11 === 0) {
        colour = 0x85532f;
      }
      if (y === 6 || y === 7 || y === 24 || y === 25) {
        colour = x % 4 === 2 ? 0x8a8a90 : 0x2a2a30;
      }
      colours[y * w + x] = colour;
    }
  }
  plankTextureCache = textureFromPixels(w, h, colours);
  return plankTextureCache;
}

/**
 * A textured box that tiles at one authored tile per `ROOM_TILE_UNITS` on
 * every face. The geometry is still built fresh per call — #293's wall merge
 * is where that goes away — but every face's material is borrowed from
 * `materials` rather than constructed, so the room's own wall/void run
 * lengths (quantised to the room grid) recur across loads often enough for
 * this to be a real cache hit, not just a keepalive.
 */
function tiledBox(
  materials: MaterialCache,
  texture: Texture,
  width: number,
  height: number,
  depth: number,
  topTexture: Texture = texture,
): Mesh {
  const geometry = new BoxGeometry(width, height, depth);
  const side = materials.tiledMaterial(texture, depth, height, { roughness: 0.95 });
  const top = materials.tiledMaterial(topTexture, width, depth, { roughness: 0.95 });
  const end = materials.tiledMaterial(texture, width, height, { roughness: 0.95 });
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z.
  const mesh = new Mesh(geometry, [side, side, top, top, end, end]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function flatBox(
  materials: MaterialCache,
  colour: number,
  width: number,
  height: number,
  depth: number,
): Mesh {
  const mesh = new Mesh(
    new BoxGeometry(width, height, depth),
    materials.flatMaterial(colour, { roughness: 0.95 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ----------------------------------------------------- merged wall/void geometry

/**
 * Accumulates every wall and void box in the room into one buffer per
 * (occluder layer × wall/top split) instead of one `Mesh` per box —
 * `docs/PERFORMANCE_AUDIT.md` F3: a 38-mesh room reported 86 wall materials
 * and 87–153 draw calls for the room pass alone. `finalizeWallGeometry`
 * turns each of these into a single merged `Mesh`, so the whole room's
 * walls and voids draw in at most four calls (two if the tileset has no
 * distinct top/wallLip texture) regardless of how many wall runs the room
 * has.
 */
interface MeshBuild {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
}

function newMeshBuild(): MeshBuild {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

/** UVs for a box going into a flat-colour merge — never sampled (no map), so any unit rect works. */
const WHITE_UV: readonly [number, number, number, number] = [0, 0, 1, 1];

function isMeshBuildEmpty(build: MeshBuild): boolean {
  return build.positions.length === 0;
}

/**
 * Appends one box, centred at `(cx, cy, cz)`, into `build` — `top` selects
 * which of the box's six faces go in: `undefined` for all six (a flat-colour
 * room, which has no separate top texture), `true` for only the top (`+y`)
 * face, `false` for the other five. Never both `finalizeWallGeometry` splits
 * for the same box: a face must land in exactly one merged mesh or the two
 * would z-fight drawing over each other.
 *
 * Reads a throwaway `BoxGeometry`'s own attributes rather than deriving the
 * box's 24 vertices by hand — three.js's own box triangulation is the
 * reference, not a second copy of it to keep in sync. Each face's UV is
 * scaled by how many `ROOM_TILE_UNITS` it spans, baked into the geometry
 * instead of a texture's `.repeat` (`tiledBox`'s approach): the point of
 * merging is that every box in the room shares one material, and a shared
 * material has only one `.repeat` for the whole mesh.
 */
function appendBox(
  build: MeshBuild,
  cx: number,
  cy: number,
  cz: number,
  width: number,
  height: number,
  depth: number,
  baseUv: readonly [number, number, number, number],
  top: boolean | undefined,
): void {
  const box = new BoxGeometry(width, height, depth);
  const positionAttr = box.getAttribute('position');
  const normalAttr = box.getAttribute('normal');
  const uvAttr = box.getAttribute('uv');
  const indexAttr = box.getIndex();
  const [u0, v0, u1, v1] = baseUv;
  // BoxGeometry's face order, 4 vertices each: +x, -x, +y, -y, +z, -z — the
  // same order `tiledBox`'s own comment already documents. Face 2 is the top.
  const faceRepeats: readonly [number, number][] = [
    [depth / ROOM_TILE_UNITS, height / ROOM_TILE_UNITS],
    [depth / ROOM_TILE_UNITS, height / ROOM_TILE_UNITS],
    [width / ROOM_TILE_UNITS, depth / ROOM_TILE_UNITS],
    [width / ROOM_TILE_UNITS, depth / ROOM_TILE_UNITS],
    [width / ROOM_TILE_UNITS, height / ROOM_TILE_UNITS],
    [width / ROOM_TILE_UNITS, height / ROOM_TILE_UNITS],
  ];
  for (let face = 0; face < 6; face++) {
    if (top === true && face !== 2) {
      continue;
    }
    if (top === false && face === 2) {
      continue;
    }
    const [repeatU, repeatV] = faceRepeats[face] ?? [1, 1];
    const base = build.positions.length / 3;
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      build.positions.push(
        positionAttr.getX(i) + cx,
        positionAttr.getY(i) + cy,
        positionAttr.getZ(i) + cz,
      );
      build.normals.push(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i));
      build.uvs.push(
        u0 + (u1 - u0) * uvAttr.getX(i) * repeatU,
        v0 + (v1 - v0) * uvAttr.getY(i) * repeatV,
      );
    }
    if (indexAttr !== null) {
      // Each face's own 6 indices, in the source geometry, index into that
      // face's 4 vertices starting at `face * 4` — offset by `base` (this
      // merge's running vertex count) rather than the source's own `face * 4`.
      for (let k = 0; k < 6; k++) {
        build.indices.push(base + (indexAttr.getX(face * 6 + k) - face * 4));
      }
    }
  }
  box.dispose();
}

/** Turns an accumulated `MeshBuild` into a `Mesh`, or `null` if nothing was ever appended to it. */
function finalizeMeshBuild(build: MeshBuild, material: MeshStandardMaterial): Mesh | null {
  if (isMeshBuildEmpty(build)) {
    return null;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(build.positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(build.normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(build.uvs), 2));
  geometry.setIndex(build.indices);
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class Scenery {
  readonly group = new Group();
  readonly doors: DoorPiece[] = [];
  /** Where the room's authored bulbs hang — the lighting rig turns them into lights. */
  readonly bulbs: { readonly x: number; readonly y: number }[] = [];
  readonly wallHeight: number;
  readonly frameWidth: number;
  readonly frameHeight: number;

  private readonly room: RoomGeometry;
  private readonly art: SceneryArt;
  private readonly lighting: Lighting;
  private readonly materials: MaterialCache;
  private readonly billboards: Billboard[] = [];
  private readonly flats: FloorSprite[] = [];
  private hints: LineSegments | null = null;
  private lean: number;
  /**
   * Every wall/void box in the room, accumulated by `addWallBox` during
   * `buildWalls`/`buildVoids` instead of becoming its own `Mesh`, then
   * merged once each into up to four meshes by `finalizeWalls` — see
   * `docs/PERFORMANCE_AUDIT.md` F3. `body` is the five non-top faces (or all
   * six, for a colour-only room with no separate wallLip texture); `top` is
   * face `+y` only, drawn with the tileset's lit wallLip texture. Split by
   * `OCCLUDER_LAYER` the same way individual wall meshes used to be — see
   * `addWallBox`.
   */
  private readonly wallBodyOccluder = newMeshBuild();
  private readonly wallBodyNonOccluder = newMeshBuild();
  private readonly wallTopOccluder = newMeshBuild();
  private readonly wallTopNonOccluder = newMeshBuild();

  constructor(
    room: RoomGeometry,
    floor: number,
    doors: readonly CompiledDoor[],
    props: readonly DecorativeProp[],
    art: SceneryArt,
    lean: number,
    lighting: Lighting,
    materials: MaterialCache,
  ) {
    this.room = room;
    this.art = art;
    this.lean = lean;
    this.lighting = lighting;
    this.materials = materials;
    this.wallHeight = art.tiles?.wallHeight ?? DEFAULT_WALL_HEIGHT;
    const frame = roomFrameSize(room);
    this.frameWidth = frame.width;
    this.frameHeight = frame.height;
    const theme = roomThemeForFloor(floor);

    this.buildFloor(theme.floor, theme.wall);
    this.buildWalls(doors, theme.wall);
    this.buildVoids();
    this.finalizeWalls(theme.wall);
    this.buildBlocks(theme.block);
    this.buildHazards();
    this.buildProps(props);
  }

  /** Billboards turn to a new camera angle without a rebuild. */
  setLean(lean: number): void {
    this.lean = lean;
    for (const billboard of this.billboards) {
      billboard.mesh.rotation.x = lean;
    }
  }

  /**
   * Puts this room on screen: its group under `scene`, at `(offsetX, 0,
   * offsetZ)` — the origin for the room being played, the slide shift for the
   * outgoing one — and its door glows lit per their state. The only way a
   * `Scenery` should ever join a scene: a bare `scene.add(group)` would leave
   * the pooled glows dark (`DoorPiece.setLive`) and, for a room last seen
   * sliding out, sitting a room's width from where it belongs.
   */
  attach(scene: Object3D, offsetX = 0, offsetZ = 0): void {
    scene.add(this.group);
    this.setOffset(offsetX, offsetZ);
    for (const door of this.doors) {
      door.setLive(true);
    }
  }

  /**
   * Takes this room off screen without disposing it — `SceneryCache` keeps it
   * for a revisit. Its door glows go dark; the lights themselves stay in the
   * scene, at the scene root, so three.js's light count does not move.
   */
  detach(): void {
    this.group.removeFromParent();
    for (const door of this.doors) {
      door.setLive(false);
    }
  }

  /** Moves the whole room — the transition slide — and its glows, which are not children of `group`, along with it. */
  setOffset(offsetX: number, offsetZ: number): void {
    this.group.position.set(offsetX, 0, offsetZ);
    for (const door of this.doors) {
      door.placeGlow(offsetX, offsetZ);
    }
  }

  // ------------------------------------------------------------- floor

  private buildFloor(floorColour: number, wallColour: number): void {
    const room = this.room;
    const tiles = this.art.tiles;
    const interiorW = room.maxX - room.minX;
    const interiorH = room.maxY - room.minY;

    // The dark base under and beyond the walls, so nothing outside is void.
    const bleedWidth = this.frameWidth + BLEED * 2;
    const bleedHeight = this.frameHeight + BLEED * 2;
    const base = new Mesh(
      new PlaneGeometry(bleedWidth, bleedHeight),
      tiles === undefined
        ? this.materials.flatMaterial(wallColour, { roughness: 1 })
        : this.materials.tiledMaterial(tiles.wall, bleedWidth, bleedHeight, {
            roughness: 1,
            color: 0x555555,
          }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(this.frameWidth / 2, -0.05, this.frameHeight / 2);
    base.receiveShadow = true;
    this.group.add(base);

    if (tiles === undefined || tiles.floorVariants.length === 0) {
      const floor = new Mesh(
        new PlaneGeometry(interiorW, interiorH),
        this.materials.flatMaterial(floorColour, { roughness: 0.9 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(room.minX + interiorW / 2, 0, room.minY + interiorH / 2);
      floor.receiveShadow = true;
      this.group.add(floor);
      return;
    }

    // One merged mesh per floor variant, each holding the cells the hash gives
    // it — the living floor at four draw calls rather than one per cell.
    const cells: number[][] = tiles.floorVariants.map(() => []);
    for (let y = room.minY; y < room.maxY; y += ROOM_TILE_UNITS) {
      for (let x = room.minX; x < room.maxX; x += ROOM_TILE_UNITS) {
        const col = Math.round(x / ROOM_TILE_UNITS);
        const row = Math.round(y / ROOM_TILE_UNITS);
        const variant = pickTileVariant(col, row, tiles.floorVariants.length);
        cells[variant]?.push(x, y);
      }
    }
    tiles.floorVariants.forEach((texture, variant) => {
      const list = cells[variant] ?? [];
      if (list.length === 0) {
        return;
      }
      const count = list.length / 2;
      const positions = new Float32Array(count * 12);
      const uvs = new Float32Array(count * 8);
      const normals = new Float32Array(count * 12);
      const index = new Uint32Array(count * 6);
      const [u0, v0, u1, v1] = texture.uvs();
      for (let i = 0; i < count; i++) {
        const x = list[i * 2] ?? 0;
        const z = list[i * 2 + 1] ?? 0;
        const s = ROOM_TILE_UNITS;
        // Corners in floor space: (x, z) is the cell's north-west.
        positions.set([x, 0, z, x + s, 0, z, x, 0, z + s, x + s, 0, z + s], i * 12);
        uvs.set([u0, v0, u1, v0, u0, v1, u1, v1], i * 8);
        normals.set([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], i * 12);
        const base4 = i * 4;
        index.set([base4, base4 + 2, base4 + 1, base4 + 1, base4 + 2, base4 + 3], i * 6);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
      geometry.setAttribute('normal', new BufferAttribute(normals, 3));
      geometry.setIndex(new BufferAttribute(index, 1));
      const mesh = new Mesh(geometry, this.materials.sharedMaterial(texture, 0.85));
      mesh.receiveShadow = true;
      this.group.add(mesh);
    });
  }

  // ------------------------------------------------------------- walls

  private buildWalls(doors: readonly CompiledDoor[], wallColour: number): void {
    const room = this.room;
    const gaps = (
      direction: CompiledDoor['direction'],
    ): { door: CompiledDoor; at: number; span: number }[] =>
      doors
        .filter((door) => door.direction === direction)
        .map((door) => {
          const centre = doorCentre(room, door);
          return {
            door,
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
      place: (start: number, length: number) => { x: number; z: number },
    ): void => {
      let cursor = from;
      for (const gap of gaps(direction)) {
        const gapStart = gap.at - gap.span / 2;
        const gapEnd = gap.at + gap.span / 2;
        if (gapStart > cursor) {
          this.addWallSegment(
            place(cursor, gapStart - cursor),
            gapStart - cursor,
            height,
            direction,
          );
        }
        const centre = place(gapStart, gap.span);
        const piece = new DoorPiece(
          gap.door,
          centre.x,
          centre.z,
          gap.span,
          height,
          this.art.tiles?.wall,
          wallColour,
          this.lighting,
          this.materials,
        );
        this.doors.push(piece);
        this.group.add(piece.group);
        cursor = gapEnd;
      }
      if (to > cursor) {
        this.addWallSegment(place(cursor, to - cursor), to - cursor, height, direction);
      }
    };

    const t = WALL_THICKNESS;
    run(room.minX - t, room.maxX + t, this.wallHeight, 'north', (start, length) => ({
      x: start + length / 2,
      z: room.minY - t / 2,
    }));
    run(room.minX - t, room.maxX + t, this.wallHeight, 'south', (start, length) => ({
      x: start + length / 2,
      z: room.maxY + t / 2,
    }));
    run(room.minY, room.maxY, this.wallHeight, 'west', (start, length) => ({
      x: room.minX - t / 2,
      z: start + length / 2,
    }));
    run(room.minY, room.maxY, this.wallHeight, 'east', (start, length) => ({
      x: room.maxX + t / 2,
      z: start + length / 2,
    }));
  }

  private addWallSegment(
    centre: { x: number; z: number },
    length: number,
    height: number,
    direction: CompiledDoor['direction'],
  ): void {
    const alongX = direction === 'north' || direction === 'south';
    const width = alongX ? length : WALL_THICKNESS;
    const depth = alongX ? WALL_THICKNESS : length;
    // See `world/layers.ts`'s `OCCLUDER_LAYER` doc comment: only the room's
    // own north wall carries the standing-sprite head-clip risk, so every
    // other wall is safe to occlude actors normally.
    this.addWallBox(centre.x, height / 2, centre.z, width, height, depth, direction !== 'north');
  }

  private buildVoids(): void {
    for (const rect of this.room.voidRects) {
      const width = rect.maxX - rect.minX;
      const depth = rect.maxY - rect.minY;
      // Same reasoning as `addWallSegment`: a void box that reaches the
      // interior's north edge is standing in for a north wall — a body can
      // be immediately south of it, so it carries the same head-clip risk
      // and stays off `OCCLUDER_LAYER`. One that doesn't (an L/T room's
      // south, east or west corner) is exactly as safe to occlude as an
      // ordinary wall.
      this.addWallBox(
        (rect.minX + rect.maxX) / 2,
        this.wallHeight / 2,
        (rect.minY + rect.maxY) / 2,
        width,
        this.wallHeight,
        depth,
        rect.minY > this.room.minY,
      );
    }
  }

  /** Appends one wall or void box into the accumulator `finalizeWalls` will merge — see the field doc comment. */
  private addWallBox(
    cx: number,
    cy: number,
    cz: number,
    width: number,
    height: number,
    depth: number,
    occluder: boolean,
  ): void {
    const tiles = this.art.tiles;
    const body = occluder ? this.wallBodyOccluder : this.wallBodyNonOccluder;
    if (tiles === undefined) {
      // No wallLip texture to draw the top separately with — every face goes
      // in `body`, exactly like `flatBox` drew a whole box before merging.
      appendBox(body, cx, cy, cz, width, height, depth, WHITE_UV, undefined);
      return;
    }
    const top = occluder ? this.wallTopOccluder : this.wallTopNonOccluder;
    appendBox(body, cx, cy, cz, width, height, depth, tiles.wall.uvs(), false);
    appendBox(top, cx, cy, cz, width, height, depth, tiles.wallLip.uvs(), true);
  }

  /** Turns the four accumulated wall/void builds into up to four merged meshes. */
  private finalizeWalls(wallColour: number): void {
    const tiles = this.art.tiles;
    const addMesh = (mesh: Mesh | null, name: string, occluder: boolean): void => {
      if (mesh === null) {
        return;
      }
      // A name, not a behaviour: `tests/unit/scenery-cache-gameview.test.ts`
      // finds the merged wall mesh by it rather than guessing at one from
      // shadow flags a `DoorPiece` leaf happens to share.
      mesh.name = name;
      if (occluder) {
        mesh.layers.enable(OCCLUDER_LAYER);
      }
      this.group.add(mesh);
    };
    if (tiles === undefined) {
      const material = this.materials.flatMaterial(wallColour, { roughness: 0.95 });
      addMesh(finalizeMeshBuild(this.wallBodyNonOccluder, material), 'scenery-wall', false);
      addMesh(finalizeMeshBuild(this.wallBodyOccluder, material), 'scenery-wall-occluder', true);
      return;
    }
    const bodyMaterial = this.materials.repeatingMaterial(tiles.wall, 0.95);
    const topMaterial = this.materials.repeatingMaterial(tiles.wallLip, 0.95);
    addMesh(finalizeMeshBuild(this.wallBodyNonOccluder, bodyMaterial), 'scenery-wall-body', false);
    addMesh(
      finalizeMeshBuild(this.wallBodyOccluder, bodyMaterial),
      'scenery-wall-body-occluder',
      true,
    );
    addMesh(finalizeMeshBuild(this.wallTopNonOccluder, topMaterial), 'scenery-wall-top', false);
    addMesh(
      finalizeMeshBuild(this.wallTopOccluder, topMaterial),
      'scenery-wall-top-occluder',
      true,
    );
  }

  // ------------------------------------------------------------ blocks

  /**
   * Obstacles: one bottom-anchored boulder billboard per cell, the floor's
   * variants mixed by the same hash as the floor tiles, standing on the
   * cell's south edge. Void rects are already in `blocks` too (as
   * non-overflyable), and `buildVoids` has drawn them as wall — skip them.
   */
  private buildBlocks(blockColour: number): void {
    const room = this.room;
    const blocks = room.blocks;
    const tiles = this.art.tiles;
    for (let i = 0; i < room.blockCount; i++) {
      if ((room.blockOverflyable[i] ?? 0) !== 1) {
        continue;
      }
      const minX = blocks[i * BLOCK_STRIDE] ?? 0;
      const minY = blocks[i * BLOCK_STRIDE + 1] ?? 0;
      const maxX = blocks[i * BLOCK_STRIDE + 2] ?? 0;
      const maxY = blocks[i * BLOCK_STRIDE + 3] ?? 0;
      if (tiles === undefined || tiles.blockVariants.length === 0) {
        const box = flatBox(
          this.materials,
          blockColour,
          maxX - minX,
          ROOM_TILE_UNITS * 0.8,
          maxY - minY,
        );
        box.position.set((minX + maxX) / 2, ROOM_TILE_UNITS * 0.4, (minY + maxY) / 2);
        // A block stands in the room: second pass, like every other sprite.
        box.layers.set(ACTOR_LAYER);
        this.group.add(box);
        continue;
      }
      for (let y = minY; y < maxY; y += ROOM_TILE_UNITS) {
        for (let x = minX; x < maxX; x += ROOM_TILE_UNITS) {
          const col = Math.round(x / ROOM_TILE_UNITS);
          const row = Math.round(y / ROOM_TILE_UNITS);
          const texture =
            tiles.blockVariants[pickTileVariant(col, row, tiles.blockVariants.length)] ??
            tiles.blockVariants[0];
          if (texture !== undefined) {
            this.standTile(texture, x + ROOM_TILE_UNITS / 2, y + ROOM_TILE_UNITS);
          }
        }
      }
    }
  }

  /** A tile texture standing on the floor with its feet at `(x, footZ)`, drawn on the tile grid. */
  private standTile(texture: Texture, x: number, footZ: number, lift = 0): Billboard {
    const billboard = new Billboard();
    billboard.setTexture(texture);
    // `tileGridScale` puts a 32px tile on the 16-unit grid; billboards scale
    // by the actor grid (2 px per unit), so a 32px tile lands at scale 1 and a
    // 16px one at 2 — the same on-screen size rule the 2D renderer applied.
    billboard.place(x, 0.2 + lift, footZ, this.lean, tileGridScale(texture) * 2);
    billboard.visible = true;
    this.group.add(billboard.mesh);
    this.billboards.push(billboard);
    return billboard;
  }

  // ----------------------------------------------------------- hazards

  private buildHazards(): void {
    const room = this.room;
    // A slick puddle is the one thing in the room that reflects.
    for (let i = 0; i < room.puddleCount; i++) {
      const minX = room.puddles[i * BLOCK_STRIDE] ?? 0;
      const minY = room.puddles[i * BLOCK_STRIDE + 1] ?? 0;
      const maxX = room.puddles[i * BLOCK_STRIDE + 2] ?? 0;
      const maxY = room.puddles[i * BLOCK_STRIDE + 3] ?? 0;
      const mesh = new Mesh(
        new PlaneGeometry(maxX - minX, maxY - minY),
        this.materials.flatMaterial(ROOM_HAZARD_PALETTE.puddleFill, {
          roughness: 0.15,
          metalness: 0.6,
          transparent: true,
          opacity: 0.85,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((minX + maxX) / 2, DECAL_HEIGHT, (minY + maxY) / 2);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    // A hop trellis blocks a shot's line but not a body: dense enough to hide
    // behind, so it stands, and green enough to read as hops.
    for (let i = 0; i < room.sightBlockCount; i++) {
      const minX = room.sightBlocks[i * BLOCK_STRIDE] ?? 0;
      const minY = room.sightBlocks[i * BLOCK_STRIDE + 1] ?? 0;
      const maxX = room.sightBlocks[i * BLOCK_STRIDE + 2] ?? 0;
      const maxY = room.sightBlocks[i * BLOCK_STRIDE + 3] ?? 0;
      const mesh = new Mesh(
        new BoxGeometry(maxX - minX, TRELLIS_HEIGHT, maxY - minY),
        this.materials.flatMaterial(ROOM_HAZARD_PALETTE.trellisFill, {
          roughness: 0.9,
          transparent: true,
          opacity: 0.8,
        }),
      );
      mesh.position.set((minX + maxX) / 2, TRELLIS_HEIGHT / 2, (minY + maxY) / 2);
      mesh.castShadow = true;
      // Stands in the room, hidden behind: second pass, like every other sprite.
      mesh.layers.set(ACTOR_LAYER);
      this.group.add(mesh);
    }
  }

  // ------------------------------------------------------------- props

  private buildProps(props: readonly DecorativeProp[]): void {
    for (const prop of props) {
      if (prop.type === 'bulb') {
        this.bulbs.push({ x: prop.x, y: prop.y });
        continue;
      }
      const tileName = PROP_TILE_NAMES[prop.type];
      if (tileName === null) {
        // Drawn elsewhere, on purpose (`PROP_TILE_NAMES`).
        continue;
      }
      if (tileName === undefined) {
        this.warnProp(prop.type, 'has no tile mapped');
        continue;
      }
      const texture = this.art.tileTextures[tileName];
      if (texture === undefined) {
        this.warnProp(prop.type, `maps to "${tileName}", which is not loaded`);
        continue;
      }
      if (FLAT_PROPS.has(prop.type)) {
        const flat = new FloorSprite(true);
        flat.setTexture(texture);
        flat.place(prop.x, prop.y, ROOM_TILE_UNITS, ROOM_TILE_UNITS);
        flat.visible = true;
        this.group.add(flat.mesh);
        this.flats.push(flat);
        continue;
      }
      const footZ = prop.y + ROOM_TILE_UNITS / 2;
      this.standTile(texture, prop.x, footZ);
      if (prop.type === 'maibaum') {
        // A maypole is two tiles tall or it is a stick: the crown stands on the base.
        const top = this.art.tileTextures[MAIBAUM_TOP_TILE];
        if (top !== undefined) {
          const crown = this.standTile(top, prop.x, footZ, ROOM_TILE_UNITS);
          crown.castShadow = false;
        }
      }
    }
  }

  private warnProp(type: string, why: string): void {
    if (!import.meta.env.DEV || warnedProps.has(type)) {
      return;
    }
    warnedProps.add(type);
    console.warn(`decorative prop "${type}" ${why} — not drawn (docs/DECISIONS.md #19)`);
  }

  // ------------------------------------------------------ secret hints

  /** Zigzag cracks on the inner wall face where a secret room's wall is — the tell the player looks for. */
  setSecretHints(doors: readonly CompiledDoor[]): void {
    this.hints?.geometry.dispose();
    this.hints?.removeFromParent();
    this.hints = null;
    if (doors.length === 0) {
      return;
    }
    const points: number[] = [];
    const room = this.room;
    const height = this.wallHeight;
    for (const door of doors) {
      const centre = doorCentre(room, door);
      const alongX = door.direction === 'north' || door.direction === 'south';
      const inset = door.direction === 'north' ? 0.3 : door.direction === 'south' ? -0.3 : 0;
      const insetX = door.direction === 'west' ? 0.3 : door.direction === 'east' ? -0.3 : 0;
      const steps = 8;
      let previous: [number, number, number] | null = null;
      for (let i = 0; i <= steps; i++) {
        const y = 1 + (height - 2) * (i / steps);
        const wobble = (i % 2 === 0 ? -1 : 1) * CRACK_SPAN * 0.35 + Math.sin(i * 2.3) * 2;
        const point: [number, number, number] = alongX
          ? [centre.x + wobble, y, centre.y + inset]
          : [centre.x + insetX, y, centre.y + wobble];
        if (previous !== null) {
          points.push(...previous, ...point);
        }
        previous = point;
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
    this.hints = new LineSegments(geometry, secretHintMaterial());
    this.group.add(this.hints);
  }

  dispose(): void {
    for (const door of this.doors) {
      door.dispose();
    }
    for (const billboard of this.billboards) {
      billboard.dispose();
    }
    for (const flat of this.flats) {
      flat.dispose();
    }
    this.hints?.geometry.dispose();
    disposeMeshes(this.group);
    this.group.removeFromParent();
  }
}

const CRACK_SPAN = 10;

let hintMaterialCache: LineBasicMaterial | null = null;

/** The secret-hint crack material — one instance for the run, like every other material `Scenery` now borrows. */
function secretHintMaterial(): LineBasicMaterial {
  return (hintMaterialCache ??= new LineBasicMaterial({
    color: ROOM_HAZARD_PALETTE.crack,
    transparent: true,
    opacity: 0.9,
  }));
}
