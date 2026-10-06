import {
  BufferAttribute,
  BufferGeometry,
  type Group,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  RepeatWrapping,
  type Texture as ThreeTexture,
} from 'three';
import { ROOM_TILE_UNITS } from '../../content/rooms/definition.js';
import type { RoomGeometry, StreamCourse } from '../../sim/room/geometry.js';
import { textureFromPixels } from '../gfx/index.js';
import { ACTOR_PIXELS_PER_UNIT } from '../resolution.js';
import { DECAL_HEIGHT } from './flat.js';

/**
 * Floor 3's Waldbach (#403, #424), drawn: a ribbon of flowing water curving
 * across the floor along the stream's course (`RoomGeometry.streamCourses`),
 * with a pebble bank along both edges, so the player sees where the slick
 * footing starts. The simulation's footing is the same course in tile-wide
 * steps, so the drawn bank and the slick can differ by up to half a tile.
 *
 * The water is one tiling pixel texture, two authored pixels per room unit
 * (`ACTOR_PIXELS_PER_UNIT`, the density every sprite is drawn at), its UVs
 * baked from world position so the pieces of a multi-cell stream and the
 * legs of a bend line up without a seam. It flows by scrolling that one
 * shared texture's offset a whole texel at a time (`advanceStreamFlow`) — a
 * stepped scroll keeps the pixels crisp, where a smooth sub-texel slide would
 * smear them. A horizontal leg flows along x, a vertical leg along z, each
 * from its own texture so one offset never has to mean two directions.
 *
 * The materials are module-level and never disposed, the same as
 * `MaterialCache`'s: a stream is in a handful of rooms per floor, and a
 * material shape linked once should stay linked (`docs/DECISIONS.md` #80).
 */

/** Pixels in one repeat of the water texture — one floor tile, at the sprite density. */
const WATER_PIXELS = ROOM_TILE_UNITS * ACTOR_PIXELS_PER_UNIT;
/** How far the bank reaches onto dry ground, in room units. */
const BANK_DEPTH = 2;
/** Pixels across the bank strip. */
const BANK_PIXELS = BANK_DEPTH * ACTOR_PIXELS_PER_UNIT;
/** Pixels along one repeat of the bank texture. */
const BANK_REPEAT_PIXELS = 16;
/** Water flow, in texture pixels per second. */
const FLOW_PIXELS_PER_SECOND = 10;

/**
 * The signed-off look (#403): clear teal water with darker and lighter
 * streaks running with the current, white riffles, and a grey pebble bank
 * with a pale waterline right on the edge of the slow zone. Picked over a
 * near-black forest water and a moonlit blue for contrast — the stream has to
 * read on the dark wald floor at a glance, mid-fight.
 */
const STREAM_STYLE = {
  water: 0x2a6f7c,
  deep: 0x1d5260,
  light: 0x4f9aa3,
  foam: 0xcdeeee,
  waterline: 0x9fd8d8,
  bank: 0x6b6e66,
  bankDark: 0x3f413c,
  bankLight: 0xa3a69a,
  roughness: 0.35,
  metalness: 0.2,
} as const;

type StreamStyle = typeof STREAM_STYLE;

/** A deterministic hash for the texture patterns — no RNG stream is touched. */
function hash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * One tile of water, flowing along x: the body colour, long darker and
 * lighter streaks running with the current, and a few foam flecks. Seamless
 * in both directions because every streak wraps modulo the tile.
 */
function waterPixels(style: StreamStyle): Int32Array {
  const size = WATER_PIXELS;
  const pixels = new Int32Array(size * size).fill(style.water);
  for (let row = 0; row < size; row++) {
    // Each row gets at most a couple of streaks; their length and start are hashed.
    for (let streak = 0; streak < 2; streak++) {
      const roll = hash(row, streak, 1);
      if (roll > 0.55) {
        continue;
      }
      const colour = roll < 0.3 ? style.deep : style.light;
      const start = Math.floor(hash(row, streak, 2) * size);
      const length = 4 + Math.floor(hash(row, streak, 3) * 10);
      for (let i = 0; i < length; i++) {
        pixels[row * size + ((start + i) % size)] = colour;
      }
    }
  }
  for (let fleck = 0; fleck < 6; fleck++) {
    const x = Math.floor(hash(fleck, 0, 4) * size);
    const y = Math.floor(hash(fleck, 1, 4) * size);
    pixels[y * size + x] = style.foam;
    pixels[y * size + ((x + 1) % size)] = style.foam;
  }
  return pixels;
}

/** The same tile turned a quarter, for a leg that flows along z. */
function transposed(pixels: Int32Array, size: number): Int32Array {
  const out = new Int32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[x * size + y] = pixels[y * size + x] ?? 0;
    }
  }
  return out;
}

/**
 * One repeat of the bank, `BANK_REPEAT_PIXELS` along the edge by
 * `BANK_PIXELS` across it. Row 0 sits against the water: a bright waterline,
 * then the bank's own colour scattered with darker and lighter stones.
 */
function bankPixels(style: StreamStyle): Int32Array {
  const width = BANK_REPEAT_PIXELS;
  const height = BANK_PIXELS;
  const pixels = new Int32Array(width * height).fill(style.bank);
  for (let x = 0; x < width; x++) {
    pixels[x] = style.waterline;
    for (let y = 1; y < height; y++) {
      const roll = hash(x, y, 7);
      if (roll < 0.25) {
        pixels[y * width + x] = style.bankDark;
      } else if (roll > 0.82) {
        pixels[y * width + x] = style.bankLight;
      }
    }
  }
  return pixels;
}

function repeatingMap(width: number, height: number, pixels: Int32Array): ThreeTexture {
  const map = textureFromPixels(width, height, pixels).source.texture;
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.magFilter = NearestFilter;
  map.minFilter = NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return map;
}

interface StreamMaterials {
  readonly flowX: MeshStandardMaterial;
  readonly flowZ: MeshStandardMaterial;
  readonly bank: MeshStandardMaterial;
}

let materials: StreamMaterials | null = null;

function streamMaterials(): StreamMaterials {
  if (materials !== null) {
    return materials;
  }
  const style = STREAM_STYLE;
  const water = waterPixels(style);
  const options = { roughness: style.roughness, metalness: style.metalness };
  materials = {
    flowX: new MeshStandardMaterial({
      map: repeatingMap(WATER_PIXELS, WATER_PIXELS, water),
      ...options,
    }),
    flowZ: new MeshStandardMaterial({
      map: repeatingMap(WATER_PIXELS, WATER_PIXELS, transposed(water, WATER_PIXELS)),
      ...options,
    }),
    bank: new MeshStandardMaterial({
      map: repeatingMap(BANK_REPEAT_PIXELS, BANK_PIXELS, bankPixels(style)),
      roughness: 0.95,
    }),
  };
  return materials;
}

/**
 * Scrolls every stream's water to where the current has carried it at
 * `nowMs`. Called once a frame by `GameView.sync`; a whole-texel step, so
 * the pattern moves in pixels rather than smearing between them.
 */
export function advanceStreamFlow(nowMs: number): void {
  if (materials === null) {
    return;
  }
  const texels = Math.floor((nowMs / 1000) * FLOW_PIXELS_PER_SECOND) % WATER_PIXELS;
  const offset = -texels / WATER_PIXELS;
  const flowX = materials.flowX.map;
  const flowZ = materials.flowZ.map;
  if (flowX !== null) {
    flowX.offset.x = offset;
  }
  if (flowZ !== null) {
    flowZ.offset.y = offset;
  }
}

/** How finely a course is sampled into the ribbon, in room units along the flow. */
const RIBBON_STEP = 2;
/** How far the drawn edge wanders off the course's own width, in room units — a bank is not ruled. */
const EDGE_WOBBLE = 1;
/** Over how many room units before a wall the stream's end is turned to lie along it — see `sections`. */
const SQUARE_OFF = 14;
/** How far the end of a stream runs on under the wall it meets, in room units, so no floor shows between them. */
const WALL_TUCK = 3;
/** How many times the course is averaged with its neighbours before it is splined — see `sections`. */
const SMOOTHING_PASSES = 2;

/** Catmull-Rom through four evenly spaced values, at `t` between the middle two. */
function spline(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3)
  );
}

/**
 * One cross-section of the drawn stream: its two banks (`a` on the left of
 * the flow, `b` on the right), the unit vector pointing from `a` to `b`, how
 * far along the course it is, and whether the water runs mostly along x here.
 */
interface Section {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly nx: number;
  readonly nz: number;
  readonly travelled: number;
  readonly alongX: boolean;
}

/**
 * A course as a run of cross-sections about `RIBBON_STEP` apart: the
 * centreline and width splined through the course's points, so the tile-wide
 * steps the simulation stands on come out as one curving bank, whichever way
 * the stream runs and wherever it bends. The first and last sections sit
 * exactly on the course's ends, so the pieces of a multi-cell stream — and a
 * stream and the wall it meets — join without a gap.
 */
function sections(course: StreamCourse, room: RoomGeometry): Section[] {
  const points = course.points;
  if (points.length < 2) {
    return [];
  }
  const clamp = (index: number): number => Math.max(0, Math.min(points.length - 1, index));
  // The course is whole tiles — a slice is one tile over from the last, or
  // one tile wider — and a spline through that draws every step as a peak.
  // Two passes of a 1-2-1 average round the steps into bends first; the ends
  // are left where they are, so a stream still meets a wall on its lane.
  const relaxed = (read: (index: number) => number): number[] => {
    let values = points.map((_point, index) => read(index));
    for (let pass = 0; pass < SMOOTHING_PASSES; pass++) {
      values = values.map((value, index) =>
        index === 0 || index === values.length - 1
          ? value
          : ((values[index - 1] ?? value) + value * 2 + (values[index + 1] ?? value)) / 4,
      );
    }
    return values;
  };
  const xs = relaxed((index) => points[index]?.x ?? 0);
  const zs = relaxed((index) => points[index]?.y ?? 0);
  const halves = relaxed((index) => points[index]?.halfWidth ?? 0);
  const at = (values: readonly number[], index: number, t: number): number =>
    spline(
      values[clamp(index - 1)] ?? 0,
      values[clamp(index)] ?? 0,
      values[clamp(index + 1)] ?? 0,
      values[clamp(index + 2)] ?? 0,
      t,
    );

  const centres: { x: number; z: number; half: number }[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const length = Math.hypot(
      (xs[index + 1] ?? 0) - (xs[index] ?? 0),
      (zs[index + 1] ?? 0) - (zs[index] ?? 0),
    );
    const pieces = Math.max(1, Math.round(length / RIBBON_STEP));
    for (let piece = 0; piece < pieces + (index === points.length - 2 ? 1 : 0); piece++) {
      const t = piece / pieces;
      centres.push({
        x: at(xs, index, t),
        z: at(zs, index, t),
        half: Math.max(2, at(halves, index, t)),
      });
    }
  }

  const clampX = (x: number): number => Math.max(room.minX, Math.min(room.maxX, x));
  const clampZ = (z: number): number => Math.max(room.minY, Math.min(room.maxY, z));
  // Where an end of the course is on a wall: the direction along that wall,
  // and the way out through it. A cut made square to the stream's own
  // heading leaves a slanted end hanging short of the wall it arrives at on
  // a bend; a cut made along the wall, tucked just under it, does not.
  const wallAt = (
    centre: { x: number; z: number } | undefined,
  ): { ax: number; az: number; outX: number; outZ: number } | null => {
    if (centre === undefined) {
      return null;
    }
    if (Math.abs(centre.x - room.minX) < 1) {
      return { ax: 0, az: 1, outX: -1, outZ: 0 };
    }
    if (Math.abs(centre.x - room.maxX) < 1) {
      return { ax: 0, az: 1, outX: 1, outZ: 0 };
    }
    if (Math.abs(centre.z - room.minY) < 1) {
      return { ax: 1, az: 0, outX: 0, outZ: -1 };
    }
    if (Math.abs(centre.z - room.maxY) < 1) {
      return { ax: 1, az: 0, outX: 0, outZ: 1 };
    }
    return null;
  };
  const lastIndex = centres.length - 1;
  const ends = [
    { wall: wallAt(centres[0]), index: 0 },
    { wall: wallAt(centres[lastIndex]), index: lastIndex },
  ];
  const out: Section[] = [];
  let travelled = 0;
  centres.forEach((centre, index) => {
    const before = centres[Math.max(0, index - 1)] ?? centre;
    const after = centres[Math.min(lastIndex, index + 1)] ?? centre;
    const tx = after.x - before.x;
    const tz = after.z - before.z;
    const length = Math.hypot(tx, tz) || 1;
    // Across the flow, a quarter turn from along it.
    let nx = -tz / length;
    let nz = tx / length;
    let tuckX = 0;
    let tuckZ = 0;
    for (const end of ends) {
      if (end.wall === null) {
        continue;
      }
      // Turned toward the wall's own line over the last stretch before it.
      const near = 1 - (Math.abs(index - end.index) * RIBBON_STEP) / SQUARE_OFF;
      if (near <= 0) {
        continue;
      }
      const side = nx * end.wall.ax + nz * end.wall.az < 0 ? -1 : 1;
      const mx = nx * (1 - near) + end.wall.ax * side * near;
      const mz = nz * (1 - near) + end.wall.az * side * near;
      const size = Math.hypot(mx, mz) || 1;
      nx = mx / size;
      nz = mz / size;
      if (index === end.index) {
        tuckX = end.wall.outX * WALL_TUCK;
        tuckZ = end.wall.outZ * WALL_TUCK;
      }
    }
    if (index > 0) {
      travelled += Math.hypot(centre.x - before.x, centre.z - before.z);
    }
    // Each bank wanders on its own slow wave, keyed to world position so
    // neighbouring pieces agree where they meet.
    const key = centre.x + centre.z;
    const left =
      centre.half + (Math.sin(key * 0.21) * 0.6 + Math.sin(key * 0.083 + 1.7) * 0.4) * EDGE_WOBBLE;
    const right =
      centre.half +
      (Math.sin(key * 0.17 + 2.3) * 0.6 + Math.sin(key * 0.071 + 0.4) * 0.4) * EDGE_WOBBLE;
    out.push({
      ax: clampX(centre.x - nx * left) + tuckX,
      az: clampZ(centre.z - nz * left) + tuckZ,
      bx: clampX(centre.x + nx * right) + tuckX,
      bz: clampZ(centre.z + nz * right) + tuckZ,
      nx,
      nz,
      travelled,
      alongX: Math.abs(tx) >= Math.abs(tz),
    });
  });
  return out;
}

/** A point on the floor plane with its texture coordinates. */
type Vertex = readonly [x: number, z: number, u: number, v: number];

/**
 * A strip on the floor plane between two edges that run with the flow:
 * `near` and `far` give each section's two vertices. Wound to face up
 * whichever way the stream runs.
 */
function strip(
  run: readonly Section[],
  height: number,
  near: (section: Section) => Vertex,
  far: (section: Section) => Vertex,
): BufferGeometry {
  const count = run.length;
  const positions = new Float32Array(count * 6);
  const normals = new Float32Array(count * 6);
  const uvs = new Float32Array(count * 4);
  run.forEach((section, i) => {
    const a = near(section);
    const b = far(section);
    positions.set([a[0], height, a[1], b[0], height, b[1]], i * 6);
    normals.set([0, 1, 0, 0, 1, 0], i * 6);
    uvs.set([a[2], a[3], b[2], b[3]], i * 4);
  });
  // Which way round faces up depends on the direction of travel, so it is
  // read off the first quad rather than assumed.
  const ax = positions[0] ?? 0;
  const az = positions[2] ?? 0;
  const up =
    ((positions[5] ?? 0) - az) * ((positions[6] ?? 0) - ax) -
      ((positions[3] ?? 0) - ax) * ((positions[8] ?? 0) - az) >
    0;
  const index: number[] = [];
  for (let i = 0; i < count - 1; i++) {
    const a0 = i * 2;
    const b0 = a0 + 1;
    const a1 = a0 + 2;
    const b1 = a0 + 3;
    if (up) {
      index.push(a0, b0, a1, b0, b1, a1);
    } else {
      index.push(a0, a1, b0, b0, a1, b1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Builds every stream in `room` into `group` (#424): the water as one curving
 * ribbon per course, and a pebble bank along both of its edges. An edge that
 * would leave the room — a stream squeezed against a wall — is pinned to the
 * wall, and the water simply runs up to it.
 */
export function buildStreams(room: RoomGeometry, group: Group): void {
  if (room.streamCourses.length === 0) {
    return;
  }
  const { flowX, flowZ, bank } = streamMaterials();
  const tile = ROOM_TILE_UNITS;
  const repeatUnits = BANK_REPEAT_PIXELS / ACTOR_PIXELS_PER_UNIT;
  for (const course of room.streamCourses) {
    const run = sections(course, room);
    if (run.length < 2) {
      continue;
    }
    // The water's UVs are world position over a tile, so every piece of a
    // stream continues one pattern. It scrolls along x or along z, whichever
    // the stream mostly runs here — so a bend is cut into stretches, each
    // sharing its end section with the next.
    let from = 0;
    for (let i = 1; i <= run.length; i++) {
      const here = run[i];
      const start = run[from];
      if (start === undefined || here?.alongX === start.alongX) {
        continue;
      }
      const stretch = run.slice(from, Math.min(run.length, i + 1));
      if (stretch.length >= 2) {
        const water = new Mesh(
          strip(
            stretch,
            DECAL_HEIGHT,
            (section) => [section.ax, section.az, section.ax / tile, section.az / tile],
            (section) => [section.bx, section.bz, section.bx / tile, section.bz / tile],
          ),
          start.alongX ? flowX : flowZ,
        );
        water.receiveShadow = true;
        group.add(water);
      }
      from = i;
    }

    // u runs along the bank in repeats of its texture; v is 0 at the water
    // and 1 at the bank's far side, so the waterline row sits on the edge.
    for (const side of [-1, 1] as const) {
      const banks = new Mesh(
        strip(
          run,
          DECAL_HEIGHT + 0.01,
          (section) => {
            const x = side < 0 ? section.ax : section.bx;
            const z = side < 0 ? section.az : section.bz;
            return [x, z, section.travelled / repeatUnits, 0];
          },
          (section) => {
            const x = (side < 0 ? section.ax : section.bx) + side * section.nx * BANK_DEPTH;
            const z = (side < 0 ? section.az : section.bz) + side * section.nz * BANK_DEPTH;
            return [
              Math.max(room.minX, Math.min(room.maxX, x)),
              Math.max(room.minY, Math.min(room.maxY, z)),
              section.travelled / repeatUnits,
              1,
            ];
          },
        ),
        bank,
      );
      banks.receiveShadow = true;
      group.add(banks);
    }
  }
}
