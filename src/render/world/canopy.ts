import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  PlaneGeometry,
  RGBADepthPacking,
} from 'three';
import { ROOM_TILE_UNITS } from '../../content/rooms/definition.js';
import { ACTOR_LAYER } from './layers.js';

/**
 * Floor 3's forest light (#424): the whole room in shade, with a few places
 * where the sun gets through.
 *
 * Dorf & Acker's clouds are planes that cast a real shadow as they drift
 * (`world/lighting.ts`). Der Wald turns that inside out: one plane covers the
 * whole room and casts the same shadow everywhere, and the *holes* in it are
 * what the player sees — a sunlit patch on the floor that also lights the
 * barrel and the body standing in it, because it is the key light itself
 * getting through, not a decal. Nothing moves, so the shadow map renders once
 * per room, the same as a cellar's.
 *
 * Where the holes are is a pure function of a seed (`canopyLayout`): the same
 * room has the same clearings on a revisit and in a replay, and no template
 * has to author them.
 */

/** What a room's canopy looks like: ordinary patches, the boss room's one big clearing, or no gap at all. */
export type CanopyKind = 'ordinary' | 'boss' | 'closed';

/** One lumpy hole in the canopy, as an ellipse on the floor (room units) that a silhouette is stretched over. */
export interface CanopyGap {
  readonly x: number;
  readonly z: number;
  readonly radiusX: number;
  readonly radiusZ: number;
  /** Radians, about the vertical. */
  readonly rotation: number;
  /** Index into `GAP_SILHOUETTES`. */
  readonly silhouette: number;
}

/** A break in the tree line: a bar of sun through `(x, z)` at `angle`, running wall to wall. */
export interface CanopyBand {
  readonly x: number;
  readonly z: number;
  /** Radians from the room's east-west axis. */
  readonly angle: number;
  readonly halfWidth: number;
}

export interface CanopyLayout {
  readonly gaps: readonly CanopyGap[];
  readonly band: CanopyBand | null;
}

/** One single-screen cell of room, in room units — what "per room" counts below are per. */
const CELL_AREA = 320 * 180;
/** The share of an ordinary room's floor the gaps aim to light. */
export const CANOPY_LIT_SHARE = 0.26;
/**
 * Openings per single-cell room: this many, or one more. Two or three (the
 * first pass) left an ordinary room reading almost as dark as a lantern room;
 * four or five is a wood the sun gets into.
 */
export const GAPS_PER_CELL = 4;
/** One room in this many swaps a gap for a band. */
export const CANOPY_BAND_ODDS = 4;
/** A band's width, in tiles. */
const BAND_TILES = 2;
/** How much of its bounding ellipse a lumpy silhouette actually opens — see `GAP_SILHOUETTES`. */
const SILHOUETTE_FILL = 0.7;
/** The boss room's clearing, as a fraction of the room's width and depth. */
const BOSS_CLEARING = 0.32;

interface Puff {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * The gap shapes a patch picks from, as discs in a unit square centred on
 * (0.5, 0.5) — unions of lobes, the way the cloud silhouettes are built, so a
 * gap reads as the space between treetops rather than as a spotlight.
 */
const GAP_SILHOUETTES: readonly (readonly Puff[])[] = [
  [
    { x: 0.42, y: 0.45, r: 0.3 },
    { x: 0.62, y: 0.52, r: 0.27 },
    { x: 0.5, y: 0.68, r: 0.2 },
    { x: 0.3, y: 0.62, r: 0.16 },
    { x: 0.7, y: 0.34, r: 0.15 },
  ],
  [
    { x: 0.5, y: 0.5, r: 0.32 },
    { x: 0.3, y: 0.42, r: 0.2 },
    { x: 0.72, y: 0.58, r: 0.2 },
    { x: 0.45, y: 0.26, r: 0.14 },
    { x: 0.58, y: 0.76, r: 0.14 },
  ],
  [
    { x: 0.32, y: 0.5, r: 0.24 },
    { x: 0.52, y: 0.44, r: 0.28 },
    { x: 0.72, y: 0.5, r: 0.22 },
    { x: 0.44, y: 0.66, r: 0.17 },
    { x: 0.64, y: 0.3, r: 0.13 },
    { x: 0.2, y: 0.4, r: 0.1 },
  ],
];

/** A small deterministic stream — mulberry32, the same generator `crossingOf` hashes with. */
function stream(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for a room's forest light from what identifies it — FNV-1a over the id, mixed with the numbers. */
export function forestLightSeed(roomId: string, ...mix: readonly number[]): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < roomId.length; i++) {
    hash = Math.imul(hash ^ roomId.charCodeAt(i), 0x01000193);
  }
  for (const value of mix) {
    hash = Math.imul(hash ^ (Math.round(value) | 0), 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Where a room's canopy opens. An ordinary single-cell room gets four or five
 * gaps that together light about `CANOPY_LIT_SHARE` of it, a bigger room
 * proportionally more; one room in `CANOPY_BAND_ODDS` trades a gap for a band.
 * The boss room gets one clearing in the middle, big enough to stage the
 * fight in. `closed` — a lantern room — gets nothing.
 */
export function canopyLayout(
  seed: number,
  frameWidth: number,
  frameHeight: number,
  kind: CanopyKind,
): CanopyLayout {
  if (kind === 'closed') {
    return { gaps: [], band: null };
  }
  if (kind === 'boss') {
    return {
      gaps: [
        {
          x: frameWidth / 2,
          z: frameHeight / 2,
          radiusX: frameWidth * BOSS_CLEARING,
          radiusZ: frameHeight * BOSS_CLEARING,
          rotation: 0,
          silhouette: 1,
        },
      ],
      band: null,
    };
  }
  const next = stream(seed);
  const area = frameWidth * frameHeight;
  const cells = Math.max(1, area / CELL_AREA);
  const count = Math.max(GAPS_PER_CELL, Math.round(cells * (GAPS_PER_CELL + next())));
  const hasBand = Math.floor(next() * CANOPY_BAND_ODDS) === 0;
  const gapCount = hasBand ? count - 1 : count;
  // Sized from the share, so a room with two gaps has bigger ones than a room with three.
  const radius = Math.sqrt((area * CANOPY_LIT_SHARE) / (count * Math.PI * SILHOUETTE_FILL));

  let band: CanopyBand | null = null;
  if (hasBand) {
    const slope = (0.35 + next() * 0.45) * (next() < 0.5 ? -1 : 1);
    band = {
      x: frameWidth * (0.3 + next() * 0.4),
      z: frameHeight * (0.35 + next() * 0.3),
      angle: slope,
      halfWidth: (BAND_TILES * ROOM_TILE_UNITS) / 2,
    };
  }

  const gaps: CanopyGap[] = [];
  const separation = radius * 2;
  for (let i = 0; i < gapCount; i++) {
    let x = 0;
    let z = 0;
    // A few tries to keep the gaps apart (and off the band); the last try stands whatever it is.
    for (let attempt = 0; attempt < 24; attempt++) {
      x = radius * 0.8 + next() * (frameWidth - radius * 1.6);
      z = radius * 0.8 + next() * (frameHeight - radius * 1.6);
      const clearOfGaps = gaps.every((other) => Math.hypot(other.x - x, other.z - z) >= separation);
      if (clearOfGaps && (band === null || distanceToBand(band, x, z) >= radius * 1.4)) {
        break;
      }
    }
    const stretch = 0.85 + next() * 0.3;
    gaps.push({
      x,
      z,
      radiusX: radius * stretch,
      radiusZ: radius / stretch,
      rotation: next() * Math.PI * 2,
      silhouette: Math.floor(next() * GAP_SILHOUETTES.length),
    });
  }
  return { gaps, band };
}

function distanceToBand(band: CanopyBand, x: number, z: number): number {
  return Math.abs((z - band.z) * Math.cos(band.angle) - (x - band.x) * Math.sin(band.angle));
}

// ------------------------------------------------------------------ drawing

/** The canopy texture's size. Fixed, and stretched over whatever the room is, so a room change repaints rather than reallocates. */
const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 256;
/** How far past the room the canopy reaches, as a fraction of its width/depth — the walls, and the room sliding out next door, are under the trees too. */
const OVERHANG_X = 1;
const OVERHANG_Z = 0.5;
/** How wide the ragged, dithered rim of a gap is, in room units. A band's is wider: a clearing's edge is fuzzier than a gap's. */
const GAP_FRINGE = 5;
const BAND_FRINGE = 11;

const SHAFT_COLOUR = 0xfff1c4;
const SHAFT_OPACITY = 0.16;
/** How tall a shaft stands, in room units, and how far its top leans east — toward where the sun is. */
const SHAFT_HEIGHT = 84;
const SHAFT_SLANT = 26;
/** A shaft is a little narrower than the gap it comes down through. */
const SHAFT_WIDTH = 1.5;
/** Shafts per band, spaced along it. */
const BAND_SHAFTS = 3;
/** The canopy plane's `name`, so the one other shadow-casting plane in the scene — a cloud — can be told from it. */
export const CANOPY_NAME = 'canopy';
/** The pool of shaft quads: a 2x2 room's worth of gaps plus a band's. */
export const MAX_SHAFTS = 24;

/** A 4x4 ordered-dither matrix, 0..15 — the rim of a gap breaks up into this rather than into a gradient. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * The canopy plane and the shafts under its gaps. One per `Lighting`; `apply`
 * repaints it for a room, `hide` puts it away on every other floor.
 */
export class Canopy {
  /** The shafts, on the actor layer — add to the scene once. */
  readonly shafts = new Group();
  /** The shadow-casting plane, or null with no DOM to paint its texture in (the headless bench). */
  readonly plane: Mesh | null;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly texture: CanvasTexture | null;
  private readonly shaftMeshes: Mesh[] = [];
  private readonly shaftMaterial: MeshBasicMaterial;

  constructor() {
    const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
    if (canvas !== null) {
      canvas.width = TEXTURE_WIDTH;
      canvas.height = TEXTURE_HEIGHT;
    }
    this.context = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;
    this.texture = canvas !== null && this.context !== null ? new CanvasTexture(canvas) : null;
    this.plane = this.texture === null ? null : buildPlane(this.texture);

    this.shaftMaterial = new MeshBasicMaterial({
      color: SHAFT_COLOUR,
      map: shaftTexture(),
      transparent: true,
      opacity: SHAFT_OPACITY,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
    const geometry = shaftGeometry();
    for (let i = 0; i < MAX_SHAFTS; i++) {
      const shaft = new Mesh(geometry, this.shaftMaterial);
      shaft.layers.set(ACTOR_LAYER);
      // First of the transparent things in the actor pass: over the bodies
      // standing in the light, under every telegraph, shot and particle.
      shaft.renderOrder = -10;
      shaft.visible = false;
      this.shaftMeshes.push(shaft);
      this.shafts.add(shaft);
    }
  }

  /** The shafts lean back to face the camera, the way a billboard does. */
  setLean(lean: number): void {
    for (const shaft of this.shaftMeshes) {
      shaft.rotation.x = lean;
    }
  }

  /**
   * Paints `layout` and hangs the plane `height` up over a `frameWidth` by
   * `frameHeight` room, displaced by `-shadowOffset` so that its *shadow* —
   * not the plane — lines up with the floor.
   */
  apply(
    layout: CanopyLayout,
    frameWidth: number,
    frameHeight: number,
    height: number,
    shadowOffsetX: number,
    shadowOffsetZ: number,
  ): void {
    const width = frameWidth * (1 + OVERHANG_X * 2);
    const depth = frameHeight * (1 + OVERHANG_Z * 2);
    if (this.plane !== null && this.context !== null && this.texture !== null) {
      paint(this.context, layout, {
        originX: -frameWidth * OVERHANG_X,
        originZ: -frameHeight * OVERHANG_Z,
        scaleX: TEXTURE_WIDTH / width,
        scaleZ: TEXTURE_HEIGHT / depth,
      });
      this.texture.needsUpdate = true;
      this.plane.scale.set(width, depth, 1);
      this.plane.position.set(
        frameWidth / 2 - shadowOffsetX,
        height,
        frameHeight / 2 - shadowOffsetZ,
      );
      this.plane.visible = true;
    }
    let used = 0;
    const place = (x: number, z: number, span: number): void => {
      const shaft = this.shaftMeshes[used];
      if (shaft === undefined) {
        return;
      }
      used += 1;
      shaft.position.set(x, 0.5, z);
      shaft.scale.set(span, SHAFT_HEIGHT, 1);
      shaft.visible = true;
    };
    for (const gap of layout.gaps) {
      place(gap.x, gap.z, Math.min(gap.radiusX, gap.radiusZ) * SHAFT_WIDTH);
    }
    const band = layout.band;
    if (band !== null) {
      for (let i = 0; i < BAND_SHAFTS; i++) {
        const x = (frameWidth * (i + 0.5)) / BAND_SHAFTS;
        const z = band.z + (x - band.x) * Math.tan(band.angle);
        if (z > 0 && z < frameHeight) {
          place(x, z, band.halfWidth * 2 * SHAFT_WIDTH);
        }
      }
    }
    for (let i = used; i < this.shaftMeshes.length; i++) {
      const shaft = this.shaftMeshes[i];
      if (shaft !== undefined) {
        shaft.visible = false;
      }
    }
  }

  hide(): void {
    if (this.plane !== null) {
      this.plane.visible = false;
    }
    for (const shaft of this.shaftMeshes) {
      shaft.visible = false;
    }
  }
}

/** Room units to canvas pixels. */
interface PaintFrame {
  readonly originX: number;
  readonly originZ: number;
  readonly scaleX: number;
  readonly scaleZ: number;
}

/**
 * Paints the canopy: opaque everywhere, with the gaps cut out. Each cut is
 * drawn soft and then thresholded against an ordered-dither matrix, so a
 * gap's rim breaks up into a ragged stipple the shadow map's own filtering
 * turns into a leafy penumbra — a clean alpha-tested curve would read as a
 * spotlight, and a gradient cannot survive `alphaTest` at all.
 */
function paint(context: CanvasRenderingContext2D, layout: CanopyLayout, frame: PaintFrame): void {
  const toX = (x: number): number => (x - frame.originX) * frame.scaleX;
  const toZ = (z: number): number => (z - frame.originZ) * frame.scaleZ;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = 'source-over';
  context.filter = 'none';
  context.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  context.fillStyle = 'rgba(0,0,0,1)';
  context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  context.globalCompositeOperation = 'destination-out';

  context.filter = `blur(${String(Math.max(1, Math.round(GAP_FRINGE * frame.scaleX)))}px)`;
  for (const gap of layout.gaps) {
    const silhouette = GAP_SILHOUETTES[gap.silhouette] ?? GAP_SILHOUETTES[0];
    if (silhouette === undefined) {
      continue;
    }
    context.setTransform(1, 0, 0, 1, toX(gap.x), toZ(gap.z));
    context.rotate(gap.rotation);
    context.scale(gap.radiusX * 2 * frame.scaleX, gap.radiusZ * 2 * frame.scaleZ);
    context.beginPath();
    for (const puff of silhouette) {
      context.moveTo(puff.x - 0.5 + puff.r, puff.y - 0.5);
      context.arc(puff.x - 0.5, puff.y - 0.5, puff.r, 0, Math.PI * 2);
    }
    context.fill();
  }

  const band = layout.band;
  if (band !== null) {
    context.filter = `blur(${String(Math.max(1, Math.round(BAND_FRINGE * frame.scaleX)))}px)`;
    // Drawn in canvas space with the room's own aspect folded into the
    // endpoints, long enough to leave the texture at both ends.
    const reach = 4000;
    const dx = Math.cos(band.angle) * reach;
    const dz = Math.sin(band.angle) * reach;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.lineWidth = band.halfWidth * 2 * Math.min(frame.scaleX, frame.scaleZ);
    context.lineCap = 'butt';
    context.beginPath();
    context.moveTo(toX(band.x - dx), toZ(band.z - dz));
    context.lineTo(toX(band.x + dx), toZ(band.z + dz));
    context.strokeStyle = 'rgba(0,0,0,1)';
    context.stroke();
  }
  context.filter = 'none';
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = 'source-over';

  const image = context.getImageData(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const data = image.data;
  for (let y = 0; y < TEXTURE_HEIGHT; y++) {
    for (let x = 0; x < TEXTURE_WIDTH; x++) {
      const at = (y * TEXTURE_WIDTH + x) * 4 + 3;
      const threshold = ((BAYER[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) * 16;
      data[at] = (data[at] ?? 0) > threshold ? 255 : 0;
    }
  }
  context.putImageData(image, 0, 0);
}

/** The unseen plane that casts the canopy's shadow — the same trick as `lighting.ts`'s cloud mesh, see its comment on `alphaTest`. */
function buildPlane(texture: CanvasTexture): Mesh {
  const material = new MeshBasicMaterial({
    map: texture,
    alphaTest: 0.5,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
  });
  const plane = new Mesh(new PlaneGeometry(1, 1), material);
  plane.customDepthMaterial = new MeshDepthMaterial({
    depthPacking: RGBADepthPacking,
    map: texture,
    alphaTest: 0.5,
  });
  plane.name = CANOPY_NAME;
  plane.castShadow = true;
  plane.rotation.x = -Math.PI / 2;
  plane.visible = false;
  return plane;
}

/** A unit quad standing on its bottom edge, its top pushed east by `SHAFT_SLANT / SHAFT_HEIGHT` of its height. */
function shaftGeometry(): BufferGeometry {
  const slant = SHAFT_SLANT / SHAFT_HEIGHT;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.5 + slant, 1, 0, 0.5 + slant, 1, 0]),
      3,
    ),
  );
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  return geometry;
}

/** The shaft's light: strongest a little above the floor and in the middle, gone at the sides, at the floor and before the top. Null with no DOM. */
function shaftTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    return null;
  }
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    // Row 0 is the top of the canvas and (flipped on upload) the top of the shaft.
    const up = 1 - y / (size - 1);
    // Fades in from the floor as well as out toward the top: a shaft that
    // starts at full strength draws its own bottom edge as a line across the
    // middle of the patch it stands in.
    const rise = Math.min(1, up / 0.3);
    const fall = (1 - up) ** 1.6 * rise * rise * (3 - 2 * rise);
    for (let x = 0; x < size; x++) {
      const across = Math.sin((x / (size - 1)) * Math.PI);
      // Two soft streaks, so it reads as light through leaves rather than as a pane.
      const streak = 0.75 + 0.25 * Math.sin((x / size) * Math.PI * 5);
      const at = (y * size + x) * 4;
      image.data[at] = 255;
      image.data[at + 1] = 255;
      image.data[at + 2] = 255;
      image.data[at + 3] = Math.round(255 * fall * across * across * streak);
    }
  }
  context.putImageData(image, 0, 0);
  return new CanvasTexture(canvas);
}
