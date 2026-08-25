import type { Container } from 'pixi.js';
import { STAT_IDS, STAT_LABELS } from '../../sim/stats/definition.js';
import {
  type DebugContext,
  type DebugPanel,
  PANEL_CONTENT_TOP,
  PANEL_LINE_HEIGHT,
  PANEL_PADDING,
  PANEL_DIM_COLOUR,
  PANEL_TEXT_COLOUR,
  PANEL_WARN_COLOUR,
  createLabel,
  createPanelFrame,
} from '../panel.js';

const STAT_LINES = STAT_IDS.length;
/** Distinct modifier sources shown below the stat lines, most recent first. */
const SOURCE_LINES = 4;
const LINES = STAT_LINES + SOURCE_LINES;
const PANEL_HEIGHT = PANEL_CONTENT_TOP + LINES * PANEL_LINE_HEIGHT + PANEL_PADDING;

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * The stat inspector (#25).
 *
 * Every one of the six stats, resolved through `sim.stats` — the same
 * pipeline gameplay reads — with a count of the modifiers contributing to
 * each, and a `*` where a cap bound. Below that, every distinct source
 * currently active and which stats it touches. This is the panel "why is my
 * damage 47.3" gets answered from, once items exist to ask the question of;
 * today the only source is Promille.
 */
export class StatsPanel implements DebugPanel {
  readonly title = 'stats';
  readonly view: Container;
  readonly height = PANEL_HEIGHT;

  private readonly statLines: ReturnType<typeof createLabel>[] = [];
  private readonly sourceLines: ReturnType<typeof createLabel>[] = [];

  constructor() {
    this.view = createPanelFrame(this.title, PANEL_HEIGHT);
    for (let line = 0; line < STAT_LINES; line++) {
      const label = createLabel('', PANEL_TEXT_COLOUR);
      label.position.set(PANEL_PADDING, PANEL_CONTENT_TOP + line * PANEL_LINE_HEIGHT);
      this.statLines.push(label);
      this.view.addChild(label);
    }
    for (let line = 0; line < SOURCE_LINES; line++) {
      const label = createLabel('', PANEL_DIM_COLOUR);
      label.position.set(
        PANEL_PADDING,
        PANEL_CONTENT_TOP + (STAT_LINES + line) * PANEL_LINE_HEIGHT,
      );
      this.sourceLines.push(label);
      this.view.addChild(label);
    }
  }

  update(context: DebugContext): void {
    if (context.frame % 6 !== 0) {
      return;
    }
    const stats = context.sim.stats;

    // Source label -> the stats (in STAT_IDS order) it contributes to, built
    // while walking the stat lines so both halves of the panel come from one
    // pass over the traces.
    const touchedBy = new Map<string, string[]>();

    STAT_IDS.forEach((stat, index) => {
      const trace = stats.trace(stat);
      const label = STAT_LABELS[stat];
      const modifierCount = trace.steps.filter(
        (step) => step.stage === 'add' || step.stage === 'multiply',
      ).length;
      const capped = trace.steps.some((step) => step.stage === 'cap');

      const suffix = modifierCount > 0 ? ` (${String(modifierCount)})` : '';
      const capMark = capped ? ' *' : '';
      this.setStatLine(
        index,
        `${label.padEnd(16)}${formatValue(trace.value)}${suffix}${capMark}`,
        capped,
      );

      for (const step of trace.steps) {
        if (step.stage !== 'add' && step.stage !== 'multiply') {
          continue;
        }
        const touchedStats = touchedBy.get(step.source.label) ?? [];
        touchedStats.push(label);
        touchedBy.set(step.source.label, touchedStats);
      }
    });

    let line = 0;
    for (const [sourceLabel, touchedStats] of touchedBy) {
      if (line >= SOURCE_LINES) {
        break;
      }
      this.setSourceLine(line, `${sourceLabel}: ${touchedStats.join(', ')}`);
      line += 1;
    }
    for (; line < SOURCE_LINES; line++) {
      this.setSourceLine(line, '');
    }
  }

  private setStatLine(index: number, text: string, capped: boolean): void {
    const label = this.statLines[index];
    if (label !== undefined) {
      label.text = text;
      label.style.fill = capped ? PANEL_WARN_COLOUR : PANEL_TEXT_COLOUR;
    }
  }

  private setSourceLine(index: number, text: string): void {
    const label = this.sourceLines[index];
    if (label !== undefined) {
      label.text = text;
    }
  }
}
