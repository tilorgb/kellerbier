import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
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
 * ## The front wall
 *
 * The wall nearest the camera is a kerb, `FRONT_WALL_HEIGHT` tall, however
 * tall the floor's walls are: at full height it would hide the room's near
 * rows, and a fixed camera cannot look past it.
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

const FRONT_WALL_HEIGHT = 5;
const WALL_THICKNESS = ROOM_TILE_UNITS;
/** How far past the room the dark base extends, so a letterboxed frame never shows void. */
const BLEED = ROOM_TILE_UNITS * 6;
const TRELLIS_HEIGHT = 14;
const DEFAULT_WALL_HEIGHT = 26;
const DOOR_GLOW = 0xff9a3c;

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
  private readonly glow: PointLight;
  private readonly span: number;
  private readonly doorHeight: number;
  private state: DoorState = 'closed';
  private opennessValue = 0;
  private double = false;
  private lock: Mesh | null = null;

  constructor(
    door: CompiledDoor,
    centreX: number,
    centreZ: number,
    span: number,
    wallHeight: number,
    wall: Texture | undefined,
    wallColour: number,
  ) {
    this.door = door;
    this.span = span;
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
      new MeshStandardMaterial({ color: 0x141018, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.06, -(reach + t / 2) / 2 + t / 4);
    floor.receiveShadow = true;
    this.group.add(floor);

    // The frame: two jambs and a lintel in dark timber, proud of the wall face.
    const timber = (): MeshStandardMaterial =>
      new MeshStandardMaterial({ color: FRAME_TIMBER, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const jamb = new Mesh(new BoxGeometry(JAMB, frameHeight, t + 1), timber());
      jamb.position.set(side * (span / 2 - JAMB / 2), frameHeight / 2, 0);
      jamb.castShadow = true;
      this.group.add(jamb);
    }
    const lintel = new Mesh(new BoxGeometry(span, LINTEL, t + 1), timber());
    lintel.position.set(0, this.doorHeight + LINTEL / 2, 0);
    lintel.castShadow = true;
    this.group.add(lintel);
    // Wall above the lintel, so the run reads as one wall with a doorway cut in it.
    if (wallHeight > frameHeight) {
      const above =
        wall === undefined
          ? flatBox(wallColour, span, wallHeight - frameHeight, t)
          : tiledBox(wall, span, wallHeight - frameHeight, t);
      above.position.set(0, frameHeight + (wallHeight - frameHeight) / 2, 0);
      this.group.add(above);
    }

    this.glow = new PointLight(DOOR_GLOW, 0, 60, 2);
    this.glow.position.set(0, 10, -t / 2);
    this.group.add(this.glow);

    this.buildLeaves();
    this.setState('closed');
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

  private buildLeaves(): void {
    for (const hinge of this.hinges) {
      hinge.traverse((object) => {
        if (object instanceof Mesh) {
          const mesh = object as Mesh;
          mesh.geometry.dispose();
          (mesh.material as MeshStandardMaterial).dispose();
        }
      });
      this.group.remove(hinge);
    }
    this.hinges.length = 0;
    this.lock = null;
    const inner = this.span / 2 - JAMB;
    const leafHeight = this.doorHeight - 0.5;
    const leafWidth = this.double ? inner - 0.25 : inner * 2 - 0.5;
    const sides = this.double ? [-1, 1] : [-1];
    for (const side of sides) {
      const hinge = new Group();
      hinge.position.set(side * inner, 0, 0);
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
      this.group.add(hinge);
    }
    // A padlock on the leading edge, shown only while the door is key-locked.
    const lock = new Mesh(
      new BoxGeometry(2, 2.5, 1.2),
      new MeshStandardMaterial({ color: LOCK_BRASS, roughness: 0.4, metalness: 0.6 }),
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
    for (const hinge of this.hinges) {
      hinge.traverse((object) => {
        if (object instanceof Mesh && object !== this.lock) {
          ((object as Mesh).material as MeshStandardMaterial).color.setHex(
            state === 'locked' ? LOCKED_TINT : 0xffffff,
          );
        }
      });
    }
    this.setOpenness(state === 'open' ? 1 : 0);
    this.glow.intensity = state === 'open' ? 120 : 0;
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
    this.glow.intensity = this.state === 'open' ? 120 + strength * 400 : 0;
  }

  dispose(): void {
    disposeMeshes(this.group);
    this.group.removeFromParent();
  }
}

/** Frees every mesh under `root` — geometry, material and the material's map. */
function disposeMeshes(root: Group): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    const mesh = object as Mesh;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      (material as MeshStandardMaterial).map?.dispose();
      material.dispose();
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

/** A textured box that tiles at one authored tile per `ROOM_TILE_UNITS` on every face. */
function tiledBox(
  texture: Texture,
  width: number,
  height: number,
  depth: number,
  topTexture: Texture = texture,
): Mesh {
  const geometry = new BoxGeometry(width, height, depth);
  const side = (w: number, h: number): MeshStandardMaterial =>
    new MeshStandardMaterial({ map: tilingTexture(texture, w, h), roughness: 0.95 });
  const top = new MeshStandardMaterial({
    map: tilingTexture(topTexture, width, depth),
    roughness: 0.95,
  });
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z.
  const mesh = new Mesh(geometry, [
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

function flatBox(colour: number, width: number, height: number, depth: number): Mesh {
  const mesh = new Mesh(
    new BoxGeometry(width, height, depth),
    new MeshStandardMaterial({ color: colour, roughness: 0.95 }),
  );
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
  private readonly billboards: Billboard[] = [];
  private readonly flats: FloorSprite[] = [];
  private hints: LineSegments | null = null;
  private lean: number;

  constructor(
    room: RoomGeometry,
    floor: number,
    doors: readonly CompiledDoor[],
    props: readonly DecorativeProp[],
    art: SceneryArt,
    lean: number,
  ) {
    this.room = room;
    this.art = art;
    this.lean = lean;
    this.wallHeight = art.tiles?.wallHeight ?? DEFAULT_WALL_HEIGHT;
    const frame = roomFrameSize(room);
    this.frameWidth = frame.width;
    this.frameHeight = frame.height;
    const theme = roomThemeForFloor(floor);

    this.buildFloor(theme.floor, theme.wall);
    this.buildWalls(doors, theme.wall);
    this.buildVoids(theme.wall);
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

  // ------------------------------------------------------------- floor

  private buildFloor(floorColour: number, wallColour: number): void {
    const room = this.room;
    const tiles = this.art.tiles;
    const interiorW = room.maxX - room.minX;
    const interiorH = room.maxY - room.minY;

    // The dark base under and beyond the walls, so nothing outside is void.
    const base = new Mesh(
      new PlaneGeometry(this.frameWidth + BLEED * 2, this.frameHeight + BLEED * 2),
      tiles === undefined
        ? new MeshStandardMaterial({ color: wallColour, roughness: 1 })
        : new MeshStandardMaterial({
            map: tilingTexture(
              tiles.wall,
              this.frameWidth + BLEED * 2,
              this.frameHeight + BLEED * 2,
            ),
            color: 0x555555,
            roughness: 1,
          }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(this.frameWidth / 2, -0.05, this.frameHeight / 2);
    base.receiveShadow = true;
    this.group.add(base);

    if (tiles === undefined || tiles.floorVariants.length === 0) {
      const floor = new Mesh(
        new PlaneGeometry(interiorW, interiorH),
        new MeshStandardMaterial({ color: floorColour, roughness: 0.9 }),
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
      const mesh = new Mesh(
        geometry,
        new MeshStandardMaterial({ map: texture.source.texture, roughness: 0.85 }),
      );
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
            wallColour,
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
        );
        this.doors.push(piece);
        this.group.add(piece.group);
        cursor = gapEnd;
      }
      if (to > cursor) {
        this.addWallSegment(place(cursor, to - cursor), to - cursor, height, direction, wallColour);
      }
    };

    const t = WALL_THICKNESS;
    run(room.minX - t, room.maxX + t, this.wallHeight, 'north', (start, length) => ({
      x: start + length / 2,
      z: room.minY - t / 2,
    }));
    run(room.minX - t, room.maxX + t, FRONT_WALL_HEIGHT, 'south', (start, length) => ({
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
    wallColour: number,
  ): void {
    const alongX = direction === 'north' || direction === 'south';
    const tiles = this.art.tiles;
    const width = alongX ? length : WALL_THICKNESS;
    const depth = alongX ? WALL_THICKNESS : length;
    const mesh =
      tiles === undefined
        ? flatBox(wallColour, width, height, depth)
        : tiledBox(tiles.wall, width, height, depth, tiles.wallLip);
    mesh.position.set(centre.x, height / 2, centre.z);
    this.group.add(mesh);
  }

  private buildVoids(wallColour: number): void {
    const tiles = this.art.tiles;
    for (const rect of this.room.voidRects) {
      const width = rect.maxX - rect.minX;
      const depth = rect.maxY - rect.minY;
      const mesh =
        tiles === undefined
          ? flatBox(wallColour, width, this.wallHeight, depth)
          : tiledBox(tiles.wall, width, this.wallHeight, depth, tiles.wallLip);
      mesh.position.set(
        (rect.minX + rect.maxX) / 2,
        this.wallHeight / 2,
        (rect.minY + rect.maxY) / 2,
      );
      this.group.add(mesh);
    }
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
        const box = flatBox(blockColour, maxX - minX, ROOM_TILE_UNITS * 0.8, maxY - minY);
        box.position.set((minX + maxX) / 2, ROOM_TILE_UNITS * 0.4, (minY + maxY) / 2);
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
        new MeshStandardMaterial({
          color: ROOM_HAZARD_PALETTE.puddleFill,
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
        new MeshStandardMaterial({
          color: ROOM_HAZARD_PALETTE.trellisFill,
          roughness: 0.9,
          transparent: true,
          opacity: 0.8,
        }),
      );
      mesh.position.set((minX + maxX) / 2, TRELLIS_HEIGHT / 2, (minY + maxY) / 2);
      mesh.castShadow = true;
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
      const wallHeight = door.direction === 'south' ? FRONT_WALL_HEIGHT : height;
      const steps = 8;
      let previous: [number, number, number] | null = null;
      for (let i = 0; i <= steps; i++) {
        const y = 1 + (wallHeight - 2) * (i / steps);
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
    this.hints = new LineSegments(
      geometry,
      new LineBasicMaterial({ color: ROOM_HAZARD_PALETTE.crack, transparent: true, opacity: 0.9 }),
    );
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
