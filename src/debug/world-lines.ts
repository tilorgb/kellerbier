import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  type Scene,
} from 'three';

/**
 * Debug line work in the room: collider circles, room and block rectangles,
 * the broadphase grid.
 *
 * One `LineSegments` per display, rebuilt every visible frame from a pair of
 * growable typed arrays — `begin()`, any number of `circle`/`rect` calls,
 * `end()`. Per-vertex colour (with alpha) so one draw carries every layer's
 * colour at once; `depthTest` off and a high `renderOrder` so a footprint
 * circle reads over the floor it sits on rather than z-fighting with it.
 *
 * The lines lie in the floor plane, a hair above it: the simulation's `(x, y)`
 * is three.js `(x, LINE_HEIGHT, y)`, the same mapping every world view uses,
 * so a circle drawn here is exactly the circle collision reads. WebGL lines are
 * one device pixel wide whatever is asked for, and the canvas is the internal
 * frame, so that is one internal pixel — the width the old display drew at.
 */
const LINE_HEIGHT = 0.3;
const CIRCLE_SEGMENTS = 24;
/** Above every world object; the UI pass draws after this scene anyway. */
const RENDER_ORDER = 1000;
const INITIAL_SEGMENTS = 512;

export class WorldLines {
  readonly object: LineSegments;

  private readonly geometry = new BufferGeometry();
  private readonly material = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  /** Two vertices per segment: `xyz` and `rgba`, filled up to `vertexCount`. */
  private positions = new Float32Array(INITIAL_SEGMENTS * 2 * 3);
  private colours = new Float32Array(INITIAL_SEGMENTS * 2 * 4);
  private vertexCount = 0;

  constructor() {
    this.object = new LineSegments(this.geometry, this.material);
    this.object.renderOrder = RENDER_ORDER;
    this.object.frustumCulled = false;
    this.uploadAttributes();
    this.geometry.setDrawRange(0, 0);
  }

  get visible(): boolean {
    return this.object.visible;
  }

  set visible(value: boolean) {
    this.object.visible = value;
  }

  attach(scene: Scene): void {
    scene.add(this.object);
  }

  /** Starts a rebuild: everything drawn before is forgotten. */
  begin(): void {
    this.vertexCount = 0;
  }

  /** A circle in the floor plane, centred on the simulation's `(x, z)`. */
  circle(x: number, z: number, radius: number, colour: number, alpha = 1): void {
    let previousX = x + radius;
    let previousZ = z;
    for (let i = 1; i <= CIRCLE_SEGMENTS; i++) {
      const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      const nextX = x + Math.cos(angle) * radius;
      const nextZ = z + Math.sin(angle) * radius;
      this.segment(previousX, previousZ, nextX, nextZ, colour, alpha);
      previousX = nextX;
      previousZ = nextZ;
    }
  }

  /** An axis-aligned rectangle outline in the floor plane. */
  rect(minX: number, minZ: number, maxX: number, maxZ: number, colour: number, alpha = 1): void {
    this.segment(minX, minZ, maxX, minZ, colour, alpha);
    this.segment(maxX, minZ, maxX, maxZ, colour, alpha);
    this.segment(maxX, maxZ, minX, maxZ, colour, alpha);
    this.segment(minX, maxZ, minX, minZ, colour, alpha);
  }

  /** Uploads what was drawn since `begin()`. Drawing nothing draws nothing. */
  end(): void {
    const position = this.geometry.getAttribute('position');
    const colour = this.geometry.getAttribute('color');
    if (position instanceof BufferAttribute && colour instanceof BufferAttribute) {
      position.needsUpdate = true;
      colour.needsUpdate = true;
    }
    // An empty range is how a hidden display draws nothing: no geometry is
    // uploaded for it and no draw call is issued.
    this.geometry.setDrawRange(0, this.vertexCount);
  }

  /** Removes the lines from their scene and releases their GPU resources. */
  dispose(): void {
    this.object.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }

  private segment(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    colour: number,
    alpha: number,
  ): void {
    this.ensureCapacity(this.vertexCount + 2);
    this.vertex(ax, az, colour, alpha);
    this.vertex(bx, bz, colour, alpha);
  }

  private vertex(x: number, z: number, colour: number, alpha: number): void {
    const index = this.vertexCount;
    this.positions[index * 3] = x;
    this.positions[index * 3 + 1] = LINE_HEIGHT;
    this.positions[index * 3 + 2] = z;
    this.colours[index * 4] = ((colour >> 16) & 0xff) / 255;
    this.colours[index * 4 + 1] = ((colour >> 8) & 0xff) / 255;
    this.colours[index * 4 + 2] = (colour & 0xff) / 255;
    this.colours[index * 4 + 3] = alpha;
    this.vertexCount = index + 1;
  }

  /**
   * Grows the buffers by doubling. A grown buffer is a new attribute, which
   * three.js uploads whole; the common case — the same room, frame after
   * frame — never reaches this.
   */
  private ensureCapacity(vertices: number): void {
    const capacity = this.positions.length / 3;
    if (vertices <= capacity) {
      return;
    }
    let grown = capacity;
    while (grown < vertices) {
      grown *= 2;
    }
    const positions = new Float32Array(grown * 3);
    positions.set(this.positions);
    const colours = new Float32Array(grown * 4);
    colours.set(this.colours);
    this.positions = positions;
    this.colours = colours;
    this.uploadAttributes();
  }

  private uploadAttributes(): void {
    const position = new BufferAttribute(this.positions, 3);
    position.setUsage(DynamicDrawUsage);
    const colour = new BufferAttribute(this.colours, 4);
    colour.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', position);
    this.geometry.setAttribute('color', colour);
  }
}
