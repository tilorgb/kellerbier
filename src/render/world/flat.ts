import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
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
