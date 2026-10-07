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
import { ACTOR_LAYER } from './layers.js';

/**
 * A 2D sprite standing in the 3D room.
 *
 * A unit quad anchored at its bottom-centre, scaled to the frame's authored
 * size in room units (`docs/DECISIONS.md` #45: a sprite's canvas is its size
 * on screen, and one room unit is `ACTOR_PIXELS_PER_UNIT` of those), leaning
 * back by the camera's elevation so it faces the camera square-on and its
 * height is not foreshortened against its width — the same read the 2D game
 * had, with real lighting falling on it. Under the perspective camera an
 * authored pixel projects to roughly 0.8 internal pixels at the back of a
 * room and 0.95 at the front, the same for every billboard at that depth.
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
  /** Whether `placeFlat` laid the quad down, so `place` knows to turn it back. */
  private flat = false;

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
    // A sprite is shaded by what it stands under (#424): under Floor 3's
    // canopy, a passing cloud, a block's shadow. It was lit the same wherever
    // it stood before, which made the room's light a floor texture rather
    // than the room's light. Sprites cast nothing onto each other or
    // themselves — the shadow map holds the room, not its actors.
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    // Turn about the vertical last, so `placeFlat` can lay the quad down and
    // then point it; with y and z at 0 this is the plain lean `place` sets.
    this.mesh.rotation.order = 'YXZ';
    // A billboard is always a standing sprite: drawn in GameView's second pass,
    // over the room, so a leaning sprite is not clipped by the wall behind it.
    this.mesh.layers.set(ACTOR_LAYER);
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
    // Indexed rather than destructured: destructuring goes through the
    // iterator protocol and can allocate, and this runs on every frame change.
    const uvs = texture.uvs();
    const v0 = uvs[1];
    const v1 = uvs[3];
    const u0 = mirror < 0 ? uvs[2] : uvs[0];
    const u1 = mirror < 0 ? uvs[0] : uvs[2];
    // PlaneGeometry's corners run top-left, top-right, bottom-left, bottom-right.
    this.uv.setXY(0, u0, v0);
    this.uv.setXY(1, u1, v0);
    this.uv.setXY(2, u0, v1);
    this.uv.setXY(3, u1, v1);
    this.uv.needsUpdate = true;
  }

  /**
   * Places the quad with its feet at `(x, y, z)`, leaning back by `lean`
   * radians, drawn at the frame's authored size times `scale` — and its
   * height times `scaleY` on top, for a squash that keeps the feet planted
   * (an enemy's wind-up crouch, #429).
   */
  place(x: number, y: number, z: number, lean: number, scale = 1, scaleY = 1): void {
    const texture = this.textureValue;
    // Display size, not texel count: a `@2x` frame stands exactly as big as
    // the 1x frame it replaces (`Texture.density`).
    const w = (texture?.displayWidth ?? 1) / ACTOR_PIXELS_PER_UNIT;
    const h = (texture?.displayHeight ?? 1) / ACTOR_PIXELS_PER_UNIT;
    this.mesh.scale.set(w * scale, h * scale * scaleY, 1);
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.x = lean;
  }

  /** Whether `placeFlat` laid the quad down — a pooled one must be stood back up (`standUp`) before `place` reuses it. */
  get isFlat(): boolean {
    return this.flat;
  }

  /**
   * Undoes `placeFlat`'s turn about the vertical, so `place`'s lean is the
   * whole rotation again. Kept out of `place` itself, which every standing
   * sprite calls every frame and which only a pooled body can ever need this.
   */
  standUp(): void {
    this.mesh.rotation.y = 0;
    this.flat = false;
  }

  /**
   * Lays the quad flat on the floor instead of standing it up — a crawling
   * body seen from above (the Zecke, `facing: 'crawl'`). The canvas's top
   * edge is its head, and points along `(headX, headZ)` in room axes (a unit
   * vector; `+z` is south, toward the camera). `anchor` is the fraction of
   * the canvas height, from its bottom edge, that sits at `(x, z)` — the
   * middle of the drawn body, which on a canvas with empty rows above it is
   * not the middle of the canvas. `y` lifts the whole quad (a hop's bob).
   */
  placeFlat(
    x: number,
    y: number,
    z: number,
    headX: number,
    headZ: number,
    anchor: number,
    scale = 1,
    scaleY = 1,
  ): void {
    const texture = this.textureValue;
    const w = (texture?.displayWidth ?? 1) / ACTOR_PIXELS_PER_UNIT;
    const h = (texture?.displayHeight ?? 1) / ACTOR_PIXELS_PER_UNIT;
    const length = h * scale * scaleY;
    this.mesh.scale.set(w * scale, length, 1);
    // The geometry is anchored at its bottom edge, so step back along the
    // head's direction to put the drawn body's middle on the point.
    this.mesh.position.set(x - headX * length * anchor, y, z - headZ * length * anchor);
    // Laid back a quarter turn (its top now points north, -z), then turned
    // about the vertical so its top points along the heading. `YXZ` applies
    // the lay-down before the turn.
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.rotation.y = Math.atan2(-headX, -headZ);
    this.flat = true;
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

  /**
   * A coloured glow at partial strength, on the same emissive channel `flash`
   * drives at full white — so set one or the other in a frame, not both.
   */
  setGlow(colour: number, strength: number): void {
    this.mesh.material.emissive.setHex(colour).multiplyScalar(strength);
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
