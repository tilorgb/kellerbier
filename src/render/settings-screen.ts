import { Container, Graphics, Sprite, type BitmapText, type NineSliceSprite } from './gfx/index.js';
import { UI_PALETTE } from './palette.js';
import { FocusRing, iconRoles, type UiKit } from './ui/kit.js';
import type { MenuScreen } from './ui/menu.js';
import { isFocusable, type SettingsRow, type SettingsTab } from './ui/settings-model.js';
import { UI_LINE_HEIGHT, UI_TEXT_HEIGHT, uiText, uiTextHeight, uiTextWidth } from './ui/text.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';

/**
 * The settings screen, drawn where the rest of the game's menus are drawn.
 *
 * ## Why this stopped being a DOM panel
 *
 * #53 shipped settings as an HTML overlay — real `<input type="range">`s and
 * `<select>`s over the canvas. That was the right call for a screen that had
 * to exist before the UI kit did, and its own doc comment said as much. It has
 * two costs that a menu cannot keep paying: a gamepad cannot reach any of it
 * (the browser gives a pad no focus model, so the one screen a player opens
 * *to fix their controller* was the one screen the controller could not
 * operate), and it is visibly a different program from the game behind it —
 * system fonts and CSS widgets over a pixel-art frame.
 *
 * So the controls are drawn from the same kit as everything else and driven
 * the same way `Menu` is: `render/` reads no input, and whoever is polling
 * (`ScreenFlowController`) calls `moveFocus`/`adjust`/`activate`/`cycleTab`.
 * One consequence worth stating: every row here has to be operable with four
 * directions and two buttons, which is why a slider is a stepped value rather
 * than something you drag, and why the rebind rows arm a capture instead of
 * opening a dialog.
 *
 * ## Scrolling without a mask
 *
 * The 2D layer (`render/gfx/`) has no clipping rectangle, and giving it one
 * for this screen alone would be a renderer feature bought for a menu. Rows
 * are therefore laid out from the first visible one until the next would not
 * *fully* fit, and the rest are hidden outright — so nothing is ever drawn
 * half-cut, and the window moves by whole rows as the cursor pushes it.
 */

const PAD = 10;
const TAB_GAP = 8;
const TAB_STRIP_HEIGHT = UI_TEXT_HEIGHT + 6;
const ROW_HEIGHT = UI_TEXT_HEIGHT + 4;
const ROW_GAP = 2;
const NOTE_GAP = 4;
const TRACK_WIDTH = 54;
const TRACK_HEIGHT = 7;
const VALUE_WIDTH = 46;
const HINT_GAP = 6;

/** Left/right on a choice row, and the scroll ticks. */
const CARET = 'caret';

/** An action row that has nothing to do right now (nothing to export, nothing to clear). */
function isHidden(row: SettingsRow): boolean {
  return row.kind === 'action' && row.hidden?.() === true;
}

export interface SettingsScreenActions {
  /** Cancel — the pause menu's Back, Escape, East on a pad. */
  readonly onClose: () => void;
}

interface RowView {
  readonly row: SettingsRow;
  readonly container: Container;
  readonly label: BitmapText;
  readonly value: BitmapText | null;
  readonly track: NineSliceSprite | null;
  readonly fill: Sprite | null;
  readonly leftCaret: Sprite | null;
  readonly rightCaret: Sprite | null;
  height: number;
}

interface TabView {
  readonly tab: SettingsTab;
  readonly label: BitmapText;
  readonly rows: RowView[];
}

export class SettingsScreen implements MenuScreen {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly actions: SettingsScreenActions;
  private readonly backdrop: Graphics;
  private readonly panel: NineSliceSprite;
  private readonly heading: DisplayTitle;
  private readonly tabStrip = new Container();
  private readonly tabUnderline: Sprite;
  private readonly rowsLayer = new Container();
  private readonly selection: NineSliceSprite;
  private readonly focusRing: FocusRing;
  private readonly hint: BitmapText;
  private readonly scrollUp: Sprite;
  private readonly scrollDown: Sprite;
  private readonly tabs: TabView[] = [];

  private tabIndex = 0;
  private focusIndex = 0;
  private scrollIndex = 0;
  private box = { x: 0, y: 0, width: 0, height: 0 };

  constructor(kit: UiKit, tabs: readonly SettingsTab[], actions: SettingsScreenActions) {
    this.kit = kit;
    this.actions = actions;
    this.view.visible = false;

    // Only drawn when this screen is the whole screen (the pause menu's
    // settings); on the title screen it sits inside a pane that is already
    // opaque, and `place` is told which of the two this is.
    this.backdrop = new Graphics();
    this.view.addChild(this.backdrop);

    this.panel = kit.panelSprite(64, 64);
    this.view.addChild(this.panel);

    this.heading = new DisplayTitle(TITLE_STYLES.heading);
    this.heading.set('Settings');
    this.view.addChild(this.heading.view);

    this.tabUnderline = new Sprite(kit.solid);
    this.tabUnderline.tint = UI_PALETTE.accent;
    this.tabStrip.addChild(this.tabUnderline);
    this.view.addChild(this.tabStrip);

    this.selection = kit.buttonSprite('selected', 32, ROW_HEIGHT);
    this.selection.visible = false;
    this.view.addChild(this.selection);
    this.view.addChild(this.rowsLayer);

    this.focusRing = new FocusRing(kit);
    this.view.addChild(this.focusRing.view);

    this.scrollUp = this.caretSprite();
    this.scrollUp.rotation = -Math.PI / 2;
    this.scrollDown = this.caretSprite();
    this.scrollDown.rotation = Math.PI / 2;
    this.view.addChild(this.scrollUp);
    this.view.addChild(this.scrollDown);

    this.hint = uiText('', { colour: UI_PALETTE.textDim });
    this.view.addChild(this.hint);

    tabs.forEach((tab, index) => {
      const label = uiText(tab.label, { colour: UI_PALETTE.textDim });
      label.eventMode = 'static';
      label.cursor = 'pointer';
      label.on('pointertap', () => {
        this.setTab(index);
      });
      this.tabStrip.addChild(label);
      const view: TabView = { tab, label, rows: [] };
      for (const row of tab.rows) {
        view.rows.push(this.buildRow(row, view.rows.length));
      }
      this.tabs.push(view);
    });
    this.focusIndex = this.firstFocusable();
  }

  get visible(): boolean {
    return this.view.visible;
  }

  show(): void {
    this.view.visible = true;
    this.tabIndex = 0;
    this.scrollIndex = 0;
    this.focusIndex = this.firstFocusable();
    this.refresh();
  }

  hide(): void {
    this.view.visible = false;
  }

  /**
   * Puts the panel in a box of UI pixels. `dim` draws a full-frame darkener
   * behind it — true over a paused run, false inside the title screen's own
   * opaque right pane, which is already covering the game.
   */
  place(x: number, y: number, width: number, height: number, dim: boolean): void {
    this.box = { x, y, width, height };
    this.backdrop.visible = dim;
    if (dim) {
      this.backdrop.clear();
      // Generous: `place` is given the panel's box, and the dim has to reach
      // past it in every direction on any window this ever runs in.
      this.backdrop
        .rect(x - 4096, y - 4096, 8192, 8192)
        .fill({ color: UI_PALETTE.panelShadow, alpha: 0.82 });
    }
    this.layOut();
  }

  /** Re-reads every row's value and redraws. Call after anything a row could have changed. */
  refresh(): void {
    if (!this.view.visible) {
      return;
    }
    this.layOut();
  }

  moveFocus(delta: 1 | -1): void {
    const rows = this.rows();
    if (rows.length === 0) {
      return;
    }
    let index = this.focusIndex;
    for (let remaining = rows.length; remaining > 0; remaining--) {
      index = (index + delta + rows.length) % rows.length;
      const row = rows[index];
      if (row !== undefined && isFocusable(row.row)) {
        this.focusIndex = index;
        break;
      }
    }
    this.refresh();
  }

  /** Left/right: a slider steps, a choice cycles, a toggle flips. */
  adjust(delta: 1 | -1): void {
    const row = this.rows()[this.focusIndex]?.row;
    if (row === undefined) {
      return;
    }
    switch (row.kind) {
      case 'slider': {
        const next = Math.min(row.max, Math.max(row.min, row.get() + row.step * delta));
        row.set(next);
        break;
      }
      case 'choice': {
        const ids = row.options.map((option) => option.id);
        const current = ids.indexOf(row.get());
        const next = ids[(current + delta + ids.length) % ids.length];
        if (next !== undefined) {
          row.set(next);
        }
        break;
      }
      case 'toggle':
        row.set(!row.get());
        break;
      default:
        break;
    }
    this.refresh();
  }

  /** Confirm: a toggle flips, an action runs, a value row is left to left/right. */
  activate(): void {
    const row = this.rows()[this.focusIndex]?.row;
    if (row === undefined) {
      return;
    }
    if (row.kind === 'toggle') {
      row.set(!row.get());
    } else if (row.kind === 'action') {
      row.activate();
    }
    this.refresh();
  }

  cycleTab(delta: 1 | -1): void {
    this.setTab((this.tabIndex + delta + this.tabs.length) % this.tabs.length);
  }

  setTab(index: number): void {
    if (index < 0 || index >= this.tabs.length) {
      return;
    }
    this.tabIndex = index;
    this.scrollIndex = 0;
    this.focusIndex = this.firstFocusable();
    this.refresh();
  }

  close(): void {
    this.actions.onClose();
  }

  private rows(): RowView[] {
    return this.tabs[this.tabIndex]?.rows ?? [];
  }

  private firstFocusable(): number {
    const index = this.rows().findIndex((row) => isFocusable(row.row));
    return index === -1 ? 0 : index;
  }

  private caretSprite(): Sprite {
    const sprite = new Sprite(this.kit.icon(CARET, iconRoles(UI_PALETTE.accent)));
    sprite.anchor.set(0.5);
    return sprite;
  }

  private buildRow(row: SettingsRow, index: number): RowView {
    const container = new Container();
    const label = uiText(row.kind === 'note' ? '' : row.label, {
      colour: row.kind === 'note' ? UI_PALETTE.textDim : UI_PALETTE.text,
    });
    container.addChild(label);

    let value: BitmapText | null = null;
    let track: NineSliceSprite | null = null;
    let fill: Sprite | null = null;
    let leftCaret: Sprite | null = null;
    let rightCaret: Sprite | null = null;

    if (row.kind === 'slider') {
      track = this.kit.wellSprite(TRACK_WIDTH, TRACK_HEIGHT);
      fill = new Sprite(this.kit.solid);
      fill.tint = UI_PALETTE.sliderFill;
      container.addChild(track);
      container.addChild(fill);
    }
    if (row.kind === 'choice') {
      leftCaret = this.caretSprite();
      leftCaret.scale.set(-1, 1);
      rightCaret = this.caretSprite();
      container.addChild(leftCaret);
      container.addChild(rightCaret);
    }
    if (row.kind !== 'note') {
      value = uiText('', { colour: UI_PALETTE.accent });
      container.addChild(value);
      container.eventMode = 'static';
      container.cursor = 'pointer';
      container.on('pointerover', () => {
        if (isFocusable(row)) {
          this.focusIndex = index;
          this.refresh();
        }
      });
      container.on('pointertap', () => {
        if (!isFocusable(row)) {
          return;
        }
        this.focusIndex = index;
        // A pointer has nowhere to put "left" and "right", so a click on a
        // stepped row steps it up and wraps — the same gesture a mouse user
        // already expects from a settings row that is not a text field.
        if (row.kind === 'slider' || row.kind === 'choice') {
          this.adjust(1);
        } else {
          this.activate();
        }
      });
    }
    this.rowsLayer.addChild(container);
    return { row, container, label, value, track, fill, leftCaret, rightCaret, height: ROW_HEIGHT };
  }

  /** Greedy word wrap in the text face — a note is the one row with more than one line. */
  private wrap(text: string, width: number): string {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (line !== '' && uiTextWidth(candidate) > width) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
    return lines.join('\n');
  }

  private layOut(): void {
    const { x, y, width, height } = this.box;
    if (width <= 0 || height <= 0) {
      return;
    }
    this.panel.position.set(x, y);
    this.panel.width = width;
    this.panel.height = height;

    const innerLeft = x + PAD;
    const innerRight = x + width - PAD;
    const innerWidth = innerRight - innerLeft;

    this.heading.place(Math.round(x + width / 2), y + PAD);
    let top = y + PAD + this.heading.height + HINT_GAP;

    // The tab strip, centred, with a rule under the active one.
    let penX = 0;
    const tabWidths = this.tabs.map((tab) => uiTextWidth(tab.tab.label));
    const stripWidth =
      tabWidths.reduce((sum, tabWidth) => sum + tabWidth, 0) + TAB_GAP * (this.tabs.length - 1);
    this.tabStrip.position.set(Math.round(x + width / 2 - stripWidth / 2), top);
    this.tabs.forEach((tab, index) => {
      const active = index === this.tabIndex;
      tab.label.position.set(penX, 0);
      tab.label.style.fill = active ? UI_PALETTE.accent : UI_PALETTE.textDim;
      if (active) {
        this.tabUnderline.position.set(penX, UI_TEXT_HEIGHT + 1);
        this.tabUnderline.width = tabWidths[index] ?? 0;
        this.tabUnderline.height = 1;
      }
      penX += (tabWidths[index] ?? 0) + TAB_GAP;
    });
    top += TAB_STRIP_HEIGHT;

    const hintTop = y + height - PAD - UI_TEXT_HEIGHT;
    const bodyBottom = hintTop - HINT_GAP;

    for (const rowView of this.rows()) {
      if (rowView.row.kind === 'note') {
        rowView.label.text = this.wrap(rowView.row.text(), innerWidth);
        rowView.height = uiTextHeight(rowView.label.text) + NOTE_GAP;
      } else {
        rowView.height = ROW_HEIGHT;
      }
    }

    this.clampScroll(top, bodyBottom);
    const lastVisible = this.placeRows(innerLeft, innerWidth, top, bodyBottom);

    // Scroll ticks, drawn only when there is something past the edge.
    const rows = this.rows();
    this.scrollUp.visible = this.scrollIndex > 0;
    this.scrollUp.position.set(innerRight + 2, top + 4);
    this.scrollDown.visible = lastVisible < rows.length - 1;
    this.scrollDown.position.set(innerRight + 2, bodyBottom - 4);

    this.hint.text = 'Left/Right change   Enter select   Tab switches tabs   Esc back';
    this.hint.position.set(Math.round(x + width / 2 - uiTextWidth(this.hint.text) / 2), hintTop);
  }

  /** Moves the window as little as it takes for the focused row to be fully drawn. */
  private clampScroll(top: number, bottom: number): void {
    const rows = this.rows();
    if (this.focusIndex < this.scrollIndex) {
      this.scrollIndex = this.focusIndex;
    }
    for (let guard = rows.length; guard > 0; guard--) {
      let y = top;
      let visible = false;
      for (let index = this.scrollIndex; index < rows.length; index++) {
        const candidate = rows[index];
        if (candidate === undefined || isHidden(candidate.row)) {
          continue;
        }
        const rowHeight = candidate.height;
        if (y + rowHeight > bottom) {
          break;
        }
        if (index === this.focusIndex) {
          visible = true;
        }
        y += rowHeight + ROW_GAP;
      }
      if (visible || this.scrollIndex >= this.focusIndex) {
        return;
      }
      this.scrollIndex += 1;
    }
  }

  /** Lays out the visible window and returns the last row index it drew. */
  private placeRows(left: number, width: number, top: number, bottom: number): number {
    const rows = this.rows();
    // Every tab's rows, not just this one's: a row belonging to a tab that is
    // not showing has never been positioned, so leaving it visible draws it at
    // the panel's origin — five tabs' worth of labels stacked in one corner.
    for (const tab of this.tabs) {
      for (const rowView of tab.rows) {
        rowView.container.visible = false;
      }
    }
    this.selection.visible = false;
    this.focusRing.sync(null);

    let y = top;
    let last = this.scrollIndex - 1;
    for (let index = this.scrollIndex; index < rows.length; index++) {
      const rowView = rows[index];
      if (rowView === undefined || isHidden(rowView.row)) {
        last = index;
        continue;
      }
      if (y + rowView.height > bottom) {
        break;
      }
      rowView.container.visible = true;
      rowView.container.position.set(left, y);
      this.layOutRow(rowView, width);
      if (index === this.focusIndex && isFocusable(rowView.row)) {
        this.selection.visible = true;
        this.selection.position.set(left - 2, y - 1);
        this.selection.width = width + 4;
        this.selection.height = rowView.height;
        this.focusRing.sync({ x: left - 2, y: y - 1, width: width + 4, height: rowView.height });
      }
      last = index;
      y += rowView.height + ROW_GAP;
    }
    return last;
  }

  private layOutRow(view: RowView, width: number): void {
    const { row } = view;
    if (row.kind === 'note') {
      view.label.position.set(0, 0);
      return;
    }
    view.label.position.set(0, 2);

    const valueText = this.valueText(row);
    const value = view.value;
    const valueWidth = uiTextWidth(valueText);
    // A choice row keeps a caret's width of air on both sides of its value;
    // everything else runs flush to the right edge.
    const valueRight = row.kind === 'choice' ? width - 7 : width;
    if (value !== null) {
      value.text = valueText;
      value.position.set(valueRight - valueWidth, 2);
    }
    if (row.kind === 'slider' && view.track !== null && view.fill !== null) {
      const trackX = width - VALUE_WIDTH - TRACK_WIDTH - 4;
      const trackY = Math.round((ROW_HEIGHT - TRACK_HEIGHT) / 2);
      view.track.position.set(trackX, trackY);
      const span = Math.max(1e-6, row.max - row.min);
      const filled = Math.round(((row.get() - row.min) / span) * (TRACK_WIDTH - 4));
      view.fill.position.set(trackX + 2, trackY + 2);
      view.fill.width = Math.max(0, filled);
      view.fill.height = TRACK_HEIGHT - 4;
    }
    if (row.kind === 'choice' && view.leftCaret !== null && view.rightCaret !== null) {
      const middle = Math.round(2 + UI_TEXT_HEIGHT / 2);
      view.leftCaret.position.set(valueRight - valueWidth - 4, middle);
      view.rightCaret.position.set(width - 3, middle);
    }
  }

  private valueText(row: SettingsRow): string {
    switch (row.kind) {
      case 'slider':
        return row.format(row.get());
      case 'toggle':
        return row.get() ? 'On' : 'Off';
      case 'choice': {
        const current = row.get();
        return row.options.find((option) => option.id === current)?.label ?? current;
      }
      case 'action':
        return row.value?.() ?? '';
      default:
        return '';
    }
  }
}

/** The height one line of hint text needs — the title screen sizes its pane against this. */
export const SETTINGS_MIN_HEIGHT = PAD * 2 + TAB_STRIP_HEIGHT + UI_LINE_HEIGHT * 6;
