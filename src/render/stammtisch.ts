import { Container, Graphics, Sprite, type BitmapText, type Renderer } from 'pixi.js';
import type { SeatView, StammtischView } from '../app/meta/progress.js';
import { encodeSeed } from '../sim/rng/seed.js';
import { EFFECT_PALETTE, UI_PALETTE } from './palette.js';
import { FocusRing, iconRoles, type UiKit } from './ui/kit.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { UI_LINE_HEIGHT, UI_TEXT_HEIGHT, uiText, uiTextWidth } from './ui/text.js';

/** Margin from the frame's edge to anything on this screen, in UI pixels. */
const MARGIN = 12;

/** A chair's widest box. Four of them plus their gaps fit the 640-wide frame exactly. */
const SEAT_WIDTH = 148;
const SEAT_GAP = 8;

/** Padding inside every panel on this screen. */
const PAD = 6;

/** Where a row's text starts when an icon sits to its left. */
const ICON_INDENT = 12;

/** How many best runs the board shows. Ten are stored; four is what fits under the table. */
const BOARD_ROWS = 4;
const BOARD_WIDTH = 190;
const NEXT_RUN_WIDTH = 210;

/**
 * Der Stammtisch (#46) — the table between runs.
 *
 * ## Why this is a table and not a list of checkboxes
 *
 * The issue's own note: "a table of Bavarian regulars slowly filling with
 * everyone you have beaten is a much better progress bar than a progress
 * bar." So the chairs are always all there. An empty one is drawn as an empty
 * one — a sunken well, a padlock, and the sentence saying who could be
 * sitting in it — rather than hidden until earned, because a hub that only
 * shows what you already have cannot show you what to go and get, which is
 * the other half of what a hub is for.
 *
 * ## No faces yet, on purpose
 *
 * A regular is a name plate and a chair, not a portrait. Portraits are pixel
 * art, and `CLAUDE.md` is explicit that new pixel art gets a set of design
 * options and a sign-off before it lands in a commit — a decision that
 * belongs with #58's story delivery and #47's characters, where the same
 * faces are needed again, rather than being made in passing here. The kit
 * (#154) already draws everything this screen needs to be legible.
 *
 * ## Rebuilt on every open, and measured rather than assumed
 *
 * `show` throws the previous contents away and lays the whole screen out
 * again — right here, unlike in a HUD component, because this screen only
 * changes when it opens or when the cursor moves, and the simulation is
 * paused behind it.
 *
 * Every box is then sized to the text it actually holds, and the chairs all
 * take the height of the tallest of them. A fixed height would have been
 * fine for exactly as long as the four authored regulars kept their current
 * names: the first line that wrapped to three lines would have spilled out
 * the bottom of its frame, silently, in the one place where a locked chair's
 * goal is the only thing telling a player what to go and do.
 */
export class StammtischScreen {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly backdrop = new Graphics();
  private readonly title: DisplayTitle;
  private readonly content = new Container();
  private readonly focusRing: FocusRing;

  private state: StammtischView | null = null;
  private seed = 0;
  private runOver = true;
  private selected = 0;
  private width = 0;
  private height = 0;

  constructor(kit: UiKit, renderer: Renderer) {
    this.kit = kit;
    this.view.visible = false;
    this.view.addChild(this.backdrop);
    this.title = new DisplayTitle(renderer, TITLE_STYLES.floor);
    this.title.set('Da Stammtisch');
    this.view.addChild(this.title.view);
    this.view.addChild(this.content);
    this.focusRing = new FocusRing(kit);
    this.view.addChild(this.focusRing.view);
  }

  get visible(): boolean {
    return this.view.visible;
  }

  /** Which chair the cursor is on, so the caller can mark an arriving regular as greeted. */
  get selectedSeat(): SeatView | null {
    return this.state?.seats[this.selected] ?? null;
  }

  /**
   * Opens on `view`, with `seed` shown as the one the next run will use.
   *
   * `runOver` is what the bottom line changes on. A table opened after a
   * death offers the next run; a table opened *during* one offers the way
   * back to it, because "Enter starts a run" over a run that is still going
   * is a keypress that throws away a live run with no warning.
   */
  show(view: StammtischView, seed: number, runOver: boolean): void {
    this.state = view;
    this.seed = seed;
    this.runOver = runOver;
    this.selected = Math.min(Math.max(view.openOn, 0), Math.max(view.seats.length - 1, 0));
    this.view.visible = true;
    this.layOut();
  }

  hide(): void {
    this.view.visible = false;
  }

  /** Moves the cursor along the table, clamped rather than wrapped — the ends of a table are ends. */
  moveSelection(delta: number): void {
    if (this.state === null) {
      return;
    }
    const next = Math.min(Math.max(this.selected + delta, 0), this.state.seats.length - 1);
    if (next === this.selected) {
      return;
    }
    this.selected = next;
    this.layOut();
  }

  /** Shows a different seed — the run-start panel's one value that changes while the screen is open. */
  setSeed(seed: number): void {
    this.seed = seed;
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

    // --- the table ---
    const seatTop = lastRunY + UI_LINE_HEIGHT + 6;
    const seatCount = Math.max(state.seats.length, 1);
    const seatWidth = Math.min(
      SEAT_WIDTH,
      Math.floor((this.width - MARGIN * 2 - SEAT_GAP * (seatCount - 1)) / seatCount),
    );
    const chairs = state.seats.map((seat) => this.buildSeat(seat, seatWidth));
    const seatHeight = chairs.reduce((tallest, chair) => Math.max(tallest, chair.height), 0);
    const tableWidth = seatWidth * seatCount + SEAT_GAP * (seatCount - 1);
    const tableLeft = Math.round(centreX - tableWidth / 2);
    chairs.forEach((chair, index) => {
      const x = tableLeft + index * (seatWidth + SEAT_GAP);
      // A taken chair is a panel; an empty one is a well — a hole in the
      // table rather than a person-shaped box with nobody in it.
      const seated = state.seats[index]?.seated ?? false;
      const frame = seated
        ? this.kit.panelSprite(seatWidth, seatHeight)
        : this.kit.wellSprite(seatWidth, seatHeight);
      frame.position.set(x, seatTop);
      this.content.addChild(frame);
      chair.body.position.set(x, seatTop);
      this.content.addChild(chair.body);
      if (index === this.selected) {
        this.focusRing.sync({ x, y: seatTop, width: seatWidth, height: seatHeight });
      }
    });
    if (state.seats.length === 0) {
      this.focusRing.sync(null);
    }

    // --- what the chair the cursor is on has to say ---
    const speechTop = seatTop + seatHeight + 8;
    const speechWidth = Math.min(this.width - MARGIN * 2, 460);
    const speechLeft = Math.round(centreX - speechWidth / 2);
    const seat = this.selectedSeat;
    if (seat !== null) {
      const heading = uiText(seat.seated ? `${seat.name ?? ''} — ${seat.role}` : seat.goal, {
        colour: seat.seated ? UI_PALETTE.accent : UI_PALETTE.textDim,
      });
      const line = uiText(seat.line, {
        colour: UI_PALETTE.text,
        wrapWidth: speechWidth - PAD * 2,
      });
      const panel = this.kit.panelSprite(
        speechWidth,
        PAD * 2 + UI_LINE_HEIGHT + Math.ceil(line.height),
      );
      panel.position.set(speechLeft, speechTop);
      this.content.addChild(panel);
      heading.position.set(speechLeft + PAD, speechTop + PAD);
      line.position.set(speechLeft + PAD, speechTop + PAD + UI_LINE_HEIGHT);
      this.content.addChild(heading);
      this.content.addChild(line);
    }

    // --- the two panels along the bottom, bottom-aligned so they share a
    // baseline however many rows each of them happens to hold ---
    // A finished run offers a second hint row (seed/daily/replay controls,
    // #48) that a run still in progress has no use for, so only that case
    // reserves the extra line.
    const hintRows = this.runOver ? 2 : 1;
    const hintY = this.height - MARGIN - UI_TEXT_HEIGHT;
    const panelBottom = hintY - (hintRows - 1) * UI_LINE_HEIGHT - 6;
    this.drawPanel('Nächster Lauf', this.nextRunRows(state), MARGIN, panelBottom, NEXT_RUN_WIDTH);
    this.drawPanel(
      'D’Tafel',
      this.boardRows(state),
      this.width - MARGIN - BOARD_WIDTH,
      panelBottom,
      BOARD_WIDTH,
    );

    // Spelled out rather than drawn as ← and →: the pixel face (#154) has no
    // arrow glyphs, and an unknown character is a blank, not a hint.
    if (this.runOver) {
      this.addCentred(
        'Enter: Lauf starten    Links/Rechts: umschaun    R: anderer Same    T: zua',
        centreX,
        hintY - UI_LINE_HEIGHT,
        UI_PALETTE.textDim,
      );
      const replayHint = state.hasReplay ? '    V: o’gschaugt    X: exportian' : '';
      this.addCentred(
        `E: Same eigeben    D: täglicher Lauf    C: kopian${replayHint}`,
        centreX,
        hintY,
        UI_PALETTE.textDim,
      );
    } else {
      this.addCentred(
        'Links/Rechts: umschaun    C: Lauf kopian    T: zruck zum Lauf',
        centreX,
        hintY,
        UI_PALETTE.textDim,
      );
    }
  }

  /** One chair's contents, laid out top-down in its own container so the frame can be sized around it. */
  private buildSeat(seat: SeatView, width: number): { body: Container; height: number } {
    const body = new Container();
    const wrap = width - PAD * 2;
    const nameColour = seat.seated ? UI_PALETTE.text : UI_PALETTE.textDisabled;
    const accent = seat.seated ? UI_PALETTE.accent : UI_PALETTE.textDisabled;
    let y = PAD;

    const icon = new Sprite(this.kit.icon(seat.seated ? 'mug-full' : 'lock', iconRoles(accent)));
    icon.position.set(PAD, y);
    body.addChild(icon);
    y += this.addRow(
      body,
      uiText(seat.name ?? 'No frei', { colour: nameColour }),
      PAD + ICON_INDENT,
      y,
    );

    if (seat.role.length > 0) {
      y += this.addRow(
        body,
        uiText(seat.role, { colour: UI_PALETTE.textDim, wrapWidth: wrap }),
        PAD,
        y,
      );
    }
    y += 2;

    // What they brought, under the star the rest of the UI already uses for
    // "you earned this" — and, under that, either what it does or what it
    // would take to get it.
    const star = new Sprite(this.kit.icon('star', iconRoles(accent)));
    star.position.set(PAD, y);
    body.addChild(star);
    y += this.addRow(body, uiText(seat.grantName, { colour: nameColour }), PAD + ICON_INDENT, y);
    y += this.addRow(
      body,
      uiText(seat.seated ? seat.grantEffect : (seat.progress ?? seat.goal), {
        colour: UI_PALETTE.textDim,
        wrapWidth: wrap,
      }),
      PAD,
      y,
    );

    if (seat.arriving) {
      const badge = uiText('neu', { colour: UI_PALETTE.focusRing });
      badge.position.set(width - PAD - uiTextWidth('neu'), PAD);
      body.addChild(badge);
    }
    return { body, height: y + PAD };
  }

  /** Places one row and reports how much vertical space it took. */
  private addRow(parent: Container, label: BitmapText, x: number, y: number): number {
    label.position.set(x, y);
    parent.addChild(label);
    return Math.max(UI_LINE_HEIGHT, Math.ceil(label.height));
  }

  private nextRunRows(state: StammtischView): readonly string[] {
    const seated = state.seats.filter((seat) => seat.seated).length;
    const daily = state.daily.playedToday;
    return [
      `Figur: ${state.characters.find((character) => character.unlocked)?.name ?? 'Alois'}`,
      state.seedUnlocked ? `Same: ${encodeSeed(this.seed >>> 0)}` : 'Same: no ned dei Sach',
      `Täglicher Same: ${encodeSeed(state.daily.seed >>> 0)}${daily === null ? '' : ' (scho gspielt)'}`,
      `Freigschaltn: ${String(seated)} vo ${String(state.seats.length)}`,
      `Läufe: ${String(state.runsPlayed)}    Daschlogn: ${String(state.totalKills)}`,
    ];
  }

  private boardRows(state: StammtischView): readonly string[] {
    const board = state.board;
    if (board === null) {
      return ['D’Tafel hängt no leer —', 'da schreibt erst wer o.'];
    }
    return board.length === 0 ? ['No koa Lauf an der Tafel.'] : board.slice(0, BOARD_ROWS);
  }

  /** A titled panel whose *bottom* edge sits at `bottom`, so two of them share a baseline. */
  private drawPanel(
    heading: string,
    rows: readonly string[],
    x: number,
    bottom: number,
    width: number,
  ): void {
    const height = PAD * 2 + UI_LINE_HEIGHT * (rows.length + 1);
    const y = bottom - height;
    const panel = this.kit.panelSprite(width, height);
    panel.position.set(x, y);
    this.content.addChild(panel);
    const headingLabel = uiText(heading, { colour: UI_PALETTE.accent });
    headingLabel.position.set(x + PAD, y + PAD);
    this.content.addChild(headingLabel);
    rows.forEach((row, index) => {
      const label = uiText(row, { colour: UI_PALETTE.text });
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
