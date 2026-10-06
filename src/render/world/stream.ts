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
import { BLOCK_STRIDE, type RoomGeometry } from '../../sim/room/geometry.js';
import { textureFromPixels } from '../gfx/index.js';
import { ACTOR_PIXELS_PER_UNIT } from '../resolution.js';
import { DECAL_HEIGHT } from './flat.js';

/**
 * Floor 3's Waldbach (#403), drawn: a band of flowing water on the floor plane
 * with a bank along every edge that meets dry ground, so the player sees to
 * the pixel where the slow starts.
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
/** Bank segments are tested and merged at this resolution, in room units. */
const BANK_STEP = 1;
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

/**
 * A flat quad on the floor plane, normal up, with UVs given per corner — the
 * water's are world position over a tile, so neighbouring quads continue one
 * pattern; a bank's run along its edge and across its depth.
 */
function floorQuad(
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  height: number,
  uv: readonly [number, number, number, number, number, number, number, number],
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([
        minX,
        height,
        minZ,
        maxX,
        height,
        minZ,
        maxX,
        height,
        maxZ,
        minX,
        height,
        maxZ,
      ]),
      3,
    ),
  );
  geometry.setAttribute(
    'normal',
    new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3),
  );
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  // Wound so the front face points up (+y), the same as the puddle fan.
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  return geometry;
}

/** True when the point is dry floor inside the room — where a bank belongs. */
function dryFloor(room: RoomGeometry, x: number, z: number): boolean {
  return x > room.minX && x < room.maxX && z > room.minY && z < room.maxY && !room.isInStream(x, z);
}

/**
 * Builds every stream in `room` into `group`: the water, then a bank along
 * each stretch of edge whose far side is dry floor. An edge against the
 * room's own wall, or against another leg of the same stream (a bend's
 * inside corner), gets none — the water simply continues.
 */
export function buildStreams(room: RoomGeometry, group: Group): void {
  if (room.streamCount === 0) {
    return;
  }
  const { flowX, flowZ, bank } = streamMaterials();
  const tile = ROOM_TILE_UNITS;
  for (let i = 0; i < room.streamCount; i++) {
    const minX = room.streams[i * BLOCK_STRIDE] ?? 0;
    const minZ = room.streams[i * BLOCK_STRIDE + 1] ?? 0;
    const maxX = room.streams[i * BLOCK_STRIDE + 2] ?? 0;
    const maxZ = room.streams[i * BLOCK_STRIDE + 3] ?? 0;
    const alongX = maxX - minX >= maxZ - minZ;
    const water = new Mesh(
      floorQuad(minX, minZ, maxX, maxZ, DECAL_HEIGHT, [
        minX / tile,
        minZ / tile,
        maxX / tile,
        minZ / tile,
        maxX / tile,
        maxZ / tile,
        minX / tile,
        maxZ / tile,
      ]),
      alongX ? flowX : flowZ,
    );
    water.receiveShadow = true;
    group.add(water);

    // North and south edges run along x; west and east along z. `outward`
    // is which side of the edge the bank lies on.
    addBankRuns(room, group, bank, minX, maxX, minZ, -1, true);
    addBankRuns(room, group, bank, minX, maxX, maxZ, 1, true);
    addBankRuns(room, group, bank, minZ, maxZ, minX, -1, false);
    addBankRuns(room, group, bank, minZ, maxZ, maxX, 1, false);
  }
}

/**
 * Walks one edge of a stream rect in `BANK_STEP` pieces, keeps the pieces
 * whose outside is dry floor, and lays one bank strip per unbroken run of
 * them. `alongX` edges sit at z = `at`; the others at x = `at`.
 */
function addBankRuns(
  room: RoomGeometry,
  group: Group,
  material: MeshStandardMaterial,
  from: number,
  to: number,
  at: number,
  outward: number,
  alongX: boolean,
): void {
  const probe = at + outward * 0.5;
  let runStart = Number.NaN;
  for (let position = from; position <= to; position += BANK_STEP) {
    const middle = position + BANK_STEP / 2;
    const keep =
      position < to && (alongX ? dryFloor(room, middle, probe) : dryFloor(room, probe, middle));
    if (keep && Number.isNaN(runStart)) {
      runStart = position;
    } else if (!keep && !Number.isNaN(runStart)) {
      group.add(bankStrip(material, runStart, position, at, outward, alongX));
      runStart = Number.NaN;
    }
  }
}

function bankStrip(
  material: MeshStandardMaterial,
  from: number,
  to: number,
  at: number,
  outward: number,
  alongX: boolean,
): Mesh {
  const near = at;
  const far = at + outward * BANK_DEPTH;
  // u runs along the edge in repeats of the bank texture; v runs 0 at the
  // water to 1 at the bank's far side, so the waterline row sits on the edge.
  const repeatUnits = BANK_REPEAT_PIXELS / ACTOR_PIXELS_PER_UNIT;
  const u0 = from / repeatUnits;
  const u1 = to / repeatUnits;
  const lowNear = Math.min(near, far) === near;
  const vLow = lowNear ? 0 : 1;
  const vHigh = lowNear ? 1 : 0;
  const lo = Math.min(near, far);
  const hi = Math.max(near, far);
  const geometry = alongX
    ? floorQuad(from, lo, to, hi, DECAL_HEIGHT + 0.01, [u0, vLow, u1, vLow, u1, vHigh, u0, vHigh])
    : floorQuad(lo, from, hi, to, DECAL_HEIGHT + 0.01, [u0, vLow, u0, vHigh, u1, vHigh, u1, vLow]);
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}
