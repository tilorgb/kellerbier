import type { Container } from 'pixi.js';
import {
  type DebugContext,
  type DebugPanel,
  PANEL_CONTENT_TOP,
  PANEL_LINE_HEIGHT,
  PANEL_PADDING,
  PANEL_DIM_COLOUR,
  createLabel,
  createPanelFrame,
} from '../panel.js';
import { TICKS_PER_SECOND } from '../../sim/time.js';

const LINES = 5;
const PANEL_HEIGHT = PANEL_CONTENT_TOP + LINES * PANEL_LINE_HEIGHT + PANEL_PADDING;

/**
 * The identity of the run in front of you.
 *
 * This is the panel a bug report is written from: seed, tick, and where the
 * simulation currently is. `C` copies it, because a seed transcribed by hand
 * off a screenshot is a seed that reproduces a different run.
 */
export class RunInfoPanel implements DebugPanel {
  readonly title = 'run';
  readonly view: Container;
  readonly height = PANEL_HEIGHT;

  /** The last summary rendered, which is also what the copy key copies. */
  private summary = '';

  private readonly lines: ReturnType<typeof createLabel>[] = [];

  constructor() {
    this.view = createPanelFrame(this.title, PANEL_HEIGHT);
    for (let line = 0; line < LINES; line++) {
      const label = createLabel('', PANEL_DIM_COLOUR);
      label.position.set(PANEL_PADDING, PANEL_CONTENT_TOP + line * PANEL_LINE_HEIGHT);
      this.lines.push(label);
      this.view.addChild(label);
    }
  }

  /** A one-line description of the run, for the clipboard. */
  get copyText(): string {
    return this.summary;
  }

  update(context: DebugContext): void {
    if (context.frame % 6 !== 0) {
      return;
    }
    const sim = context.sim;
    const seconds = (sim.tick / TICKS_PER_SECOND).toFixed(2);

    this.setLine(0, `seed   ${sim.seed.toString(16).padStart(8, '0')}`);
    this.setLine(1, `tick   ${String(sim.tick)}  (${seconds}s)`);
    // Floor and room are placeholders until #20 generates them. Shown anyway so
    // the shape of a bug report does not change when they arrive.
    this.setLine(2, 'floor  0  room playground');
    this.setLine(3, `hitstop ${String(sim.hitstop)}  shake ${sim.shake.toFixed(2)}`);
    this.setLine(4, 'F1 hide  H hitboxes  G grid  C copy');

    this.summary =
      `kellerbier seed=${sim.seed.toString(16)} tick=${String(sim.tick)} ` +
      `floor=0 room=playground`;
  }

  private setLine(index: number, text: string): void {
    const label = this.lines[index];
    if (label !== undefined) {
      label.text = text;
    }
  }
}
