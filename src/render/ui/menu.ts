import { Container, type BitmapText, type NineSliceSprite } from 'pixi.js';
import { UI_PALETTE } from '../palette.js';
import { FocusRing, type UiKit } from './kit.js';
import { UI_TEXT_HEIGHT, uiText, uiTextWidth } from './text.js';

/** One row of a `Menu`. */
export interface MenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  /**
   * Re-checked on every `refresh()` — a "Continue" button with no save to
   * resume, say. Absent means always enabled.
   */
  readonly disabled?: () => boolean;
}

/**
 * The shape every `Menu`-backed screen exposes to its caller — `app/main.ts`
 * drives one of these from whichever screen `ScreenFlow` says is current,
 * without needing to know which concrete screen class it is.
 */
export interface MenuScreen {
  readonly visible: boolean;
  moveFocus(delta: 1 | -1): void;
  activate(): void;
}

const BUTTON_HEIGHT = UI_TEXT_HEIGHT + 6;
const BUTTON_GAP = 4;
const LABEL_PAD_X = 10;
const LABEL_PAD_Y = 3;
const MIN_WIDTH = 90;

interface MenuRow {
  readonly item: MenuItem;
  readonly container: Container;
  readonly background: NineSliceSprite;
  readonly label: BitmapText;
  disabled: boolean;
}

/**
 * A vertical list of buttons — the one interactive-menu primitive every M8
 * screen (title, pause, credits, the death/victory buttons, the results
 * screen) is built out of, on top of the frames `UiKit` already draws and
 * the `FocusRing` #154 built but left without a consumer.
 *
 * `render/` stays input-agnostic, the way `GameOverScreen`/`RunResultsScreen`
 * already are: this never reads a key or a gamepad itself. A caller drives
 * `moveFocus`/`activate` from whichever device it likes — `app/main.ts`
 * polls gamepad and keyboard once per rendered frame — and Pixi's own
 * pointer events cover the mouse without any extra wiring.
 */
export class Menu {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly focusRing: FocusRing;
  private readonly rows: MenuRow[] = [];
  private focusIndex = 0;
  private menuWidth = MIN_WIDTH;

  constructor(kit: UiKit, items: readonly MenuItem[]) {
    this.kit = kit;
    this.focusRing = new FocusRing(kit);
    this.setItems(items);
  }

  /** Rebuilds the whole row list — a screen with menus that change shape (none do yet) would call this. */
  setItems(items: readonly MenuItem[]): void {
    this.view.removeChildren();
    this.rows.length = 0;
    this.menuWidth = Math.max(
      MIN_WIDTH,
      ...items.map((item) => uiTextWidth(item.label) + LABEL_PAD_X * 2),
    );
    items.forEach((item, index) => {
      const container = new Container();
      container.position.set(0, index * (BUTTON_HEIGHT + BUTTON_GAP));
      const background = this.kit.buttonSprite('normal', this.menuWidth, BUTTON_HEIGHT);
      container.addChild(background);
      const label = uiText(item.label, { colour: UI_PALETTE.text });
      label.position.set(LABEL_PAD_X, LABEL_PAD_Y);
      container.addChild(label);
      container.eventMode = 'static';
      container.cursor = 'pointer';
      container.on('pointerover', () => {
        this.setFocus(index);
      });
      container.on('pointertap', () => {
        this.setFocus(index);
        this.activate();
      });
      this.view.addChild(container);
      this.rows.push({ item, container, background, label, disabled: item.disabled?.() ?? false });
    });
    this.view.addChild(this.focusRing.view);
    this.focusIndex = this.firstEnabledIndex();
    this.refresh();
  }

  /** Total footprint in UI pixels, for a caller centring the whole menu. */
  get width(): number {
    return this.menuWidth;
  }

  get height(): number {
    return this.rows.length === 0
      ? 0
      : this.rows.length * (BUTTON_HEIGHT + BUTTON_GAP) - BUTTON_GAP;
  }

  /**
   * Re-checks every item's `disabled`, redraws button/label state and moves
   * focus off a row that just became disabled. Call whenever a screen opens
   * or whenever something that feeds a `disabled` predicate might have
   * changed (a save just written, say).
   */
  refresh(): void {
    for (const row of this.rows) {
      row.disabled = row.item.disabled?.() ?? false;
      row.container.eventMode = row.disabled ? 'none' : 'static';
      row.label.tint = row.disabled ? UI_PALETTE.textDisabled : UI_PALETTE.text;
    }
    if (this.rows[this.focusIndex]?.disabled === true) {
      this.focusIndex = this.firstEnabledIndex();
    }
    this.syncVisualState();
  }

  /** Moves focus to the next enabled row in `delta`'s direction, wrapping. A no-op with nothing enabled. */
  moveFocus(delta: 1 | -1): void {
    if (this.rows.length === 0 || this.rows.every((row) => row.disabled)) {
      return;
    }
    let index = this.focusIndex;
    let remaining = this.rows.length;
    while (remaining > 0) {
      index = (index + delta + this.rows.length) % this.rows.length;
      if (this.rows[index]?.disabled === false) {
        this.focusIndex = index;
        break;
      }
      remaining -= 1;
    }
    this.syncVisualState();
  }

  /** Activates whichever row is focused. A no-op if it is disabled or there is nothing to focus. */
  activate(): void {
    const row = this.rows[this.focusIndex];
    if (row === undefined || row.disabled) {
      return;
    }
    row.item.onSelect();
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private setFocus(index: number): void {
    if (this.rows[index]?.disabled === true) {
      return;
    }
    this.focusIndex = index;
    this.syncVisualState();
  }

  private firstEnabledIndex(): number {
    const index = this.rows.findIndex((row) => !row.disabled);
    return index === -1 ? 0 : index;
  }

  private syncVisualState(): void {
    this.rows.forEach((row, index) => {
      row.background.texture =
        this.kit.button[
          row.disabled ? 'disabled' : index === this.focusIndex ? 'selected' : 'normal'
        ];
    });
    const focused = this.rows[this.focusIndex];
    if (focused === undefined || focused.disabled) {
      this.focusRing.sync(null);
      return;
    }
    this.focusRing.sync({
      x: focused.container.position.x,
      y: focused.container.position.y,
      width: this.menuWidth,
      height: BUTTON_HEIGHT,
    });
  }
}
