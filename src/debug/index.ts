import type { WebGLRenderer } from 'three';
import type { Container } from '../render/gfx/index.js';
import type { GameSim } from '../sim/game/sim.js';
import type { GameView } from '../render/view.js';
import { DebugOverlay } from './overlay.js';
import { createProjectileTagChooser } from './projectile-tag-chooser.js';
import { createTuningWindow } from './tuning-window.js';

export { DebugOverlay } from './overlay.js';
export { DrawCallCounter, type DrawCallSource } from './draw-calls.js';
export { FRAME_BUDGET_MS, FrameMetrics } from './metrics.js';
export type { DebugPanel, DebugContext } from './panel.js';

export interface DebugOverlayHost {
  readonly sim: GameSim;
  readonly view: GameView;
  /**
   * The 2D layer panels are drawn into, in UI pixels — the internal 640×360
   * frame the HUD shares. Panels are pixel-font text, so they sit at 1:1 in
   * that frame like every other label; the overlay lays them out against it.
   */
  readonly uiLayer: Container;
  /** The canvas's current whole-number scale (CSS px per internal px), for turning screen drags into room pans. */
  readonly gameScale: () => number;
  readonly canvas: HTMLCanvasElement;
  /** The renderer whose `info.render.calls` the counts panel reports. */
  readonly renderer: WebGLRenderer;
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
  overlay.drawCalls.attach(host.renderer);
  overlay.attach(window, host.canvas);
  // Independent of the debug overlay on purpose: the panels are for watching
  // what the game is doing, and this is for changing it. They get used at
  // different moments and neither should force the other onto the screen.
  overlay.ownDomTool(createTuningWindow(() => overlay.tuning));
  // Same reasoning, and its own key (I) rather than folded into the tuning
  // window: this is toggled far more often mid-run than any slider is,
  // while testing one specific combination of #27's tags.
  overlay.ownDomTool(createProjectileTagChooser(() => overlay.tuning));
  return overlay;
}
