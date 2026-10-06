import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
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
  type RoomRect,
  roomFrameSize,
} from '../../sim/room/geometry.js';
import { type CompiledDoor, doorCentre } from '../../sim/room/template.js';
import { MAIBAUM_TOP_TILE, PROP_TILE_NAMES, type RoomTileArt } from '../floor-art.js';
import { type Texture, textureFromPixels } from '../gfx/index.js';
import { ROOM_HAZARD_PALETTE, roomThemeForFloor } from '../palette.js';
import { pickTileVariant, tileGridScale } from '../tiles.js';
import { ACTOR_PIXELS_PER_UNIT } from '../resolution.js';
import { Billboard } from './billboard.js';
import { ELEVATION } from './camera.js';
import { DECAL_HEIGHT, FloorSprite, tilingTexture } from './flat.js';
import { ACTOR_LAYER, OCCLUDER_LAYER } from './layers.js';
import type { Lighting } from './lighting.js';
import type { MaterialCache } from './material-cache.js';
import { pixelRuns, pixelShapeGeometry, plotPixelLine } from './pixel-shape.js';
import { buildStreams } from './stream.js';

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
  /** A secret wall bombed open (#5): a ragged hole with rubble, no leaf, no frame — always "open". */
  private readonly blasted: boolean;
  private state: DoorState = 'closed';
  private opennessValue = 0;
  private double = false;
  private lock: Object3D | null = null;
  /** Parallel to `hinges` — kept so `disposeLeaves` can free each leaf's own (uncached) material. */
  private readonly leaves: Mesh[] = [];

  constructor(
    door: CompiledDoor,
    centreX: number,
    centreZ: number,
    span: number,
    wallHeight: number,
    lighting: Lighting,
    materials: MaterialCache,
    blasted = false,
  ) {
    this.door = door;
    this.span = span;
    this.blasted = blasted;
    this.lighting = lighting;
    this.materials = materials;
    const t = WALL_THICKNESS;
    // The leaf's own height. The doorway above it is left open to the top of
    // the wall — no lintel, no course of wall over it (it used to have both).
    // A capped doorway on the *south* wall, which the camera only ever sees
    // the back of, gave a player no way to tell an open door from a closed
    // one: the leaf was hidden behind the cap either way. An open-topped gap
    // always shows the leaf — swung aside, or filling the opening.
    this.doorHeight = wallHeight >= 16 ? Math.min(wallHeight - LINTEL, DOOR_HEIGHT) : GATE_HEIGHT;

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

    if (blasted) {
      // A secret wall the player blew open (#5): no timber frame, no leaf —
      // just a hole with a scatter of broken masonry across the threshold,
      // and (below) the passage light spilling through so the room beyond
      // reads as reachable.
      this.buildRubble(span, wallHeight, materials);
    } else {
      // The frame: two jambs in dark timber, proud of the wall face, run the
      // full wall height so the open-topped gap reads as a deliberate portal
      // rather than a bite taken out of the wall. No lintel across the top.
      const timber = materials.tiledMaterial(jambTexture(), JAMB, wallHeight, { roughness: 0.9 });
      for (const side of [-1, 1]) {
        const jamb = new Mesh(new BoxGeometry(JAMB, wallHeight, t + 1), timber);
        jamb.position.set(side * (span / 2 - JAMB / 2), wallHeight / 2, 0);
        jamb.castShadow = true;
        this.group.add(jamb);
      }
    }

    // The glow sits a half wall-thickness *behind* the door (through the
    // passage, local -z), which after the door's facing rotation is a room
    // space offset from the door's centre — worked out once here, so
    // `placeGlow` is a couple of adds per call.
    const facing = DOOR_FACING[door.direction];
    this.glowX = centreX - (t / 2) * Math.sin(facing);
    this.glowZ = centreZ - (t / 2) * Math.cos(facing);

    if (blasted) {
      // No leaf to build, and it is permanently open — the glow shines and
      // `setState`/`setOpenness` are no-ops from here (see each).
      this.state = 'open';
      this.applyGlow();
    } else {
      this.buildLeaves();
      this.setState('closed');
    }
  }

  /**
   * A handful of broken stones across a blasted secret doorway — deterministic
   * (seeded off the door's span so it is the same every visit), pixel-free
   * block geometry the same way the rest of the room's architecture is.
   */
  private buildRubble(span: number, wallHeight: number, materials: MaterialCache): void {
    const stone = materials.flatMaterial(0x4a4650, { roughness: 1 });
    const count = 5;
    let s = Math.round(span * 7) % 97;
    const rand = (): number => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = 0; i < count; i++) {
      const size = 2 + rand() * 3;
      const chunk = new Mesh(new BoxGeometry(size, size * 0.8, size), stone);
      chunk.position.set((rand() - 0.5) * (span - size), size * 0.4, (rand() - 0.4) * 4);
      chunk.rotation.y = rand() * Math.PI;
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      this.group.add(chunk);
    }
    // A few stones still clinging to the top corners of the hole, so the edge
    // reads as broken rather than cut.
    for (const side of [-1, 1]) {
      const jag = new Mesh(new BoxGeometry(3, 4, WALL_THICKNESS + 1), stone);
      jag.position.set(side * (span / 2 - 2), wallHeight - 3, 0);
      jag.castShadow = true;
      this.group.add(jag);
    }
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
    if (this.blasted || double === this.double) {
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
    this.lock?.traverse((part) => {
      if (part instanceof Mesh) {
        (part.geometry as BufferGeometry).dispose();
      }
    });
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
    const lock = this.buildPixelLock();
    const firstHinge = this.hinges[0];
    if (firstHinge !== undefined) {
      const edge = this.double ? inner - 1.5 : inner * 2 - 2;
      lock.position.set(edge, this.doorHeight * 0.45, 0);
      firstHinge.add(lock);
    }
    this.lock = lock;
  }

  /** The padlock baked onto the sprite grid (`world/pixel-shape.ts`), one on each face of the leaf. */
  private buildPixelLock(): Object3D {
    const lock = new Group();
    lock.name = 'padlock';
    const brass = this.materials.flatMaterial(LOCK_BRASS, { roughness: 0.4, metalness: 0.6 });
    const iron = this.materials.flatMaterial(LOCK_IRON, { roughness: 0.5, metalness: 0.6 });
    for (const face of [1, -1]) {
      for (const [cells, material] of [
        [LOCK_BODY, brass],
        [LOCK_SHACKLE, iron],
      ] as const) {
        const half = new Mesh(
          pixelShapeGeometry(LOCK_COLS, LOCK_ROWS, cells, LOCK_CELL, LOCK_CELL),
          material,
        );
        half.position.z = face * (LEAF_THICKNESS / 2 + 0.15);
        half.rotation.y = face === 1 ? 0 : Math.PI;
        lock.add(half);
      }
    }
    return lock;
  }

  setState(state: DoorState): void {
    if (this.blasted) {
      // A blasted hole has no leaf to swing and no lock to show — it stays
      // "open" so its passage glow keeps shining. `applyDoorStates` still
      // calls this every room settle; nothing to do.
      return;
    }
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
    if (this.blasted) {
      return;
    }
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
    // Anything with its own geometry — a `Mesh` (the secret-wall crack hints
    // among them), or a `LineLoop` (a puddle rim).
    const geometry: unknown = (object as { geometry?: unknown }).geometry;
    if (geometry instanceof BufferGeometry) {
      geometry.dispose();
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
const LOCK_BRASS = 0xd6a53a;
const LOCKED_TINT = 0xa8a0b8;

/** Rim vertices per puddle blob. */
const PUDDLE_SEGMENTS = 40;
/**
 * Shared across every puddle rim — one colour, one line style, meant to
 * outlive any single `Scenery` the way `MaterialCache`'s entries are.
 */
const PUDDLE_RIM_MATERIAL = new LineBasicMaterial({
  color: ROOM_HAZARD_PALETTE.puddleRim,
  transparent: true,
  opacity: 0.8,
});

/** Wobble factor on a puddle's rim radius at `angle`, low-frequency so the blob stays rounded. */
function puddleWobble(angle: number, seed: number): number {
  return (
    1 +
    0.16 * Math.sin(angle * 3 + seed) +
    0.1 * Math.sin(angle * 5 - seed * 1.7) +
    0.05 * Math.sin(angle * 2 + seed * 0.6)
  );
}

/**
 * A wobbly ellipse in the floor plane (XZ, y = 0), centred on the origin and
 * reaching a mean of `halfWidth` × `halfHeight`. `outline` gives just the rim
 * ring (for a `LineLoop`); otherwise a triangle fan from the centre (for the
 * filled `Mesh`), with every normal pointing straight up so the reflective
 * material catches the bulb.
 */
function puddleBlobGeometry(
  halfWidth: number,
  halfHeight: number,
  seed: number,
  outline: boolean,
): BufferGeometry {
  const n = PUDDLE_SEGMENTS;
  const geometry = new BufferGeometry();
  if (outline) {
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = puddleWobble(a, seed);
      positions[i * 3] = Math.cos(a) * r * halfWidth;
      positions[i * 3 + 2] = Math.sin(a) * r * halfHeight;
    }
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    return geometry;
  }
  const positions = new Float32Array((n + 2) * 3);
  const normals = new Float32Array((n + 2) * 3);
  for (let v = 0; v < n + 2; v++) {
    normals[v * 3 + 1] = 1;
  }
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = puddleWobble(a, seed);
    positions[(i + 1) * 3] = Math.cos(a) * r * halfWidth;
    positions[(i + 1) * 3 + 2] = Math.sin(a) * r * halfHeight;
  }
  // Wound so the front face points up (+y): the camera looks down onto the
  // floor, and the reflective material is `side: FrontSide`.
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    index.push(0, i + 2, i + 1);
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setIndex(index);
  return geometry;
}

let plankTextureCache: Texture | null = null;

/**
 * Vertical planks with two iron bands, drawn as pixels: the door is the one
 * piece of room architecture with no authored tile, and a texture built from
 * a palette needs no canvas, so the room editor's playtest and a headless
 * test get the same door.
 *
 * One texel per room unit, the density of a wall tile, and no grain: at
 * display resolution anything finer reads as crisp detail the rest of the
 * room does not have.
 */
function plankTexture(): Texture {
  if (plankTextureCache !== null) {
    return plankTextureCache;
  }
  const w = 16;
  const h = 16;
  const colours = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let colour = Math.floor(x / 4) % 2 === 0 ? 0x7a4a2a : 0x6e4226;
      if (x % 4 === 0) {
        colour = 0x3e2415;
      }
      if (y === 3 || y === 12) {
        colour = x % 4 === 2 ? 0x8a8a90 : 0x2a2a30;
      }
      colours[y * w + x] = colour;
    }
  }
  plankTextureCache = textureFromPixels(w, h, colours);
  return plankTextureCache;
}

let jambTextureCache: Texture | null = null;

/** Timber grain for the door frame: a lit edge, a dark edge, the odd knot. One texel per room unit, like a wall tile. */
function jambTexture(): Texture {
  if (jambTextureCache !== null) {
    return jambTextureCache;
  }
  const w = 16;
  const h = 16;
  const colours = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let colour = x % 2 === 0 ? 0x4a3626 : 0x2e2018;
      if ((y * 5 + x * 3) % 13 === 0) {
        colour = 0x241810;
      }
      colours[y * w + x] = colour;
    }
  }
  jambTextureCache = textureFromPixels(w, h, colours);
  return jambTextureCache;
}

/** The padlock's two halves on a 4x6 grid, row 0 at the bottom: a brass body under an iron shackle. */
const LOCK_COLS = 4;
const LOCK_ROWS = 6;
const LOCK_BODY = new Uint8Array([
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);
const LOCK_SHACKLE = new Uint8Array([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
]);
const LOCK_CELL = 1 / ACTOR_PIXELS_PER_UNIT;
const LOCK_IRON = 0x8a8a90;

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
  facing?: CompiledDoor['direction'],
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
      if (face === 2 && facing !== undefined) {
        // A wall's top face with a known facing: the lip texture runs *along*
        // the wall, its top row on the room-side edge — see
        // `wallTopUv`. Without this the west and east walls laid the lip
        // across their thickness, so its edge band repeated down their
        // length as a ladder of stripes.
        const [u, v] = wallTopUv(positionAttr.getX(i), positionAttr.getZ(i), width, depth, facing);
        build.uvs.push(u0 + (u1 - u0) * u, v0 + (v1 - v0) * v);
      } else {
        build.uvs.push(
          u0 + (u1 - u0) * uvAttr.getX(i) * repeatU,
          v0 + (v1 - v0) * uvAttr.getY(i) * repeatV,
        );
      }
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

/**
 * Texture coordinates, in tile repeats, for a point `(x, z)` on the top face
 * of a wall box `width × depth` centred on the origin, facing the room from
 * its `facing` side. `u` runs along the wall's length; `v` is 0 on the
 * room-side edge and grows away from the room. Through the tile frame's own
 * flip (`Texture.uvs()`), `v` 0 is the tile image's *top* row — so the top
 * of the wall-lip image is always the edge a player looks at, on all four
 * walls, and the tile's long axis always follows the wall instead of
 * crossing it.
 *
 * The north wall maps exactly as before this existed (the box's own UVs
 * already put the image's top row on its room side); south, west and east
 * are what change.
 */
function wallTopUv(
  x: number,
  z: number,
  width: number,
  depth: number,
  facing: CompiledDoor['direction'],
): [number, number] {
  const tile = ROOM_TILE_UNITS;
  switch (facing) {
    case 'north':
      // Room side is +z.
      return [(x + width / 2) / tile, (depth / 2 - z) / tile];
    case 'south':
      // Room side is -z.
      return [(x + width / 2) / tile, (z + depth / 2) / tile];
    case 'west':
      // Room side is +x.
      return [(z + depth / 2) / tile, (width / 2 - x) / tile];
    case 'east':
      // Room side is -x.
      return [(z + depth / 2) / tile, (x + width / 2) / tile];
  }
}

/**
 * The wall-lip tile's layout, which a floor's lip art has to follow: its
 * top `LIP_EDGE_ROWS` pixel rows are the edge band a player sees along the
 * room (`wallTopUv` puts them on the room side), and the rows below them are
 * canopy that tiles seamlessly on its own in both directions — what the
 * inside of a wide wall top (a void, `appendVoidTop`) is filled with.
 */
const LIP_TILE_ROWS = 32;
const LIP_EDGE_ROWS = 8;
/**
 * `v` where the seamless canopy rows start (`v` 0 is the image's top row,
 * `wallTopUv`), nudged a hair inside them so nearest sampling at the boundary
 * never picks up the last row of the edge band.
 */
const LIP_BODY_V = LIP_EDGE_ROWS / LIP_TILE_ROWS + 1e-3;
/** Room units one repeat of the canopy rows covers, at the tile's own pixel density. */
const LIP_BODY_UNITS = (ROOM_TILE_UNITS * (LIP_TILE_ROWS - LIP_EDGE_ROWS)) / LIP_TILE_ROWS;

/**
 * One upward-facing quad into `build`, corners `(x0, z0)`–`(x1, z1)` at
 * `height`, `uv` given per corner in the order (x0,z0), (x1,z0), (x1,z1),
 * (x0,z1) and already in tile-space (`baseUv` applied by the caller).
 */
function appendTopQuad(
  build: MeshBuild,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  height: number,
  uv: readonly number[],
): void {
  const base = build.positions.length / 3;
  build.positions.push(x0, height, z0, x1, height, z0, x1, height, z1, x0, height, z1);
  build.normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
  build.uvs.push(...uv);
  // Wound so the front face points up (+y), like `BoxGeometry`'s own top.
  build.indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
}

/**
 * The top of a void box — the slot an `L`/`T` room's footprint never
 * claimed, drawn as wall. Not one repeating face: a void is up to a whole
 * screen across, and repeating the wall-lip tile over it repeated the lip's
 * edge band every tile, the same ladder of stripes the west and east walls
 * had before `wallTopUv`. Instead, a strip one tile deep along every side
 * that faces the room gets the full lip, edge towards the room, exactly like
 * a wall; the rest is filled with the lip's seamless canopy rows only.
 */
function appendVoidTop(
  build: MeshBuild,
  rect: RoomRect,
  room: RoomGeometry,
  height: number,
  baseUv: readonly [number, number, number, number],
): void {
  const tile = ROOM_TILE_UNITS;
  const [u0, v0, u1, v1] = baseUv;
  const map = (u: number, v: number): [number, number] => [u0 + (u1 - u0) * u, v0 + (v1 - v0) * v];
  // A side faces the room when it is not the room's own outer bound.
  const strip = {
    north: rect.minY > room.minY ? Math.min(tile, rect.maxY - rect.minY) : 0,
    south: rect.maxY < room.maxY ? Math.min(tile, rect.maxY - rect.minY) : 0,
    west: rect.minX > room.minX ? Math.min(tile, rect.maxX - rect.minX) : 0,
    east: rect.maxX < room.maxX ? Math.min(tile, rect.maxX - rect.minX) : 0,
  };
  // One lip run along a side: tile-long pieces, each laid out like a wall
  // segment of that facing (named for the wall whose room side it shares).
  const run = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    facing: CompiledDoor['direction'],
  ): void => {
    const alongX = facing === 'north' || facing === 'south';
    const from = alongX ? x0 : z0;
    const to = alongX ? x1 : z1;
    for (let at = from; at < to; at += tile) {
      const end = Math.min(to, at + tile);
      const px0 = alongX ? at : x0;
      const px1 = alongX ? end : x1;
      const pz0 = alongX ? z0 : at;
      const pz1 = alongX ? z1 : end;
      const w = px1 - px0;
      const d = pz1 - pz0;
      const cx = (px0 + px1) / 2;
      const cz = (pz0 + pz1) / 2;
      const uv: number[] = [];
      for (const [x, z] of [
        [px0, pz0],
        [px1, pz0],
        [px1, pz1],
        [px0, pz1],
      ] as const) {
        // Each piece is at most one tile long and starts on a tile step from
        // the run's start, so the lip's repeat carries on across pieces.
        const [u, v] = wallTopUv(x - cx, z - cz, w, d, facing);
        uv.push(...map(u, v));
      }
      appendTopQuad(build, px0, pz0, px1, pz1, height, uv);
    }
  };
  // North/south strips take the full width, so the corners are theirs.
  if (strip.south > 0) {
    run(rect.minX, rect.maxY - strip.south, rect.maxX, rect.maxY, 'north');
  }
  if (strip.north > 0) {
    run(rect.minX, rect.minY, rect.maxX, rect.minY + strip.north, 'south');
  }
  const innerZ0 = rect.minY + strip.north;
  const innerZ1 = rect.maxY - strip.south;
  if (strip.east > 0 && innerZ1 > innerZ0) {
    run(rect.maxX - strip.east, innerZ0, rect.maxX, innerZ1, 'west');
  }
  if (strip.west > 0 && innerZ1 > innerZ0) {
    run(rect.minX, innerZ0, rect.minX + strip.west, innerZ1, 'east');
  }
  // The inside: canopy rows only, at the tile's own pixel density.
  const innerX0 = rect.minX + strip.west;
  const innerX1 = rect.maxX - strip.east;
  for (let z0 = innerZ0; z0 < innerZ1; z0 += LIP_BODY_UNITS) {
    const z1 = Math.min(innerZ1, z0 + LIP_BODY_UNITS);
    for (let x0 = innerX0; x0 < innerX1; x0 += tile) {
      const x1 = Math.min(innerX1, x0 + tile);
      // One canopy repeat runs from the image's bottom row (`v` 1) up to the
      // edge band (`LIP_BODY_V`); seamless, so the repeats butt cleanly.
      const vTop = 1;
      const vBottom = vTop - ((vTop - LIP_BODY_V) * (z1 - z0)) / LIP_BODY_UNITS;
      const uR = (x1 - x0) / tile;
      appendTopQuad(build, x0, z0, x1, z1, height, [
        ...map(0, vTop),
        ...map(uR, vTop),
        ...map(uR, vBottom),
        ...map(0, vBottom),
      ]);
    }
  }
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
  private hints: Mesh<BufferGeometry, MeshBasicMaterial> | null = null;
  private lean: number;
  /** Doorway directions that lead to a secret room — a revealed one draws blasted, not hinged (#5). */
  private secretDoorDirections: ReadonlySet<CompiledDoor['direction']> = new Set();
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
    secretDoorDirections: ReadonlySet<CompiledDoor['direction']> = new Set(),
  ) {
    this.room = room;
    this.art = art;
    this.lean = lean;
    this.lighting = lighting;
    this.materials = materials;
    this.secretDoorDirections = secretDoorDirections;
    this.wallHeight = art.tiles?.wallHeight ?? DEFAULT_WALL_HEIGHT;
    const frame = roomFrameSize(room);
    this.frameWidth = frame.width;
    this.frameHeight = frame.height;
    const theme = roomThemeForFloor(floor);

    this.buildFloor(theme.floor, theme.wall);
    this.buildWalls(doors);
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

  private buildWalls(doors: readonly CompiledDoor[]): void {
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
          this.lighting,
          this.materials,
          this.secretDoorDirections.has(direction),
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
    this.addWallBox(
      centre.x,
      height / 2,
      centre.z,
      width,
      height,
      depth,
      direction !== 'north',
      direction,
    );
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
        undefined,
        rect,
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
    facing?: CompiledDoor['direction'],
    voidRect?: RoomRect,
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
    if (voidRect !== undefined) {
      appendVoidTop(top, voidRect, this.room, height, tiles.wallLip.uvs());
    } else {
      appendBox(top, cx, cy, cz, width, height, depth, tiles.wallLip.uvs(), true, facing);
    }
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
    // A slick puddle is the one thing in the room that reflects. It is a
    // wobbly blob, not the rectangle it used to be (which read as "a darker
    // floor tile"): a triangle fan whose rim radius wanders with the angle,
    // fitted to the authored rect, plus a lighter outline loop for the wet
    // edge. The wobble is seeded off the rect's own corner, so two puddles in
    // a room are shaped differently but each one is the same every visit.
    const fillMaterial = this.materials.flatMaterial(ROOM_HAZARD_PALETTE.puddleFill, {
      roughness: 0.15,
      metalness: 0.6,
      transparent: true,
      opacity: 0.85,
    });
    for (let i = 0; i < room.puddleCount; i++) {
      const minX = room.puddles[i * BLOCK_STRIDE] ?? 0;
      const minY = room.puddles[i * BLOCK_STRIDE + 1] ?? 0;
      const maxX = room.puddles[i * BLOCK_STRIDE + 2] ?? 0;
      const maxY = room.puddles[i * BLOCK_STRIDE + 3] ?? 0;
      const cx = (minX + maxX) / 2;
      const cz = (minY + maxY) / 2;
      // The fan reaches to a mean radius of ~0.5 of the rect (with the wobble
      // on top), so a puddle sits inside its authored footprint rather than
      // spilling past it.
      const halfW = (maxX - minX) / 2;
      const halfH = (maxY - minY) / 2;
      const seed = ((minX * 13 + minY * 7) % 628) / 100;

      const fill = new Mesh(puddleBlobGeometry(halfW, halfH, seed, false), fillMaterial);
      fill.position.set(cx, DECAL_HEIGHT, cz);
      fill.receiveShadow = true;
      this.group.add(fill);

      const rim = new LineLoop(puddleBlobGeometry(halfW, halfH, seed, true), PUDDLE_RIM_MATERIAL);
      rim.position.set(cx, DECAL_HEIGHT + 0.02, cz);
      this.group.add(rim);
    }
    // Floor 3's Waldbach (#403): flowing water edge to edge, banked wherever
    // it meets dry floor — see `stream.ts`.
    buildStreams(room, this.group);
    // A hop trellis blocks a shot's line but not a body: dense enough to hide
    // behind, so it stands, and green enough to read as hops. Built as a row
    // of posts with a top rail and a bine strung between them — not the solid
    // translucent slab it used to be, which read as "a green box" a player
    // could not tell was a see-through hop row rather than a wall.
    const trellis = this.materials.flatMaterial(ROOM_HAZARD_PALETTE.trellisFill, {
      roughness: 0.9,
      transparent: true,
      opacity: 0.92,
    });
    for (let i = 0; i < room.sightBlockCount; i++) {
      const minX = room.sightBlocks[i * BLOCK_STRIDE] ?? 0;
      const minY = room.sightBlocks[i * BLOCK_STRIDE + 1] ?? 0;
      const maxX = room.sightBlocks[i * BLOCK_STRIDE + 2] ?? 0;
      const maxY = room.sightBlocks[i * BLOCK_STRIDE + 3] ?? 0;
      const alongZ = maxY - minY >= maxX - minX;
      const runLength = alongZ ? maxY - minY : maxX - minX;
      const posts = Math.max(2, Math.round(runLength / 20) + 1);
      const add = (mesh: Mesh): void => {
        mesh.castShadow = true;
        mesh.layers.set(ACTOR_LAYER);
        this.group.add(mesh);
      };
      for (let p = 0; p < posts; p++) {
        const t = posts === 1 ? 0.5 : p / (posts - 1);
        const post = new Mesh(new BoxGeometry(1.6, TRELLIS_HEIGHT, 1.6), trellis);
        post.position.set(
          alongZ ? (minX + maxX) / 2 : minX + t * (maxX - minX),
          TRELLIS_HEIGHT / 2,
          alongZ ? minY + t * (maxY - minY) : (minY + maxY) / 2,
        );
        add(post);
      }
      // Top rail + a bine strung a third of the way down: two thin slabs that
      // still block a shot's line (the sim already does) but read as strung
      // wire, not wall.
      for (const height of [TRELLIS_HEIGHT - 1, TRELLIS_HEIGHT * 0.55]) {
        const rail = new Mesh(
          new BoxGeometry(alongZ ? 1 : maxX - minX, 0.8, alongZ ? maxY - minY : 1),
          trellis,
        );
        rail.position.set((minX + maxX) / 2, height, (minY + maxY) / 2);
        add(rail);
      }
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
    // Baked onto a pixel grid rather than drawn as lines: at display
    // resolution a line is one hair-thin screen pixel, where every other mark
    // in the room is pixel art (`world/pixel-shape.ts`). Each cell is about
    // one internal pixel on screen — `CRACK_CELL_HEIGHT` is taller than it is
    // wide because the camera looks down the wall face.
    const positions: number[] = [];
    const room = this.room;
    const height = this.wallHeight;
    const cols = Math.ceil((CRACK_HALF_WIDTH * 2) / CRACK_CELL_WIDTH) + 1;
    const rows = Math.ceil(height / CRACK_CELL_HEIGHT);
    const filled = new Uint8Array(cols * rows);
    for (const door of doors) {
      const centre = doorCentre(room, door);
      const alongX = door.direction === 'north' || door.direction === 'south';
      const inset = door.direction === 'north' ? 0.3 : door.direction === 'south' ? -0.3 : 0;
      const insetX = door.direction === 'west' ? 0.3 : door.direction === 'east' ? -0.3 : 0;
      const steps = 8;
      filled.fill(0);
      let previousCol = 0;
      let previousRow = 0;
      for (let i = 0; i <= steps; i++) {
        const y = 1 + (height - 2) * (i / steps);
        const wobble = (i % 2 === 0 ? -1 : 1) * CRACK_SPAN * 0.35 + Math.sin(i * 2.3) * 2;
        const col = Math.floor((wobble + CRACK_HALF_WIDTH) / CRACK_CELL_WIDTH);
        const row = Math.floor(y / CRACK_CELL_HEIGHT);
        if (i > 0) {
          plotPixelLine(filled, cols, rows, previousCol, previousRow, col, row);
        }
        previousCol = col;
        previousRow = row;
      }
      const runs = pixelRuns(cols, rows, filled);
      for (let i = 0; i < runs.length; i += 3) {
        const u0 = (runs[i] ?? 0) * CRACK_CELL_WIDTH - CRACK_HALF_WIDTH;
        const u1 = (runs[i + 1] ?? 0) * CRACK_CELL_WIDTH - CRACK_HALF_WIDTH;
        const y0 = (runs[i + 2] ?? 0) * CRACK_CELL_HEIGHT;
        const y1 = y0 + CRACK_CELL_HEIGHT;
        if (alongX) {
          const z = centre.y + inset;
          const x0 = centre.x + u0;
          const x1 = centre.x + u1;
          positions.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z);
        } else {
          const x = centre.x + insetX;
          const z0 = centre.y + u0;
          const z1 = centre.y + u1;
          positions.push(x, y0, z0, x, y0, z1, x, y1, z1, x, y0, z0, x, y1, z1, x, y1, z0);
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    this.hints = new Mesh(geometry, secretHintMaterial());
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
/** How far the zigzag reaches either side of the door's centre, in room units. */
const CRACK_HALF_WIDTH = CRACK_SPAN * 0.35 + 2;
/** One cell of the crack's baked outline: a sprite texel wide. */
const CRACK_CELL_WIDTH = 1 / ACTOR_PIXELS_PER_UNIT;
/** ...and as tall as it takes to cover the same span on screen, up a wall seen from `ELEVATION`. */
const CRACK_CELL_HEIGHT = CRACK_CELL_WIDTH / Math.cos(ELEVATION);

let hintMaterialCache: MeshBasicMaterial | null = null;

/** The secret-hint crack material — one instance for the run, like every other material `Scenery` now borrows. */
function secretHintMaterial(): MeshBasicMaterial {
  return (hintMaterialCache ??= new MeshBasicMaterial({
    color: ROOM_HAZARD_PALETTE.crack,
    transparent: true,
    opacity: 0.9,
    side: DoubleSide,
  }));
}
