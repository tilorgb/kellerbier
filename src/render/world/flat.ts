import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  type Texture as ThreeTexture,
} from 'three';
import { ROOM_TILE_UNITS } from '../../content/rooms/definition.js';
import type { Texture } from '../gfx/index.js';

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

/** A flat filled rectangle on the floor — the bomb cross's arms and the ground telegraph's marker. */
export class FloorBar {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;

  constructor(colour: number) {
    this.mesh = new Mesh(new PlaneGeometry(1, 1), flatColourMaterial(colour));
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  place(x: number, z: number, width: number, depth: number, alpha: number): void {
    this.mesh.position.set(x, TELEGRAPH_HEIGHT, z);
    this.mesh.scale.set(width, depth, 1);
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

/** A three.js texture that tiles: one authored tile per `ROOM_TILE_UNITS` over `width × height` room units. */
export function tilingTexture(texture: Texture, width: number, height: number): ThreeTexture {
  const tiled = texture.source.texture.clone();
  tiled.wrapS = RepeatWrapping;
  tiled.wrapT = RepeatWrapping;
  tiled.repeat.set(width / ROOM_TILE_UNITS, height / ROOM_TILE_UNITS);
  tiled.needsUpdate = true;
  return tiled;
}
