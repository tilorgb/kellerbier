import type { Container } from '../../render/gfx/index.js';
import { TICKS_PER_SECOND } from '../../sim/time.js';
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

function seconds(ticks: number): string {
  return `${(ticks / TICKS_PER_SECOND).toFixed(1)}s`;
}

/**
 * Run feats (#502): what `sim.feats` has recorded so far — the boss fight in
 * progress, the last one won and how, and the run's bests. Nothing a player
 * reads; it is how a developer checks a feat registered before any unlock
 * asks for it.
 */
export class FeatsPanel implements DebugPanel {
  readonly title = 'run feats';
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
    const feats = context.sim.feats;
    const fight = feats.fightInProgress(context.sim.tick);
    this.setLine(
      0,
      fight === null
        ? 'no boss fight'
        : `fight f${String(fight.floor)}  ${seconds(fight.ticks)}  hits ${String(fight.hits)}`,
    );
    const won = feats.bossFights.at(-1);
    this.setLine(
      1,
      won === undefined
        ? `won 0`
        : `won ${String(feats.bossFights.length)}  last f${String(won.floor)} ${seconds(won.ticks)} hits ${String(won.hitsTaken)} hp ${String(won.healthLeft ?? '-')} tier ${String(won.promilleTier)}`,
    );
    const bests = feats.bests;
    this.setLine(
      2,
      `deepest tier ${String(bests.deepestTier)}  Maß ${String(bests.beersDrunk)}  passives ${String(bests.mostPassives)}`,
    );
    this.setLine(
      3,
      `sets ${bests.completedSets.length === 0 ? '-' : bests.completedSets.join(', ')}`,
    );
  }

  private setLine(index: number, text: string): void {
    const label = this.lines[index];
    if (label !== undefined) {
      label.text = text;
    }
  }
}
