import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three';
import { Container, ObservablePoint } from './container.js';
import { Rectangle, Texture } from './texture.js';

/**
 * The one material every 2D leaf uses: unlit, alpha-blended, no depth — the
 * layer draws in child order and nothing else decides what is on top.
 */
export function flatMaterial(texture: Texture | null): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map: texture?.source.texture ?? null,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
}

/** A quad geometry whose corner positions and UVs are rewritten in place. */
export class QuadGeometry extends BufferGeometry {
  private readonly positions = new Float32Array(12);
  private readonly uvs = new Float32Array(8);

  constructor() {
    super();
    this.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.setAttribute('uv', new BufferAttribute(this.uvs, 2));
    this.setIndex([0, 2, 1, 1, 2, 3]);
  }

  /** Corners: top-left, top-right, bottom-left, bottom-right, in y-down space. */
  layout(x0: number, y0: number, x1: number, y1: number, texture: Texture): void {
    const p = this.positions;
    p[0] = x0;
    p[1] = y0;
    p[3] = x1;
    p[4] = y0;
    p[6] = x0;
    p[7] = y1;
    p[9] = x1;
    p[10] = y1;
    const [u0, v0, u1, v1] = texture.uvs();
    const t = this.uvs;
    t[0] = u0;
    t[1] = v0;
    t[2] = u1;
    t[3] = v0;
    t[4] = u0;
    t[5] = v1;
    t[6] = u1;
    t[7] = v1;
    this.getAttribute('position').needsUpdate = true;
    this.getAttribute('uv').needsUpdate = true;
  }
}

/**
 * One textured rectangle. `anchor` is the fraction of the frame that sits at
 * the node's origin; `width`/`height` set the scale so the frame draws at that
 * size, the way a 2D sprite's size setters always have.
 */
export class Sprite extends Container {
  readonly anchor: ObservablePoint;

  private textureValue: Texture;
  private readonly geometry = new QuadGeometry();
  private readonly material: MeshBasicMaterial;
  private readonly mesh: Mesh;
  private tintValue = 0xffffff;

  constructor(texture: Texture = Texture.EMPTY) {
    super();
    this.textureValue = texture;
    this.material = flatMaterial(texture);
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.anchor = new ObservablePoint(() => {
      this.relayout();
    });
    this.relayout();
    this.attachOwnObject();
  }

  protected override ownObjects(): Object3D[] {
    return [this.mesh];
  }

  get texture(): Texture {
    return this.textureValue;
  }

  set texture(value: Texture) {
    this.textureValue = value;
    if (this.material.map !== value.source.texture) {
      this.material.map = value.source.texture;
      this.material.needsUpdate = true;
    }
    this.relayout();
  }

  get tint(): number {
    return this.tintValue;
  }

  set tint(value: number) {
    this.tintValue = value;
    this.material.color.setHex(value);
  }

  /** Drawn width: the frame's width times `scale.x`. Setting it sets the scale. */
  override get width(): number {
    return this.textureValue.width * Math.abs(this.scale.x);
  }

  override set width(value: number) {
    this.scale.x = this.textureValue.width === 0 ? 1 : value / this.textureValue.width;
  }

  override get height(): number {
    return this.textureValue.height * Math.abs(this.scale.y);
  }

  override set height(value: number) {
    this.scale.y = this.textureValue.height === 0 ? 1 : value / this.textureValue.height;
  }

  private relayout(): void {
    const w = this.textureValue.width;
    const h = this.textureValue.height;
    const x0 = -this.anchor.x * w;
    const y0 = -this.anchor.y * h;
    this.geometry.layout(x0, y0, x0 + w, y0 + h, this.textureValue);
  }

  protected override ownBounds(): Rectangle {
    const w = this.textureValue.width;
    const h = this.textureValue.height;
    return new Rectangle(-this.anchor.x * w, -this.anchor.y * h, w, h);
  }

  protected override applyAlpha(effective: number): void {
    this.material.opacity = effective;
  }

  protected override disposeOwn(destroyTextures: boolean): void {
    this.geometry.dispose();
    this.material.dispose();
    if (destroyTextures) {
      this.textureValue.destroy(true);
    }
  }
}

/**
 * A frame texture stretched to any size with its corners kept crisp: the
 * corner cells draw 1:1, the edges stretch along one axis, the middle along
 * both. Nine quads in one geometry.
 */
export class NineSliceSprite extends Container {
  private textureValue: Texture;
  private readonly left: number;
  private readonly right: number;
  private readonly top: number;
  private readonly bottom: number;
  private widthValue: number;
  private heightValue: number;
  private readonly positions = new Float32Array(9 * 4 * 3);
  private readonly uvs = new Float32Array(9 * 4 * 2);
  private readonly geometry = new BufferGeometry();
  private readonly material: MeshBasicMaterial;
  private readonly mesh: Mesh;
  private tintValue = 0xffffff;

  constructor(options: {
    texture: Texture;
    leftWidth: number;
    rightWidth: number;
    topHeight: number;
    bottomHeight: number;
    width?: number;
    height?: number;
  }) {
    super();
    this.textureValue = options.texture;
    this.left = options.leftWidth;
    this.right = options.rightWidth;
    this.top = options.topHeight;
    this.bottom = options.bottomHeight;
    this.widthValue = options.width ?? options.texture.width;
    this.heightValue = options.height ?? options.texture.height;
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('uv', new BufferAttribute(this.uvs, 2));
    const index: number[] = [];
    for (let quad = 0; quad < 9; quad++) {
      const base = quad * 4;
      index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
    this.geometry.setIndex(index);
    this.material = flatMaterial(options.texture);
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.relayout();
    this.attachOwnObject();
  }

  protected override ownObjects(): Object3D[] {
    return [this.mesh];
  }

  get texture(): Texture {
    return this.textureValue;
  }

  set texture(value: Texture) {
    this.textureValue = value;
    if (this.material.map !== value.source.texture) {
      this.material.map = value.source.texture;
      this.material.needsUpdate = true;
    }
    this.relayout();
  }

  get tint(): number {
    return this.tintValue;
  }

  set tint(value: number) {
    this.tintValue = value;
    this.material.color.setHex(value);
  }

  override get width(): number {
    return this.widthValue;
  }

  override set width(value: number) {
    this.widthValue = value;
    this.relayout();
  }

  override get height(): number {
    return this.heightValue;
  }

  override set height(value: number) {
    this.heightValue = value;
    this.relayout();
  }

  private relayout(): void {
    const texture = this.textureValue;
    const [u0, v0, u1, v1] = texture.uvs();
    const srcW = texture.source.width;
    const srcH = texture.source.height;
    const xs = [0, this.left, this.widthValue - this.right, this.widthValue];
    const ys = [0, this.top, this.heightValue - this.bottom, this.heightValue];
    // UV columns/rows: the same three bands in texture space.
    const du = (u1 - u0) / texture.width;
    const dv = (v1 - v0) / texture.height;
    const us = [u0, u0 + this.left * du, u1 - this.right * du, u1];
    const vs = [v0, v0 + this.top * dv, v1 - this.bottom * dv, v1];
    void srcW;
    void srcH;
    let quad = 0;
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        const x0 = xs[column] ?? 0;
        const x1 = xs[column + 1] ?? 0;
        const y0 = ys[row] ?? 0;
        const y1 = ys[row + 1] ?? 0;
        const cu0 = us[column] ?? 0;
        const cu1 = us[column + 1] ?? 0;
        const cv0 = vs[row] ?? 0;
        const cv1 = vs[row + 1] ?? 0;
        const p = quad * 12;
        const t = quad * 8;
        this.positions.set([x0, y0, 0, x1, y0, 0, x0, y1, 0, x1, y1, 0], p);
        this.uvs.set([cu0, cv0, cu1, cv0, cu0, cv1, cu1, cv1], t);
        quad += 1;
      }
    }
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('uv').needsUpdate = true;
  }

  protected override ownBounds(): Rectangle {
    return new Rectangle(0, 0, this.widthValue, this.heightValue);
  }

  protected override applyAlpha(effective: number): void {
    this.material.opacity = effective;
  }

  protected override disposeOwn(destroyTextures: boolean): void {
    this.geometry.dispose();
    this.material.dispose();
    if (destroyTextures) {
      this.textureValue.destroy(true);
    }
  }
}
