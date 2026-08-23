/**
 * Keyboard and mouse state.
 *
 * The state is driven by plain method calls; `attach` only wires DOM events to
 * those methods. That split keeps the whole thing testable without a DOM, and
 * it is also what lets a replay drive the same code path as a live run.
 */

/** Where the mouse pointer is, in room coordinates. */
export interface PointerPosition {
  x: number;
  y: number;
}

/**
 * How to turn a client pixel into a room coordinate.
 *
 * Read on every pointer move rather than captured once, because the window can
 * be resized and the game re-centred underneath a stationary mouse. The caller
 * owns the object and updates it in place; nothing here writes to it.
 */
export interface PointerMapping {
  /** Top-left of the game inside the canvas, in client pixels. */
  readonly originX: number;
  readonly originY: number;
  /** Room units covered by one client pixel. */
  readonly unitsPerPixel: number;
}

export class KeyboardMouseSource {
  private readonly keysDown = new Set<string>();
  private readonly mouseButtonsDown = new Set<number>();
  private readonly pointer: PointerPosition = { x: 0, y: 0 };
  private pointerSeen = false;
  private activity = 0;

  /** Increments whenever the player touches keyboard or mouse. */
  get activityCounter(): number {
    return this.activity;
  }

  /** True once the pointer has been somewhere, so aim can trust it. */
  get hasPointer(): boolean {
    return this.pointerSeen;
  }

  get pointerX(): number {
    return this.pointer.x;
  }

  get pointerY(): number {
    return this.pointer.y;
  }

  isKeyDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  isMouseButtonDown(button: number): boolean {
    return this.mouseButtonsDown.has(button);
  }

  keyDown(code: string): void {
    if (!this.keysDown.has(code)) {
      this.keysDown.add(code);
      this.activity += 1;
    }
  }

  keyUp(code: string): void {
    this.keysDown.delete(code);
  }

  mouseDown(button: number): void {
    if (!this.mouseButtonsDown.has(button)) {
      this.mouseButtonsDown.add(button);
      this.activity += 1;
    }
  }

  mouseUp(button: number): void {
    this.mouseButtonsDown.delete(button);
  }

  /** Reports the pointer in room coordinates. */
  movePointer(x: number, y: number): void {
    if (this.pointer.x !== x || this.pointer.y !== y) {
      this.activity += 1;
    }
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointerSeen = true;
  }

  /**
   * Releases everything.
   *
   * Called on blur: a key held while the window loses focus never sends its
   * keyup, and the player comes back to a character walking into a wall.
   */
  clear(): void {
    this.keysDown.clear();
    this.mouseButtonsDown.clear();
  }

  /**
   * Wires DOM events to this source. Returns a teardown function.
   *
   * `event.code` rather than `event.key`, so bindings follow physical key
   * positions and survive a layout change.
   */
  attach(target: Window, canvas: HTMLCanvasElement, mapping: PointerMapping): () => void {
    const onKeyDown = (event: KeyboardEvent): void => {
      this.keyDown(event.code);
      // Tab and the arrow keys scroll or move focus otherwise, which fights
      // the game for the same keypress.
      if (event.code === 'Tab' || event.code.startsWith('Arrow') || event.code === 'Space') {
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      this.keyUp(event.code);
    };
    const onMouseDown = (event: MouseEvent): void => {
      this.mouseDown(event.button);
    };
    const onMouseUp = (event: MouseEvent): void => {
      this.mouseUp(event.button);
    };
    const onMouseMove = (event: MouseEvent): void => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) {
        return;
      }
      this.movePointer(
        (event.clientX - bounds.left - mapping.originX) * mapping.unitsPerPixel,
        (event.clientY - bounds.top - mapping.originY) * mapping.unitsPerPixel,
      );
    };
    const onBlur = (): void => {
      this.clear();
    };
    const onContextMenu = (event: MouseEvent): void => {
      // Right-click is a game button, not a menu.
      event.preventDefault();
    };

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);
    canvas.addEventListener('mousedown', onMouseDown);
    target.addEventListener('mouseup', onMouseUp);
    target.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('contextmenu', onContextMenu);

    return () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousedown', onMouseDown);
      target.removeEventListener('mouseup', onMouseUp);
      target.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }
}
