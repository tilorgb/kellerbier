/**
 * Counts real draw calls.
 *
 * Pixi does not publish a draw-call count, and the numbers that are easy to
 * reach — sprite counts, container children — are not the thing the budget in
 * docs/TECH_STACK.md §3 is written about. What breaks batching is a filter, a
 * blend-mode change or z-order churn, and none of those change the sprite
 * count at all: the only visible symptom is the draw call itself.
 *
 * So the WebGL context is wrapped. That is intrusive, which is why it happens
 * only when the overlay asks for it and only in a dev build.
 */

interface CountingContext {
  drawElements: (...args: unknown[]) => void;
  drawArrays: (...args: unknown[]) => void;
  drawElementsInstanced?: (...args: unknown[]) => void;
}

export class DrawCallCounter {
  /** Calls counted since the last `beginFrame`. */
  private current = 0;
  private lastFrame = 0;
  private restore: (() => void) | null = null;

  /** Draw calls in the frame that just finished, or -1 when not instrumented. */
  get lastFrameCalls(): number {
    return this.restore === null ? -1 : this.lastFrame;
  }

  get instrumented(): boolean {
    return this.restore !== null;
  }

  /**
   * Wraps a rendering context, if there is one to wrap.
   *
   * Returns false on WebGPU, where this technique does not apply — better an
   * honest "not available" in the overlay than a plausible wrong number.
   */
  attach(gl: unknown): boolean {
    if (gl === null || typeof gl !== 'object') {
      return false;
    }
    const context = gl as CountingContext;
    if (typeof context.drawElements !== 'function') {
      return false;
    }

    // The originals are kept unbound and called against the context, so
    // `detach` can put back the exact function that was there. Restoring a
    // bound copy would leave the context subtly different from how it was
    // found, which is not a thing a debug tool should do.
    const originalElements = context.drawElements;
    const originalArrays = context.drawArrays;
    const originalInstanced = context.drawElementsInstanced;

    context.drawElements = (...args: unknown[]): void => {
      this.current += 1;
      originalElements.call(context, ...args);
    };
    context.drawArrays = (...args: unknown[]): void => {
      this.current += 1;
      originalArrays.call(context, ...args);
    };
    if (originalInstanced !== undefined) {
      context.drawElementsInstanced = (...args: unknown[]): void => {
        this.current += 1;
        originalInstanced.call(context, ...args);
      };
    }

    this.restore = () => {
      context.drawElements = originalElements;
      context.drawArrays = originalArrays;
      if (originalInstanced !== undefined) {
        context.drawElementsInstanced = originalInstanced;
      }
    };
    return true;
  }

  /** Call before rendering a frame. */
  beginFrame(): void {
    this.lastFrame = this.current;
    this.current = 0;
  }

  detach(): void {
    this.restore?.();
    this.restore = null;
  }
}
