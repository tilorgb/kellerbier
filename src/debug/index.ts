import type { GameSim } from '../sim/game/sim.js';
import type { GameView } from '../render/view.js';
import { DebugOverlay } from './overlay.js';

export { DebugOverlay } from './overlay.js';
export { FRAME_BUDGET_MS, FrameMetrics } from './metrics.js';
export type { DebugPanel, DebugContext } from './panel.js';

export interface DebugOverlayHost {
  readonly sim: GameSim;
  readonly view: GameView;
  readonly canvas: HTMLCanvasElement;
  /** The WebGL context to count draw calls on, if the renderer has one. */
  readonly gl: unknown;
}

/**
 * Builds the overlay and wires it up.
 *
 * The single entry point, so that everything under `src/debug/` is reachable
 * only through one dynamic import — which is what lets a production build drop
 * the lot. See `mountDebugOverlay` in `src/app/main.ts`.
 */
export function createDebugOverlay(host: DebugOverlayHost): DebugOverlay {
  const overlay = new DebugOverlay(host.sim, host.view);
  overlay.drawCalls.attach(host.gl);
  overlay.attach(window, host.canvas);
  return overlay;
}
