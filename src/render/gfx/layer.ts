import { OrthographicCamera, Scene, type WebGLRenderer } from 'three';
import { Container, type PointLike } from './container.js';

/**
 * One 2D pass: a `Container` tree drawn with an orthographic camera whose
 * units are UI pixels, y down, over whatever is already in the frame.
 *
 * Painter's order is the whole depth model — the renderer's own sorting is
 * turned off for this pass and every 2D material has depth testing off, so
 * what draws later draws on top, exactly like the 2D scene graph the HUD was
 * written against.
 *
 * Pointer events are the minimum a menu needs: hover and tap on any node
 * with `eventMode = 'static'`, hit-tested against its local bounds, front
 * to back.
 */
export class UiLayer {
  readonly root = new Container();
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(0, 1, 0, 1, -100, 100);

  private widthValue = 1;
  private heightValue = 1;
  private hovered: Container | null = null;
  private pressed: Container | null = null;
  private detachPointer: (() => void) | null = null;

  constructor() {
    this.scene.add(this.root.object);
    this.camera.position.z = 10;
  }

  get width(): number {
    return this.widthValue;
  }

  get height(): number {
    return this.heightValue;
  }

  /** The frame this layer's pixels cover — the internal resolution, or a text-scaled fraction of it. */
  resize(width: number, height: number): void {
    this.widthValue = width;
    this.heightValue = height;
    this.camera.left = 0;
    this.camera.right = width;
    // Top is 0 and bottom is the height: y grows downward, as it does on screen.
    this.camera.top = 0;
    this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
  }

  /** Draws the tree over the current frame. Call after the world pass. */
  render(renderer: WebGLRenderer): void {
    this.root.prepare(1);
    const autoClear = renderer.autoClear;
    const sortObjects = renderer.sortObjects;
    renderer.autoClear = false;
    renderer.sortObjects = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
    renderer.sortObjects = sortObjects;
  }

  // ------------------------------------------------------------ pointer

  /**
   * Routes the canvas's pointer events into the tree. `toLayer` converts a
   * canvas-relative CSS pixel to this layer's pixels — the caller knows how
   * the canvas is scaled on the page.
   */
  attachPointer(
    canvas: HTMLCanvasElement,
    toLayer: (clientX: number, clientY: number, out: PointLike) => void,
  ): void {
    this.detachPointer?.();
    const point: PointLike = { x: 0, y: 0 };
    const onMove = (event: PointerEvent): void => {
      toLayer(event.clientX, event.clientY, point);
      const target = this.hitTest(point);
      if (target !== this.hovered) {
        this.hovered?.emit('pointerout', point);
        this.hovered = target;
        target?.emit('pointerover', point);
        canvas.style.cursor = target?.cursor ?? 'default';
      }
    };
    const onDown = (event: PointerEvent): void => {
      toLayer(event.clientX, event.clientY, point);
      this.pressed = this.hitTest(point);
      this.pressed?.emit('pointerdown', point);
    };
    const onUp = (event: PointerEvent): void => {
      toLayer(event.clientX, event.clientY, point);
      const target = this.hitTest(point);
      if (target !== null && target === this.pressed) {
        target.emit('pointertap', point);
      }
      this.pressed = null;
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    this.detachPointer = () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      this.detachPointer = null;
    };
  }

  /** The topmost interactive node under a layer-space point, or null. */
  hitTest(point: PointLike, node: Container = this.root): Container | null {
    if (!node.visible) {
      return null;
    }
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child === undefined) {
        continue;
      }
      const hit = this.hitTest(point, child);
      if (hit !== null) {
        return hit;
      }
    }
    if (node.eventMode !== 'static') {
      return null;
    }
    const local = node.toLocal(point);
    return node.getLocalBounds().contains(local.x, local.y) ? node : null;
  }

  destroy(): void {
    this.detachPointer?.();
    this.root.destroy({ children: true });
  }
}
