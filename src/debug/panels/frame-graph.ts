import { type Container, Graphics } from 'pixi.js';
import {
  type DebugContext,
  type DebugPanel,
  PANEL_DIM_COLOUR,
  PANEL_WARN_COLOUR,
  PANEL_WIDTH,
  createLabel,
  createPanelFrame,
} from '../panel.js';
import { FRAME_BUDGET_MS, SIM_BUDGET_MS } from '../metrics.js';

const GRAPH_HEIGHT = 46;
const PANEL_HEIGHT = GRAPH_HEIGHT + 32;
const GRAPH_TOP = 14;
const GRAPH_LEFT = 3;

const SIM_COLOUR = 0x6fa8dc;
const RENDER_COLOUR = 0xa8dc6f;
const BUDGET_COLOUR = 0xe0703a;

/**
 * Simulation time, render time and the budget line.
 *
 * Stacked rather than overlaid, because the question this graph answers is
 * almost never "how long did the frame take" — it is "which half of the frame
 * got slower", and two lines crossing each other cannot answer that.
 *
 * The vertical scale follows the worst frame in the history rather than being
 * fixed, with the budget line drawn at its true height. A fixed scale either
 * flattens ordinary frames into nothing or sends a stall off the top.
 */
export class FrameGraphPanel implements DebugPanel {
  readonly title = 'frame';
  readonly view: Container;
  readonly height = PANEL_HEIGHT;

  private readonly bars = new Graphics();
  private readonly budgetLine = new Graphics();
  private readonly summary = createLabel('');
  private readonly scaleLabel = createLabel('', PANEL_DIM_COLOUR);

  constructor() {
    this.view = createPanelFrame(this.title, PANEL_HEIGHT);
    this.view.addChild(this.bars);
    this.view.addChild(this.budgetLine);

    this.summary.position.set(4, GRAPH_TOP + GRAPH_HEIGHT + 2);
    this.view.addChild(this.summary);

    this.scaleLabel.position.set(4, GRAPH_TOP + GRAPH_HEIGHT + 11);
    this.view.addChild(this.scaleLabel);
  }

  update(context: DebugContext): void {
    const metrics = context.metrics;
    const graphWidth = PANEL_WIDTH - GRAPH_LEFT * 2;

    // The scale is the worse of the history's peak and the budget, so the
    // budget line is always on screen — a graph that scales below its own
    // budget line makes every frame look like a disaster.
    const peak = Math.max(metrics.peakTotalMs(), FRAME_BUDGET_MS * 1.25);
    const perMs = GRAPH_HEIGHT / peak;
    const barWidth = graphWidth / metrics.capacity;

    this.bars.clear();
    metrics.forEachFrame((slot, position) => {
      const x = GRAPH_LEFT + position * barWidth;
      const simHeight = (metrics.simMs[slot] ?? 0) * perMs;
      const renderHeight = (metrics.renderMs[slot] ?? 0) * perMs;

      const base = GRAPH_TOP + GRAPH_HEIGHT;
      this.bars
        .rect(x, base - simHeight, Math.max(1, barWidth), simHeight)
        .fill((metrics.simMs[slot] ?? 0) > SIM_BUDGET_MS ? BUDGET_COLOUR : SIM_COLOUR);
      this.bars
        .rect(x, base - simHeight - renderHeight, Math.max(1, barWidth), renderHeight)
        .fill(RENDER_COLOUR);
    });

    const budgetY = GRAPH_TOP + GRAPH_HEIGHT - FRAME_BUDGET_MS * perMs;
    this.budgetLine.clear();
    this.budgetLine
      .rect(GRAPH_LEFT, budgetY, graphWidth, 1)
      .fill({ color: BUDGET_COLOUR, alpha: 0.7 });

    // Text is the expensive part of an overlay, so it moves at a readable rate
    // rather than at the frame rate — the graph carries the detail.
    if (context.frame % 6 !== 0) {
      return;
    }
    const newest = metrics.newest;
    const sim = newest < 0 ? 0 : (metrics.simMs[newest] ?? 0);
    const render = newest < 0 ? 0 : (metrics.renderMs[newest] ?? 0);
    this.summary.text =
      `sim ${sim.toFixed(2)}  gpu ${render.toFixed(2)}  ` + `tot ${(sim + render).toFixed(2)}ms`;
    this.summary.style.fill = sim + render > FRAME_BUDGET_MS ? PANEL_WARN_COLOUR : 0xd8cfc4;
    this.scaleLabel.text = `peak ${peak.toFixed(1)}ms   budget ${String(FRAME_BUDGET_MS)}ms`;
  }
}
