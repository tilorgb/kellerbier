import type { Container } from 'pixi.js';
import {
  type DebugContext,
  type DebugPanel,
  PANEL_CONTENT_TOP,
  PANEL_LINE_HEIGHT,
  PANEL_PADDING,
  PANEL_DIM_COLOUR,
  PANEL_WARN_COLOUR,
  createLabel,
  createPanelFrame,
} from '../panel.js';

const LINES = 8;
const PANEL_HEIGHT = PANEL_CONTENT_TOP + LINES * PANEL_LINE_HEIGHT + PANEL_PADDING;

/**
 * What is alive, and what the pools think of it.
 *
 * Peaks matter more than the live numbers. A peak that never approaches its
 * capacity is memory bought for nothing; one that sits at capacity means
 * elements have been quietly vanishing, and that is not visible any other way.
 */
export class CountsPanel implements DebugPanel {
  readonly title = 'counts';
  readonly view: Container;
  readonly height = PANEL_HEIGHT;

  private readonly lines: ReturnType<typeof createLabel>[] = [];

  constructor() {
    this.view = createPanelFrame(this.title, PANEL_HEIGHT);
    for (let line = 0; line < LINES; line++) {
      const label = createLabel('');
      label.position.set(PANEL_PADDING, PANEL_CONTENT_TOP + line * PANEL_LINE_HEIGHT);
      this.lines.push(label);
      this.view.addChild(label);
    }
  }

  update(context: DebugContext): void {
    if (context.frame % 6 !== 0) {
      return;
    }
    const sim = context.sim;
    const shots = sim.projectiles;
    const particles = sim.particles;

    this.setLine(0, `entities  ${pad(sim.world.count)} / ${String(sim.world.capacity)}`);
    this.setLine(
      1,
      `shots     ${pad(shots.liveCount)} peak ${String(shots.peakLive)}`,
      shots.overflows > 0,
    );
    this.setLine(
      2,
      `particles ${pad(particles.liveCount)} peak ${String(particles.peakLive)}`,
      particles.overflows > 0,
    );
    this.setLine(
      3,
      `numbers   ${pad(sim.damageNumbers.liveCount)}  decals ${String(sim.decals.liveCount)}`,
    );
    this.setLine(4, `candidates ${String(sim.broadphase.candidatesReported)}`);
    this.setLine(
      5,
      `world grow ${String(sim.world.growths)}  evt ${String(sim.events.count)}`,
      sim.world.growths > 0,
    );

    const calls = context.drawCalls.lastFrameCalls;
    this.setLine(
      6,
      calls < 0 ? 'draw calls n/a (webgpu)' : `draw calls ${String(calls)}`,
      calls > 20,
    );
    this.setLine(
      7,
      `overflow  shot ${String(shots.overflows)} par ${String(particles.overflows)}`,
      shots.overflows + particles.overflows > 0,
    );
  }

  private setLine(index: number, text: string, warn = false): void {
    const label = this.lines[index];
    if (label === undefined) {
      return;
    }
    label.text = text;
    label.style.fill = warn ? PANEL_WARN_COLOUR : PANEL_DIM_COLOUR;
  }
}

function pad(value: number): string {
  return String(value).padStart(4, ' ');
}
