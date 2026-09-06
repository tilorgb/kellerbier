import {
  type BufferAttribute,
  DoubleSide,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RGBADepthPacking,
} from 'three';
import type { Texture } from '../gfx/index.js';
import { ACTOR_PIXELS_PER_UNIT } from '../resolution.js';

/**
 * A 2D sprite standing in the 3D room.
 *
 * A unit quad anchored at its bottom-centre, scaled to the frame's authored
 * size in room units (`docs/DECISIONS.md` #45: a sprite's canvas is its size
 * on screen, and one room unit is `ACTOR_PIXELS_PER_UNIT` of those), leaning
 * back by the camera's elevation so it faces the camera square-on and its
 * projected height is exactly its authored height — the same read the 2D
 * game had, with real lighting falling on it.
 *
 * The quad owns its UV attribute: showing another frame of a strip moves
 * the UVs to that frame's rectangle of the shared texture rather than
 * binding another texture, so a room of one creature is one texture however
 * many of it are animating. A negative `mirror` swaps the U edges, which is
 * how a left-authored strip walks right (`animation/state.ts`'s
 * `AUTHORED_FACING`).
 *
 * Lit by the scene's lights (a standard material), and the hit flash is the
 * emissive term at full white: the frame's own shape, blown out — what the
 * white silhouette swap used to do by hand. The shadow pass draws through
 * `depth`, alpha-tested like the body, so the shadow on the floor is the
 * sprite's silhouette and not its quad.
 */
export class Billboard {
  readonly mesh: Mesh<PlaneGeometry, MeshStandardMaterial>;
  private readonly depth: MeshDepthMaterial;
  private readonly uv: BufferAttribute;
  private textureValue: Texture | null = null;
  private mirrorValue = 1;

  constructor() {
    const geometry = new PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    const material = new MeshStandardMaterial({
      alphaTest: 0.5,
      side: DoubleSide,
      roughness: 0.9,
      metalness: 0,
      emissive: 0x000000,
      transparent: false,
    });
    this.depth = new MeshDepthMaterial({
      depthPacking: RGBADepthPacking,
      alphaTest: 0.5,
      side: DoubleSide,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.customDepthMaterial = this.depth;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.uv = geometry.getAttribute('uv') as BufferAttribute;
  }

  get texture(): Texture | null {
    return this.textureValue;
  }

  /** Shows `texture`'s frame, mirrored when `mirror` is negative. */
  setTexture(texture: Texture, mirror = 1): void {
    if (texture === this.textureValue && mirror === this.mirrorValue) {
      return;
    }
    const material = this.mesh.material;
    if (this.textureValue?.source !== texture.source) {
      const hadMap = material.map !== null;
      material.map = texture.source.texture;
      this.depth.map = texture.source.texture;
      if (!hadMap) {
        material.needsUpdate = true;
        this.depth.needsUpdate = true;
      }
    }
    this.textureValue = texture;
    this.mirrorValue = mirror;
    const [, v0, , v1] = texture.uvs();
    let [u0, , u1] = texture.uvs();
    if (mirror < 0) {
      const swap = u0;
      u0 = u1;
      u1 = swap;
    }
    // PlaneGeometry's corners run top-left, top-right, bottom-left, bottom-right.
    this.uv.setXY(0, u0, v0);
    this.uv.setXY(1, u1, v0);
    this.uv.setXY(2, u0, v1);
    this.uv.setXY(3, u1, v1);
    this.uv.needsUpdate = true;
  }

  /**
   * Places the quad with its feet at `(x, y, z)`, leaning back by `lean`
   * radians, drawn at the frame's authored size times `scale`.
   */
  place(x: number, y: number, z: number, lean: number, scale = 1): void {
    const texture = this.textureValue;
    const w = (texture?.width ?? 1) / ACTOR_PIXELS_PER_UNIT;
    const h = (texture?.height ?? 1) / ACTOR_PIXELS_PER_UNIT;
    this.mesh.scale.set(w * scale, h * scale, 1);
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.x = lean;
  }

  /** Frame size in room units after `place` — what a label above it needs. */
  get heightUnits(): number {
    return this.mesh.scale.y;
  }

  set tint(colour: number) {
    this.mesh.material.color.setHex(colour);
  }

  set flash(on: boolean) {
    this.mesh.material.emissive.setScalar(on ? 1 : 0);
  }

  /** Fades the body; anything under 1 turns alpha blending on for this mesh. */
  set alpha(value: number) {
    const material = this.mesh.material;
    const transparent = value < 1;
    if (material.transparent !== transparent) {
      material.transparent = transparent;
      material.needsUpdate = true;
    }
    material.opacity = value;
  }

  set visible(value: boolean) {
    this.mesh.visible = value;
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  set castShadow(value: boolean) {
    this.mesh.castShadow = value;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.depth.dispose();
    this.mesh.removeFromParent();
  }
}
