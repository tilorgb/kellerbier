import type { Container } from '../../render/gfx/index.js';
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
import { encodeSeed } from '../../sim/rng/seed.js';
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

    // `>>> 0`: `sim.seed` is whatever the dev-only `?seed=`/`#seed-input`
    // tools (`app/main.ts`) happened to pass, which — unlike every player-
    // facing seed source (`rollSeed`, `decodeSeed`, `dailySeed`) — is not
    // guaranteed to already be a valid 32-bit unsigned integer. `encodeSeed`
    // is deliberately strict about that (a seed that quietly encodes wrong is
    // worse than one that is rejected), so this panel normalises first rather
    // than relaxing that guarantee for everyone else.
    this.setLine(
      0,
      `seed   ${encodeSeed(sim.seed >>> 0)}  (${sim.seed.toString(16).padStart(8, '0')})`,
    );
    this.setLine(1, `tick   ${String(sim.tick)}  (${seconds}s)`);
    // Written as a literal `floor 0 room playground` until now, with a comment
    // promising real values once #20 generated them. #20 landed, and this did
    // not — so the one panel whose whole job is making a bug report
    // reproducible has been naming the wrong room for every run since. Both
    // fields have been on `GameSim` the whole time.
    this.setLine(2, `floor  ${String(sim.currentFloor)}  room ${sim.roomId}`);
    this.setLine(3, `hitstop ${String(sim.hitstop)}  shake ${sim.shake.toFixed(2)}`);
    this.setLine(4, 'O hide  H hitboxes  G grid  C copy');

    this.summary =
      `kellerbier seed=${sim.seed.toString(16)} tick=${String(sim.tick)} ` +
      `floor=${String(sim.currentFloor)} room=${sim.roomId}`;
  }

  private setLine(index: number, text: string): void {
    const label = this.lines[index];
    if (label !== undefined) {
      label.text = text;
    }
  }
}
