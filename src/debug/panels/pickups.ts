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

const LINES = 4;
const PANEL_HEIGHT = PANEL_CONTENT_TOP + LINES * PANEL_LINE_HEIGHT + PANEL_PADDING;

/**
 * The pickup economy (#22): what's in the wallet, and which half of every
 * drop table this run is currently reading from.
 */
export class PickupsPanel implements DebugPanel {
  readonly title = 'pickups';
  readonly view: Container;
  readonly height = PANEL_HEIGHT;

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

  update(context: DebugContext): void {
    if (context.frame % 6 !== 0) {
      return;
    }
    const sim = context.sim;

    this.setLine(0, `Biermarken ${String(sim.biermarken)}`);
    this.setLine(1, `Schlüssel  ${String(sim.keys)}   Bierfassl ${String(sim.bombs)}`);
    this.setLine(
      2,
      `floor ${String(sim.currentFloor)}  drop table: ${sim.promilleUnlocked ? 'promilled' : 'sober'}`,
    );
    // `E`, not `B` — the bomb binding moved to `KeyE` (`app/input/
    // bindings.ts`) and this hint did not follow it. Corrected here rather
    // than in its own change because #85 claims `B` for the Promille-gate
    // override, and a panel telling a developer `B` drops a Bierfassl while
    // it actually restarts the run is worse than the stale hint was.
    this.setLine(3, 'E place/roll Bierfassl');
  }

  private setLine(index: number, text: string): void {
    const label = this.lines[index];
    if (label !== undefined) {
      label.text = text;
    }
  }
}
