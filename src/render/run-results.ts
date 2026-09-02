import { Container, Graphics, type BitmapText, type Renderer } from 'pixi.js';
import type { RunResultsView, UnlockView } from '../app/meta/progress.js';
import { EFFECT_PALETTE, UI_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { UI_LINE_HEIGHT, UI_TEXT_HEIGHT, uiText, uiTextWidth } from './ui/text.js';

/** Margin from the frame's edge to anything on this screen, in UI pixels. */
const MARGIN = 12;

/** Padding inside every panel on this screen. */
const PAD = 6;

/** Gap between the two panels. */
const PANEL_GAP = 12;

const UNLOCKS_WIDTH = 300;
const BOARD_WIDTH = 300;

/** How many best runs the board shows. Ten are stored; this is what fits comfortably in the panel. */
const BOARD_ROWS = 5;

/** One row of a panel. `colour` defaults to the ordinary text colour. */
interface PanelRow {
  readonly text: string;
  readonly colour?: number;
}

/** One unlock's built text, and how tall its two lines actually came out — the wrapped detail may be more than one line. */
interface UnlockEntry {
  readonly header: BitmapText;
  readonly detail: BitmapText;
  readonly height: number;
}

/**
 * The run-results screen — a plain, stylized statistics page shown between
 * runs.
 *
 * ## Why this replaced the Stammtisch
 *
 * The earlier version of this screen (`docs/DECISIONS.md` #51) framed every
 * unlock as a regular arriving at a tavern table, with conditioned dialogue
 * reacting to the last run. That framing added a whole layer — regulars,
 * seats, greetings, arrival lines — on top of what the screen actually
 * needed to say, which is: here is your last run, here is what you have
 * unlocked and what is still locked, here is the board. A real main menu
 * (character select, seed entry, daily run, replays) is coming later; until
 * then this screen does exactly one job and does not pretend to be a hub.
 *
 * ## Rebuilt on every open, and measured rather than assumed
 *
 * `show` throws the previous contents away and lays the whole screen out
 * again, the same as the screen it replaced: this only changes when it opens
 * or when something is unlocked while it is open, and the simulation is
 * paused behind it.
 */
export class RunResultsScreen {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly backdrop = new Graphics();
  private readonly title: DisplayTitle;
  private readonly content = new Container();

  private state: RunResultsView | null = null;
  private runOver = true;
  private width = 0;
  private height = 0;

  constructor(kit: UiKit, renderer: Renderer) {
    this.kit = kit;
    this.view.visible = false;
    this.view.addChild(this.backdrop);
    this.title = new DisplayTitle(renderer, TITLE_STYLES.floor);
    this.title.set('Results');
    this.view.addChild(this.title.view);
    this.view.addChild(this.content);
  }

  get visible(): boolean {
    return this.view.visible;
  }

  /**
   * Opens on `view`. `runOver` is what the hint line changes on: a screen
   * opened after a death offers the next run; a screen opened *during* one
   * offers only the way back to it, because "Enter starts a run" over a run
   * that is still going is a keypress that throws away a live run with no
   * warning.
   */
  show(view: RunResultsView, runOver: boolean): void {
    this.state = view;
    this.runOver = runOver;
    this.view.visible = true;
    this.layOut();
  }

  hide(): void {
    this.view.visible = false;
  }

  /** Swaps in a freshly built view without closing the screen — what an unlock earned mid-visit calls. */
  update(view: RunResultsView): void {
    this.state = view;
    if (this.view.visible) {
      this.layOut();
    }
  }

  /** Call on every resize. Dimensions in UI pixels. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.backdrop.clear();
    this.backdrop
      .rect(0, 0, width, height)
      .fill({ color: EFFECT_PALETTE.gameOverDim, alpha: 0.96 });
    if (this.view.visible) {
      this.layOut();
    }
  }

  private layOut(): void {
    const state = this.state;
    if (state === null) {
      return;
    }
    this.content.removeChildren();
    const centreX = Math.round(this.width / 2);

    this.title.place(centreX, MARGIN);
    const lastRunY = MARGIN + this.title.height + 4;
    this.addCentred(state.lastRunLine, centreX, lastRunY, UI_PALETTE.textDim);
    const statsY = lastRunY + UI_LINE_HEIGHT;
    this.addCentred(
      `Runs: ${String(state.runsPlayed)}    Kills: ${String(state.totalKills)}`,
      centreX,
      statsY,
      UI_PALETTE.textDim,
    );

    const hintY = this.height - MARGIN - UI_TEXT_HEIGHT;

    // The two panels sit centred in the band between the summary lines above
    // and the hint row below, rather than pinned to the bottom — with no
    // table of chairs above them any more, bottom-pinning would leave a bare
    // gap under the summary instead of a screen that reads as one piece.
    const bandTop = statsY + UI_LINE_HEIGHT + 10;
    const bandBottom = hintY - 10;
    const bandCentre = Math.round((bandTop + bandBottom) / 2);

    const unlockEntries = state.unlocks.map((unlock) => this.buildUnlockEntry(unlock));
    const unlocksHeight =
      PAD * 2 + UI_LINE_HEIGHT + unlockEntries.reduce((sum, entry) => sum + entry.height, 0);
    const boardRowsData = this.boardRows(state);
    const boardHeight = panelHeight(boardRowsData.length);

    const totalWidth = UNLOCKS_WIDTH + PANEL_GAP + BOARD_WIDTH;
    const leftX = Math.round(centreX - totalWidth / 2);
    const rightX = leftX + UNLOCKS_WIDTH + PANEL_GAP;

    this.drawUnlocksPanel(unlockEntries, leftX, bandCentre + unlocksHeight / 2, unlocksHeight);
    this.drawPanel('The Board', boardRowsData, rightX, bandCentre + boardHeight / 2, BOARD_WIDTH);

    if (this.runOver) {
      this.addCentred('Enter: New Run    T: Close', centreX, hintY, UI_PALETTE.textDim);
    } else {
      this.addCentred('T: Back to Run', centreX, hintY, UI_PALETTE.textDim);
    }
  }

  /**
   * One unlock's two lines: its name, and what it does (unlocked) or what
   * earns it (locked) — wrapped rather than trimmed, since an unlock's
   * effect is content a player is meant to actually read, not a row in a
   * fixed-height list.
   */
  private buildUnlockEntry(unlock: UnlockView): UnlockEntry {
    const wrap = UNLOCKS_WIDTH - PAD * 2;
    const header = uiText(unlock.name, {
      colour: unlock.unlocked ? UI_PALETTE.accent : UI_PALETTE.textDisabled,
    });
    const detailText = unlock.unlocked
      ? unlock.effect
      : unlock.progress === null
        ? unlock.goal
        : `${unlock.progress} — ${unlock.goal}`;
    const detail = uiText(detailText, {
      colour: unlock.unlocked ? UI_PALETTE.text : UI_PALETTE.textDim,
      wrapWidth: wrap,
    });
    return { header, detail, height: UI_LINE_HEIGHT + Math.max(UI_LINE_HEIGHT, detail.height) };
  }

  /** The "Unlocked" panel, stacking each unlock's entry to whatever height its wrapped detail needs. */
  private drawUnlocksPanel(
    entries: readonly UnlockEntry[],
    x: number,
    bottom: number,
    height: number,
  ): void {
    const y = bottom - height;
    const panel = this.kit.panelSprite(UNLOCKS_WIDTH, height);
    panel.position.set(x, y);
    this.content.addChild(panel);
    const heading = uiText('Unlocked', { colour: UI_PALETTE.accent });
    heading.position.set(x + PAD, y + PAD);
    this.content.addChild(heading);
    let rowY = y + PAD + UI_LINE_HEIGHT;
    for (const entry of entries) {
      entry.header.position.set(x + PAD, rowY);
      entry.detail.position.set(x + PAD, rowY + UI_LINE_HEIGHT);
      this.content.addChild(entry.header);
      this.content.addChild(entry.detail);
      rowY += entry.height;
    }
  }

  private boardRows(state: RunResultsView): readonly PanelRow[] {
    const board = state.board;
    if (board === null) {
      return [{ text: 'The board is still empty —' }, { text: 'nobody has written on it yet.' }];
    }
    return board.length === 0
      ? [{ text: 'No runs on the board yet.' }]
      : board.slice(0, BOARD_ROWS).map((text) => ({ text }));
  }

  /** A titled panel whose *bottom* edge sits at `bottom`, so two of them share a baseline when asked to. */
  private drawPanel(
    heading: string,
    rows: readonly PanelRow[],
    x: number,
    bottom: number,
    width: number,
  ): void {
    const height = panelHeight(rows.length);
    const y = bottom - height;
    const panel = this.kit.panelSprite(width, height);
    panel.position.set(x, y);
    this.content.addChild(panel);
    const headingLabel = uiText(heading, { colour: UI_PALETTE.accent });
    headingLabel.position.set(x + PAD, y + PAD);
    this.content.addChild(headingLabel);
    rows.forEach((row, index) => {
      const label = uiText(row.text, { colour: row.colour ?? UI_PALETTE.text });
      label.position.set(x + PAD, y + PAD + UI_LINE_HEIGHT * (index + 1));
      this.content.addChild(label);
    });
  }

  private addCentred(text: string, centreX: number, y: number, colour: number): void {
    const label = uiText(text, { colour });
    label.position.set(Math.round(centreX - uiTextWidth(text) / 2), y);
    this.content.addChild(label);
  }
}

/** A panel's height for `rows.length` rows: padding, the heading row, then one row each. */
function panelHeight(rowCount: number): number {
  return PAD * 2 + UI_LINE_HEIGHT * (rowCount + 1);
}
