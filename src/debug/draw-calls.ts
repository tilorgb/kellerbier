/**
 * Counts real draw calls.
 *
 * The numbers that are easy to reach — sprite counts, container children — are
 * not the thing the budget in docs/TECH_STACK.md §3 is written about. What
 * breaks batching is a material change, a blend-mode change or z-order churn,
 * and none of those change the sprite count at all: the only visible symptom
 * is the draw call itself.
 *
 * three.js publishes exactly that number as `renderer.info.render.calls`, so
 * this reads it rather than wrapping the WebGL context the way the Pixi-era
 * counter had to. One wrinkle: with `info.autoReset` on, three resets the
 * counters at the start of *every* `render()` call, and a frame here is two of
 * them — the world pass and the UI pass over it — so the value left after a
 * frame would be the UI pass alone. The counter therefore takes the reset
 * over while attached: `beginFrame` reads the whole of the previous frame and
 * then zeroes the counters itself. `detach` gives `autoReset` back.
 */

/** The slice of a `THREE.WebGLRenderer` this reads. Structural, so a test can hand in a stub. */
export interface DrawCallSource {
  readonly info: {
    autoReset: boolean;
    readonly render: { readonly calls: number };
    reset(): void;
  };
}

function isDrawCallSource(value: unknown): value is DrawCallSource {
  if (value === null || typeof value !== 'object' || !('info' in value)) {
    return false;
  }
  const info: unknown = value.info;
  if (info === null || typeof info !== 'object' || !('render' in info) || !('reset' in info)) {
    return false;
  }
  const render: unknown = info.render;
  return (
    typeof info.reset === 'function' &&
    render !== null &&
    typeof render === 'object' &&
    'calls' in render &&
    typeof render.calls === 'number'
  );
}

export class DrawCallCounter {
  private source: DrawCallSource | null = null;
  private lastFrame = 0;
  private restore: (() => void) | null = null;

  /** Draw calls in the frame that just finished, or -1 when not attached to a renderer. */
  get lastFrameCalls(): number {
    return this.source === null ? -1 : this.lastFrame;
  }

  /** `lastFrameCalls` under the name the frame loop reads it by. */
  get count(): number {
    return this.lastFrameCalls;
  }

  get instrumented(): boolean {
    return this.source !== null;
  }

  /**
   * Starts reading a renderer's counters.
   *
   * Returns false when handed something that does not publish them — better an
   * honest "not available" in the overlay than a plausible wrong number.
   */
  attach(renderer: unknown): boolean {
    this.detach();
    if (!isDrawCallSource(renderer)) {
      return false;
    }
    const info = renderer.info;
    const autoReset = info.autoReset;
    info.autoReset = false;
    info.reset();
    this.source = renderer;
    this.lastFrame = 0;
    this.restore = () => {
      info.autoReset = autoReset;
    };
    return true;
  }

  /**
   * Call once per frame, before rendering it: banks the previous frame's count
   * and zeroes the renderer's counters for this one.
   */
  beginFrame(): void {
    if (this.source === null) {
      return;
    }
    this.lastFrame = this.source.info.render.calls;
    this.source.info.reset();
  }

  detach(): void {
    this.restore?.();
    this.restore = null;
    this.source = null;
  }
}
