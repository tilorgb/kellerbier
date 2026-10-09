import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  ClampToEdgeWrapping,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  type Texture as ThreeTexture,
} from 'three';
import { ROOM_TILE_UNITS } from '../../content/rooms/definition.js';
import { type Texture, textureFromPixels } from '../gfx/index.js';

/**
 * Things that lie on the floor: decals, telegraph shapes, plinths, the
 * Blutwurz grave. Flat quads in the floor plane at a hair above it, so they
 * neither fight the floor's depth nor float.
 */

/** Height above the floor plane flat things draw at, in room units. Stacked so overlaps order predictably. */
export const FLOOR_EPSILON = 0.12;
export const DECAL_HEIGHT = FLOOR_EPSILON;
export const PLINTH_HEIGHT = FLOOR_EPSILON * 2;
export const TELEGRAPH_HEIGHT = FLOOR_EPSILON * 3;

/** A textured quad lying flat, centred on its position, `size` room units across. */
export class FloorSprite {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private textureValue: Texture | null = null;

  constructor(lit = false) {
    const material = lit
      ? (new MeshStandardMaterial({
          transparent: true,
          alphaTest: 0.01,
          depthWrite: false,
          side: DoubleSide,
          roughness: 0.9,
        }) as unknown as MeshBasicMaterial)
      : new MeshBasicMaterial({
          transparent: true,
          alphaTest: 0.01,
          depthWrite: false,
          side: DoubleSide,
          toneMapped: false,
        });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.receiveShadow = lit;
  }

  setTexture(texture: Texture): void {
    if (texture === this.textureValue) {
      return;
    }
    this.textureValue = texture;
    const material = this.mesh.material;
    if (material.map !== texture.source.texture) {
      const hadMap = material.map !== null;
      material.map = texture.source.texture;
      if (!hadMap) {
        material.needsUpdate = true;
      }
    }
    const [u0, v0, u1, v1] = texture.uvs();
    const uv = this.mesh.geometry.getAttribute('uv') as BufferAttribute;
    uv.setXY(0, u0, v0);
    uv.setXY(1, u1, v0);
    uv.setXY(2, u0, v1);
    uv.setXY(3, u1, v1);
    uv.needsUpdate = true;
  }

  /** Centre at `(x, z)`, `width × depth` room units, turned by `rotation` radians about the vertical. */
  place(
    x: number,
    z: number,
    width: number,
    depth: number,
    rotation = 0,
    height = DECAL_HEIGHT,
  ): void {
    this.mesh.position.set(x, height, z);
    this.mesh.scale.set(width, depth, 1);
    this.mesh.rotation.set(-Math.PI / 2, 0, -rotation);
  }

  set tint(colour: number) {
    this.mesh.material.color.setHex(colour);
  }

  set alpha(value: number) {
    this.mesh.material.opacity = value;
  }

  set visible(value: boolean) {
    this.mesh.visible = value;
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}

function flatColourMaterial(colour: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: colour,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
}

/** A flat ring on the floor — the radial telegraph. Unit outer radius; scale to size. */
export class FloorRing {
  readonly mesh: Mesh<RingGeometry, MeshBasicMaterial>;

  constructor(colour: number, thickness = 0.14) {
    this.mesh = new Mesh(new RingGeometry(1 - thickness, 1, 40), flatColourMaterial(colour));
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  place(x: number, z: number, radius: number, alpha: number): void {
    this.mesh.position.set(x, TELEGRAPH_HEIGHT, z);
    this.mesh.scale.set(radius, radius, 1);
    this.mesh.material.opacity = alpha;
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}

/**
 * A flat square on the floor in one colour — the plank a Borkenkäfer is
 * eating through (#410), darkening as it goes. Unit size; scale to the tile.
 */
export class FloorShade {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;

  constructor(colour: number) {
    this.mesh = new Mesh(new PlaneGeometry(1, 1), flatColourMaterial(colour));
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  place(x: number, z: number, size: number, alpha: number): void {
    this.mesh.position.set(x, TELEGRAPH_HEIGHT, z);
    this.mesh.scale.set(size, size, 1);
    this.mesh.material.opacity = alpha;
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}

/**
 * A flat sector on the floor — the line and arc telegraphs. Built as a fan
 * from the apex along +x, `reach` long and `halfAngle` wide each side, and
 * turned about the vertical to face the attack.
 */
export class FloorWedge {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly positions = new Float32Array((WEDGE_STEPS + 2) * 3);

  constructor(colour: number) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    const index: number[] = [];
    for (let i = 0; i < WEDGE_STEPS; i++) {
      index.push(0, i + 1, i + 2);
    }
    geometry.setIndex(index);
    this.mesh = new Mesh(geometry, flatColourMaterial(colour));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  place(
    x: number,
    z: number,
    angle: number,
    reach: number,
    halfAngle: number,
    alpha: number,
  ): void {
    const p = this.positions;
    p[0] = 0;
    p[1] = 0;
    p[2] = 0;
    for (let i = 0; i <= WEDGE_STEPS; i++) {
      const a = -halfAngle + (i / WEDGE_STEPS) * halfAngle * 2;
      p[(i + 1) * 3] = Math.cos(a) * reach;
      p[(i + 1) * 3 + 1] = 0;
      p[(i + 1) * 3 + 2] = Math.sin(a) * reach;
    }
    this.mesh.geometry.getAttribute('position').needsUpdate = true;
    this.mesh.position.set(x, TELEGRAPH_HEIGHT, z);
    // A sim angle is measured in the floor plane with +y south; about the
    // vertical axis that is a negative rotation.
    this.mesh.rotation.set(0, -angle, 0);
    this.mesh.material.opacity = alpha;
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}

const WEDGE_STEPS = 12;

/** What a beam layer is drawn as: the dithered glow, the broken white-hot core, or the wind-up's dashed line. */
export type BeamPattern = 'glow' | 'core' | 'warn';

/** Pixels along one repeat of a beam pattern, and room units that repeat covers — one authored pixel is one room unit. */
const BEAM_PATTERN_WIDTH = 32;
const BEAM_PATTERN_HEIGHT = 8;

/** A deterministic 0-1 hash of two integers — a rebuild is the same beam, and nothing here touches Math.random. */
function beamHash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const beamTextures = new Map<BeamPattern, ThreeTexture>();

/**
 * One repeat of a beam pattern, white so the material's colour tints it. Corroded
 * on purpose (#40): the glow is a dither that thins to nothing at its edges and
 * is eaten away along its length, the core is broken into runs with burnt-out
 * gaps, and a few dark specks pit the glow — a beam that looks like it is
 * burning through something, not a clean neon tube.
 */
function beamTexture(pattern: BeamPattern): ThreeTexture {
  const cached = beamTextures.get(pattern);
  if (cached !== undefined) {
    return cached;
  }
  const w = BEAM_PATTERN_WIDTH;
  const h = pattern === 'warn' ? 2 : BEAM_PATTERN_HEIGHT;
  const pixels = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let keep = false;
      let colour = 0xffffff;
      if (pattern === 'warn') {
        // Dashes with a few missing, like a line scratched into the snow.
        keep = x % 8 < 5 && beamHash(x, y, 7) > 0.18;
      } else {
        const d = Math.abs(y - (h - 1) / 2);
        if (pattern === 'core') {
          // Two hot rows, a ragged skin either side, a run of the core burnt out now and then.
          const burnt = beamHash(Math.floor(x / 3), 0, 11) < 0.22;
          const p = d < 1 ? 0.9 : d < 2 ? 0.4 : 0;
          keep = !burnt && beamHash(x, y, 3) < p;
        } else {
          const edge = d / ((h - 1) / 2);
          const eaten = beamHash(Math.floor(x / 2), 0, 5) * 0.5 * edge;
          keep = beamHash(x, y, 1) < 1 - edge * 0.85 - eaten;
          if (keep && beamHash(x, y, 9) < 0.07) {
            // A pit: a speck of dark where the glow has burnt through.
            colour = 0x2e2e2e;
          }
        }
      }
      if (keep) {
        pixels[y * w + x] = colour;
      }
    }
  }
  const texture = textureFromPixels(w, h, pixels).source.texture.clone();
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  beamTextures.set(pattern, texture);
  return texture;
}

/**
 * A laser lying along the floor (#40): a flat quad from one point to another,
 * `height` room units above the floor plane so a lit beam reads as hovering at
 * hip height and the wind-up's warning line as lying on the snow. Drawn with a
 * pixel pattern (`BeamPattern`) that crawls along its length with `scroll`, so it
 * flickers rather than glows. Unlit and untoned so the colour is the colour
 * whatever the room's light.
 */
export class FloorBeam {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private pattern: BeamPattern | null = null;

  constructor(colour: number) {
    const material = flatColourMaterial(colour);
    material.alphaTest = 0.05;
    this.mesh = new Mesh(new PlaneGeometry(1, 1), material);
    this.mesh.rotation.order = 'XYZ';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** The beam from `(ax, az)` to `(bx, bz)`, `thickness` across, drawn at `alpha` in `colour` with `pattern`, crawled `scroll` repeats. */
  place(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    thickness: number,
    height: number,
    alpha: number,
    colour: number,
    pattern: BeamPattern = 'glow',
    scroll = 0,
  ): void {
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (this.pattern !== pattern) {
      this.pattern = pattern;
      this.mesh.material.map = beamTexture(pattern);
      this.mesh.material.needsUpdate = true;
    }
    const map = this.mesh.material.map;
    if (map !== null) {
      map.repeat.set(Math.max(0.01, length / BEAM_PATTERN_WIDTH), 1);
      map.offset.set(scroll, 0);
    }
    this.mesh.position.set((ax + bx) / 2, height, (az + bz) / 2);
    // A sim bearing runs in the floor plane with +y south; about the plane's
    // own normal that is a negative turn, then the plane lies down.
    this.mesh.rotation.set(-Math.PI / 2, 0, -Math.atan2(dz, dx));
    this.mesh.scale.set(Math.max(0.001, length), thickness, 1);
    this.mesh.material.opacity = alpha;
    this.mesh.material.color.setHex(colour);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}

/** Room-unit pixels one repeat of the hazard stripe covers on the floor. */
const HAZARD_STRIPE_UNITS = 4;

let hazardStripeSource: Texture | null = null;

/**
 * One repeat of the diagonal hazard hatch — a chunky pixel band, white so a
 * material's `color` tints it. Half on, half off, so the floor shows between
 * the stripes, and seamless when tiled in either direction.
 */
function hazardStripeTexture(): Texture {
  if (hazardStripeSource !== null) {
    return hazardStripeSource;
  }
  const size = 8;
  const pixels = new Int32Array(size * size).fill(-1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x + y) % size < size / 2) {
        pixels[y * size + x] = 0xffffff;
      }
    }
  }
  hazardStripeSource = textureFromPixels(size, size, pixels);
  return hazardStripeSource;
}

/** One diagonal-hatch texture + material, tinted `tint` — shared shape for every explosion telegraph. */
function hazardHatch(tint: number): { stripe: ThreeTexture; material: MeshBasicMaterial } {
  const stripe = hazardStripeTexture().source.texture.clone();
  stripe.wrapS = RepeatWrapping;
  stripe.wrapT = RepeatWrapping;
  stripe.magFilter = NearestFilter;
  stripe.minFilter = NearestFilter;
  stripe.generateMipmaps = false;
  stripe.needsUpdate = true;
  const material = new MeshBasicMaterial({
    map: stripe,
    color: tint,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    alphaTest: 0.05,
  });
  return { stripe, material };
}

/**
 * A flat rectangle of the diagonal hazard hatch on the floor. Unlike
 * `FloorBar` it is textured: chunky pixel stripes that stay a constant size
 * on the floor however large the rectangle is (the repeat is set from the
 * world size in `place`), tinted and blinked by the caller. Two of these
 * crossed are the Bierfassl blast telegraph (#3) — shown full size from the
 * moment the bomb is set down, never growing. Every explosive uses this
 * hatch (#12): a Bierfassl the crossed bars, a splash the disc below.
 */
export class FloorHazardBar {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly stripe: ThreeTexture;

  constructor(tint: number) {
    const { stripe, material } = hazardHatch(tint);
    this.stripe = stripe;
    this.mesh = new Mesh(new PlaneGeometry(1, 1), material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  place(x: number, z: number, width: number, depth: number, alpha: number): void {
    this.mesh.position.set(x, TELEGRAPH_HEIGHT, z);
    this.mesh.scale.set(width, depth, 1);
    this.stripe.repeat.set(width / HAZARD_STRIPE_UNITS, depth / HAZARD_STRIPE_UNITS);
    this.mesh.material.opacity = alpha;
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.stripe.dispose();
    this.mesh.removeFromParent();
  }
}

/**
 * The disc counterpart of `FloorHazardBar` — the same hatch, filling a
 * circle, for a radial blast (the Böllerschmeißer's lobbed Böller and the
 * player's own item, #12). `place` takes the blast radius; the stripes stay
 * the same size on the floor whatever the radius.
 */
export class FloorHazardDisc {
  readonly mesh: Mesh<CircleGeometry, MeshBasicMaterial>;
  private readonly stripe: ThreeTexture;

  constructor(tint: number) {
    const { stripe, material } = hazardHatch(tint);
    this.stripe = stripe;
    this.mesh = new Mesh(new CircleGeometry(1, 40), material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  place(x: number, z: number, radius: number, alpha: number): void {
    this.mesh.position.set(x, TELEGRAPH_HEIGHT, z);
    this.mesh.scale.set(radius, radius, 1);
    // `CircleGeometry`'s UVs run 0..1 across the diameter, so match the bar's
    // repeat maths on the full width.
    this.stripe.repeat.set((radius * 2) / HAZARD_STRIPE_UNITS, (radius * 2) / HAZARD_STRIPE_UNITS);
    this.mesh.material.opacity = alpha;
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.stripe.dispose();
    this.mesh.removeFromParent();
  }
}

/** A three.js texture that tiles: one authored tile per `ROOM_TILE_UNITS` over `width × height` room units. */
export function tilingTexture(texture: Texture, width: number, height: number): ThreeTexture {
  const tiled = texture.source.texture.clone();
  tiled.wrapS = RepeatWrapping;
  tiled.wrapT = RepeatWrapping;
  tiled.repeat.set(width / ROOM_TILE_UNITS, height / ROOM_TILE_UNITS);
  tiled.needsUpdate = true;
  return tiled;
}
