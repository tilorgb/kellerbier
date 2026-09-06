import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three';
import { Container } from './container.js';
import { Rectangle } from './texture.js';

/**
 * Flat vector shapes for the UI: rectangles, circles, ellipses and polylines,
 * filled or stroked, in the chained style the HUD code already writes —
 * `graphics.rect(x, y, w, h).fill({ color, alpha })`.
 *
 * Everything becomes triangles with per-vertex colour and alpha in one
 * geometry, rebuilt lazily before the next draw. Fills are fan-triangulated,
 * which is exact for every shape here (all convex); strokes are one quad per
 * segment. A minimap or a title card is a few dozen shapes, so nothing is
 * cached — `clear()` and redraw is the whole protocol.
 */
export interface FillStyle {
  readonly color?: number;
  readonly alpha?: number;
}

export interface StrokeStyle extends FillStyle {
  readonly width?: number;
  /** 0.5 centres the stroke on the edge (default), 0 keeps it inside, 1 outside. */
  readonly alignment?: number;
}

interface Path {
  readonly kind: 'poly';
  readonly points: number[];
  readonly closed: boolean;
}

const CIRCLE_SEGMENTS = 24;

export class Graphics extends Container {
  private readonly geometry = new BufferGeometry();
  private readonly material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
  private readonly mesh: Mesh;

  /** Shapes drawn since the last `fill`/`stroke`, waiting for one. */
  private pending: Path[] = [];
  /** The open polyline `moveTo`/`lineTo` are building. */
  private current: number[] | null = null;
  private vertices: number[] = [];
  private colours: number[] = [];
  private indices: number[] = [];
  private bounds = new Rectangle();
  private hasBounds = false;
  private dirty = false;

  constructor() {
    super();
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.attachOwnObject();
  }

  protected override ownObjects(): Object3D[] {
    return [this.mesh];
  }

  clear(): this {
    this.pending = [];
    this.current = null;
    this.vertices = [];
    this.colours = [];
    this.indices = [];
    this.hasBounds = false;
    this.bounds = new Rectangle();
    this.dirty = true;
    return this;
  }

  // -------------------------------------------------------------- shapes

  rect(x: number, y: number, width: number, height: number): this {
    this.flushCurrent();
    this.pending.push({
      kind: 'poly',
      points: [x, y, x + width, y, x + width, y + height, x, y + height],
      closed: true,
    });
    return this;
  }

  roundRect(x: number, y: number, width: number, height: number, radius: number): this {
    this.flushCurrent();
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    const points: number[] = [];
    const corner = (cx: number, cy: number, from: number): void => {
      for (let i = 0; i <= 6; i++) {
        const a = from + (i / 6) * (Math.PI / 2);
        points.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
    };
    corner(x + width - r, y + r, -Math.PI / 2);
    corner(x + width - r, y + height - r, 0);
    corner(x + r, y + height - r, Math.PI / 2);
    corner(x + r, y + r, Math.PI);
    this.pending.push({ kind: 'poly', points, closed: true });
    return this;
  }

  circle(x: number, y: number, radius: number): this {
    return this.ellipse(x, y, radius, radius);
  }

  ellipse(x: number, y: number, radiusX: number, radiusY: number): this {
    this.flushCurrent();
    const points: number[] = [];
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      points.push(x + Math.cos(a) * radiusX, y + Math.sin(a) * radiusY);
    }
    this.pending.push({ kind: 'poly', points, closed: true });
    return this;
  }

  poly(points: readonly number[], close = true): this {
    this.flushCurrent();
    this.pending.push({ kind: 'poly', points: [...points], closed: close });
    return this;
  }

  moveTo(x: number, y: number): this {
    this.flushCurrent();
    this.current = [x, y];
    return this;
  }

  lineTo(x: number, y: number): this {
    if (this.current === null) {
      this.current = [x, y];
    } else {
      this.current.push(x, y);
    }
    return this;
  }

  closePath(): this {
    if (this.current !== null && this.current.length >= 6) {
      this.pending.push({ kind: 'poly', points: this.current, closed: true });
      this.current = null;
    }
    return this;
  }

  private flushCurrent(): void {
    if (this.current !== null && this.current.length >= 4) {
      this.pending.push({ kind: 'poly', points: this.current, closed: false });
    }
    this.current = null;
  }

  // ------------------------------------------------------- fill / stroke

  fill(style: FillStyle | number = {}): this {
    this.flushCurrent();
    const resolved = typeof style === 'number' ? { color: style } : style;
    const colour = resolved.color ?? 0xffffff;
    const alpha = resolved.alpha ?? 1;
    for (const path of this.pending) {
      this.fanFill(path.points, colour, alpha);
    }
    this.pending = [];
    this.dirty = true;
    return this;
  }

  stroke(style: StrokeStyle | number = {}): this {
    this.flushCurrent();
    const resolved = typeof style === 'number' ? { color: style } : style;
    const colour = resolved.color ?? 0xffffff;
    const alpha = resolved.alpha ?? 1;
    const width = resolved.width ?? 1;
    const alignment = resolved.alignment ?? 0.5;
    for (const path of this.pending) {
      this.strokePath(path.points, path.closed, width, alignment, colour, alpha);
    }
    this.pending = [];
    this.dirty = true;
    return this;
  }

  private pushVertex(x: number, y: number, colour: number, alpha: number): number {
    const index = this.vertices.length / 3;
    this.vertices.push(x, y, 0);
    this.colours.push(
      ((colour >> 16) & 0xff) / 255,
      ((colour >> 8) & 0xff) / 255,
      (colour & 0xff) / 255,
      alpha,
    );
    this.extend(x, y);
    return index;
  }

  private extend(x: number, y: number): void {
    if (!this.hasBounds) {
      this.bounds = new Rectangle(x, y, 0, 0);
      this.hasBounds = true;
      return;
    }
    const b = this.bounds;
    const minX = Math.min(b.x, x);
    const minY = Math.min(b.y, y);
    const maxX = Math.max(b.x + b.width, x);
    const maxY = Math.max(b.y + b.height, y);
    b.x = minX;
    b.y = minY;
    b.width = maxX - minX;
    b.height = maxY - minY;
  }

  private fanFill(points: readonly number[], colour: number, alpha: number): void {
    const count = points.length / 2;
    if (count < 3) {
      return;
    }
    const first = this.pushVertex(points[0] ?? 0, points[1] ?? 0, colour, alpha);
    let previous = this.pushVertex(points[2] ?? 0, points[3] ?? 0, colour, alpha);
    for (let i = 2; i < count; i++) {
      const next = this.pushVertex(points[i * 2] ?? 0, points[i * 2 + 1] ?? 0, colour, alpha);
      this.indices.push(first, previous, next);
      previous = next;
    }
  }

  private strokePath(
    points: readonly number[],
    closed: boolean,
    width: number,
    alignment: number,
    colour: number,
    alpha: number,
  ): void {
    const count = points.length / 2;
    if (count < 2) {
      return;
    }
    // Which side of the edge the stroke sits on: alignment 0.5 straddles it.
    // For a closed shape wound clockwise in y-down space the interior is to
    // the right of each edge, so "inside" is the +normal side computed below.
    const inner = width * (1 - alignment);
    const outer = width * alignment;
    const segments = closed ? count : count - 1;
    for (let i = 0; i < segments; i++) {
      const ax = points[i * 2] ?? 0;
      const ay = points[i * 2 + 1] ?? 0;
      const j = (i + 1) % count;
      const bx = points[j * 2] ?? 0;
      const by = points[j * 2 + 1] ?? 0;
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);
      if (length === 0) {
        continue;
      }
      // Right-hand normal (into a clockwise shape's interior).
      const nx = -dy / length;
      const ny = dx / length;
      // Extend the ends by half the width so corners of a rectangle close.
      const ex = closed ? (dx / length) * (width / 2) : 0;
      const ey = closed ? (dy / length) * (width / 2) : 0;
      const a0 = this.pushVertex(ax - ex + nx * inner, ay - ey + ny * inner, colour, alpha);
      const a1 = this.pushVertex(ax - ex - nx * outer, ay - ey - ny * outer, colour, alpha);
      const b0 = this.pushVertex(bx + ex + nx * inner, by + ey + ny * inner, colour, alpha);
      const b1 = this.pushVertex(bx + ex - nx * outer, by + ey - ny * outer, colour, alpha);
      this.indices.push(a0, b0, a1, a1, b0, b1);
    }
  }

  private upload(): void {
    this.dirty = false;
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.vertices), 3));
    this.geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colours), 4));
    this.geometry.setIndex(this.indices.length > 0 ? this.indices : []);
    this.mesh.visible = this.indices.length > 0;
  }

  override prepare(parentAlpha: number): void {
    if (this.dirty) {
      this.upload();
    }
    super.prepare(parentAlpha);
  }

  protected override ownBounds(): Rectangle | null {
    return this.hasBounds ? this.bounds.clone() : null;
  }

  protected override applyAlpha(effective: number): void {
    this.material.opacity = effective;
  }

  protected override disposeOwn(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
