import { Group, Matrix4, type Object3D, Vector3 } from 'three';
import { Rectangle } from './texture.js';

/**
 * A 2D scene-graph node — the `Container` the HUD, menus and screens are
 * composed from.
 *
 * Thin by design: position, scale, rotation, pivot, alpha and visibility, a
 * child list, bounds, and coordinate conversion. Under it sits a three.js
 * `Group`, and the leaf classes (`Sprite`, `NineSliceSprite`, `BitmapText`,
 * `Graphics`) hang a `Mesh` off theirs; `UiLayer` renders the whole tree in
 * one orthographic pass, in child order, with depth testing off — a painter's
 * algorithm, which is the only ordering rule 2D UI code has ever needed.
 *
 * `alpha` multiplies down the tree the way it does in every 2D scene graph;
 * `UiLayer.prepare()` resolves it to each leaf's material opacity once per
 * frame rather than on every write.
 */
export class ObservablePoint {
  constructor(
    private readonly onChange: (x: number, y: number) => void,
    private xValue = 0,
    private yValue = 0,
  ) {}

  get x(): number {
    return this.xValue;
  }

  set x(value: number) {
    this.xValue = value;
    this.onChange(this.xValue, this.yValue);
  }

  get y(): number {
    return this.yValue;
  }

  set y(value: number) {
    this.yValue = value;
    this.onChange(this.xValue, this.yValue);
  }

  set(x: number, y: number = x): void {
    this.xValue = x;
    this.yValue = y;
    this.onChange(x, y);
  }

  copyFrom(point: { readonly x: number; readonly y: number }): void {
    this.set(point.x, point.y);
  }
}

export interface PointLike {
  x: number;
  y: number;
}

export type PointerEventName = 'pointerover' | 'pointerout' | 'pointertap' | 'pointerdown';

const SCRATCH_VECTOR = new Vector3();
const SCRATCH_MATRIX = new Matrix4();

export class Container {
  /** The three.js node this container is: carries position, scale and rotation. */
  readonly object: Object3D = new Group();
  /** Under `object`, offset by the pivot; own meshes and children live here. */
  readonly content: Object3D = new Group();

  readonly position: ObservablePoint;
  readonly scale: ObservablePoint;
  readonly pivot: ObservablePoint;
  readonly children: Container[] = [];
  parent: Container | null = null;

  /** A debugging name, mirrored onto the three.js object. */
  label = '';

  /** 'static' receives pointer events from `UiLayer`; 'none' (default) is invisible to them. */
  eventMode: 'none' | 'static' = 'none';
  cursor = 'default';

  private alphaValue = 1;
  private rotationValue = 0;
  private handlers: Map<PointerEventName, ((event: PointLike) => void)[]> | null = null;

  constructor() {
    this.position = new ObservablePoint((x, y) => {
      this.object.position.set(x, y, 0);
    });
    this.scale = new ObservablePoint(
      (x, y) => {
        this.object.scale.set(x, y, 1);
      },
      1,
      1,
    );
    this.pivot = new ObservablePoint((x, y) => {
      this.content.position.set(-x, -y, 0);
    });
    this.object.add(this.content);
  }

  get x(): number {
    return this.position.x;
  }

  set x(value: number) {
    this.position.x = value;
  }

  get y(): number {
    return this.position.y;
  }

  set y(value: number) {
    this.position.y = value;
  }

  get visible(): boolean {
    return this.object.visible;
  }

  set visible(value: boolean) {
    this.object.visible = value;
  }

  get alpha(): number {
    return this.alphaValue;
  }

  set alpha(value: number) {
    this.alphaValue = value;
  }

  /** Radians, clockwise on screen. */
  get rotation(): number {
    return this.rotationValue;
  }

  set rotation(value: number) {
    this.rotationValue = value;
    this.object.rotation.z = value;
  }

  // ---------------------------------------------------------------- tree

  addChild<T extends Container>(child: T): T {
    return this.addChildAt(child, this.children.length);
  }

  addChildAt<T extends Container>(child: T, index: number): T {
    child.parent?.removeChild(child);
    const at = Math.max(0, Math.min(index, this.children.length));
    this.children.splice(at, 0, child);
    child.parent = this;
    this.syncObjectChildren();
    return child;
  }

  removeChild(child: Container): void {
    const index = this.children.indexOf(child);
    if (index === -1) {
      return;
    }
    this.children.splice(index, 1);
    child.parent = null;
    this.content.remove(child.object);
  }

  removeChildren(): Container[] {
    const removed = this.children.splice(0, this.children.length);
    for (const child of removed) {
      child.parent = null;
      this.content.remove(child.object);
    }
    return removed;
  }

  removeFromParent(): void {
    this.parent?.removeChild(this);
  }

  setChildIndex(child: Container, index: number): void {
    const from = this.children.indexOf(child);
    if (from === -1) {
      throw new Error('setChildIndex: not a child of this container');
    }
    this.children.splice(from, 1);
    this.children.splice(Math.max(0, Math.min(index, this.children.length)), 0, child);
    this.syncObjectChildren();
  }

  getChildIndex(child: Container): number {
    return this.children.indexOf(child);
  }

  /**
   * Draw order is child order: the three.js child list is kept in exactly
   * this container's order, and `UiLayer` renders without sorting.
   */
  private syncObjectChildren(): void {
    this.content.clear();
    for (const mesh of this.ownObjects()) {
      this.content.add(mesh);
    }
    for (const child of this.children) {
      this.content.add(child.object);
    }
  }

  /** A leaf's own drawables — drawn before its children, like a 2D leaf's content. */
  protected ownObjects(): Object3D[] {
    return [];
  }

  /** Called by a leaf after creating its mesh so it sits first under `content`. */
  protected attachOwnObject(): void {
    this.syncObjectChildren();
  }

  destroy(options?: boolean | { children?: boolean; texture?: boolean }): void {
    const children = typeof options === 'boolean' ? options : options?.children === true;
    if (children) {
      for (const child of [...this.children]) {
        child.destroy(options);
      }
    }
    this.removeChildren();
    this.removeFromParent();
    this.disposeOwn(typeof options === 'object' && options.texture === true);
  }

  /** Leaves release their GPU resources here. */
  protected disposeOwn(_destroyTextures: boolean): void {
    // A plain container owns no GPU resources.
  }

  // ------------------------------------------------------------- bounds

  /**
   * The bounds of this node's own content, in its own coordinate space, before
   * its transform. Leaves override; a plain container has none.
   */
  protected ownBounds(): Rectangle | null {
    return null;
  }

  /**
   * Bounds of content and children in this node's local space — what Pixi
   * calls `getLocalBounds()`. Children's positions and scales are applied;
   * their rotation is not (nothing in the UI rotates a container it measures).
   */
  getLocalBounds(): Rectangle {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const own = this.ownBounds();
    if (own !== null) {
      minX = own.x;
      minY = own.y;
      maxX = own.x + own.width;
      maxY = own.y + own.height;
    }
    for (const child of this.children) {
      if (!child.visible) {
        continue;
      }
      const bounds = child.getLocalBounds();
      if (bounds.width === 0 && bounds.height === 0 && !Number.isFinite(minX)) {
        continue;
      }
      const sx = child.scale.x;
      const sy = child.scale.y;
      const x0 = child.position.x + (bounds.x - child.pivot.x) * sx;
      const x1 = child.position.x + (bounds.x + bounds.width - child.pivot.x) * sx;
      const y0 = child.position.y + (bounds.y - child.pivot.y) * sy;
      const y1 = child.position.y + (bounds.y + bounds.height - child.pivot.y) * sy;
      minX = Math.min(minX, x0, x1);
      maxX = Math.max(maxX, x0, x1);
      minY = Math.min(minY, y0, y1);
      maxY = Math.max(maxY, y0, y1);
    }
    if (!Number.isFinite(minX)) {
      return new Rectangle(0, 0, 0, 0);
    }
    return new Rectangle(minX, minY, maxX - minX, maxY - minY);
  }

  /** Width of the local bounds, scaled — what layout code reads to stack things. */
  get width(): number {
    return this.getLocalBounds().width * Math.abs(this.scale.x);
  }

  get height(): number {
    return this.getLocalBounds().height * Math.abs(this.scale.y);
  }

  // ------------------------------------------------------- coordinates

  /** This node's origin in the layer's root coordinates. */
  getGlobalPosition(out: PointLike = { x: 0, y: 0 }): PointLike {
    this.object.updateWorldMatrix(true, false);
    SCRATCH_VECTOR.set(0, 0, 0).applyMatrix4(this.object.matrixWorld);
    out.x = SCRATCH_VECTOR.x;
    out.y = SCRATCH_VECTOR.y;
    return out;
  }

  /** A root-space point expressed in this node's local space. */
  toLocal(point: PointLike, out: PointLike = { x: 0, y: 0 }): PointLike {
    this.object.updateWorldMatrix(true, false);
    SCRATCH_MATRIX.copy(this.object.matrixWorld).invert();
    SCRATCH_VECTOR.set(point.x, point.y, 0).applyMatrix4(SCRATCH_MATRIX);
    out.x = SCRATCH_VECTOR.x;
    out.y = SCRATCH_VECTOR.y;
    return out;
  }

  /** A local point expressed in the layer's root coordinates. */
  toGlobal(point: PointLike, out: PointLike = { x: 0, y: 0 }): PointLike {
    this.object.updateWorldMatrix(true, false);
    SCRATCH_VECTOR.set(point.x, point.y, 0).applyMatrix4(this.object.matrixWorld);
    out.x = SCRATCH_VECTOR.x;
    out.y = SCRATCH_VECTOR.y;
    return out;
  }

  // ------------------------------------------------------------ events

  on(event: PointerEventName, handler: (event: PointLike) => void): this {
    this.handlers ??= new Map();
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  off(event: PointerEventName, handler: (event: PointLike) => void): this {
    const list = this.handlers?.get(event);
    if (list !== undefined) {
      const at = list.indexOf(handler);
      if (at !== -1) {
        list.splice(at, 1);
      }
    }
    return this;
  }

  /** @internal `UiLayer` dispatches through this. */
  emit(event: PointerEventName, point: PointLike): void {
    const list = this.handlers?.get(event);
    if (list === undefined) {
      return;
    }
    for (const handler of [...list]) {
      handler(point);
    }
  }

  /** @internal Resolve `alpha` down the tree; leaves apply it to their material. */
  prepare(parentAlpha: number): void {
    if (!this.visible) {
      return;
    }
    const effective = parentAlpha * this.alphaValue;
    this.applyAlpha(effective);
    for (const child of this.children) {
      child.prepare(effective);
    }
  }

  /** Leaves write the resolved alpha into their material here. */
  protected applyAlpha(_effective: number): void {
    // A plain container draws nothing; its alpha only flows to its children.
  }
}
