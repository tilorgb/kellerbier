import type { Container } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import type { GameView } from '../render/view.js';
import { DebugOverlay } from './overlay.js';
import { createProjectileTagChooser } from './projectile-tag-chooser.js';
import { createTuningWindow } from './tuning-window.js';

export { DebugOverlay } from './overlay.js';
export { FRAME_BUDGET_MS, FrameMetrics } from './metrics.js';
export type { DebugPanel, DebugContext } from './panel.js';

export interface DebugOverlayHost {
  readonly sim: GameSim;
  readonly view: GameView;
  /**
   * The layer panels are drawn into: outside the scaled game, at the display's
   * own resolution. Panels drawn inside the game get eight pixels of glyph
   * height blown up by the game's scale, which is legible only by accident.
   */
  readonly uiLayer: Container;
  /** The game's current whole-number scale, for turning screen drags into room pans. */
  readonly gameScale: () => number;
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
  const overlay = new DebugOverlay(host.sim, host.view, host.uiLayer, host.gameScale);
  overlay.drawCalls.attach(host.gl);
  overlay.attach(window, host.canvas);
  // Independent of the debug overlay on purpose: the panels are for watching
  // what the game is doing, and this is for changing it. They get used at
  // different moments and neither should force the other onto the screen.
  overlay.ownDomTool(createTuningWindow(host.sim.tuning));
  // Same reasoning, and its own key (Equal) rather than folded into the
  // tuning window: this is toggled far more often mid-run than any slider
  // is, while testing one specific combination of #27's tags.
  overlay.ownDomTool(createProjectileTagChooser(host.sim.tuning));
  return overlay;
}
