import { Container, type BitmapText, type NineSliceSprite } from '../gfx/index.js';
import { UI_PALETTE } from '../palette.js';
import { FocusRing, type UiKit } from './kit.js';
import {
  DISPLAY_TEXT_HEIGHT,
  UI_TEXT_HEIGHT,
  displayText,
  displayTextWidth,
  uiText,
  uiTextWidth,
} from './text.js';

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

/**
 * Which face a menu's labels are set in, and everything that follows from it.
 *
 * `docs/DECISIONS.md` #44 keeps the display face off anything read under fire
 * and names the main menu's own buttons as the one list that is not: nothing
 * is shooting at a player reading the title screen, and the game's front door
 * is exactly where its voice should be loudest. Every other menu — the pause
 * list over a live run, the credits' Back, a death screen's Retry — stays in
 * the text face.
 */
export type MenuFace = 'text' | 'display';

interface FaceMetrics {
  readonly buttonHeight: number;
  readonly buttonGap: number;
  readonly padX: number;
  readonly padY: number;
  readonly minWidth: number;
  readonly measure: (text: string) => number;
  readonly make: (text: string) => BitmapText;
}

const FACES: Readonly<Record<MenuFace, FaceMetrics>> = {
  text: {
    buttonHeight: UI_TEXT_HEIGHT + 6,
    buttonGap: 4,
    padX: 10,
    padY: 3,
    minWidth: 90,
    measure: uiTextWidth,
    make: (text) => uiText(text, { colour: UI_PALETTE.text }),
  },
  // The display cell is 16 rows to the text face's 10, so its rows need more
  // air around them or the Fraktur's descenders sit on the bevel.
  display: {
    buttonHeight: DISPLAY_TEXT_HEIGHT + 6,
    buttonGap: 5,
    padX: 12,
    padY: 3,
    minWidth: 120,
    measure: displayTextWidth,
    make: (text) => displayText(text, { colour: UI_PALETTE.text }),
  },
};

export interface MenuOptions {
  /** Defaults to `'text'` — see `MenuFace`. */
  readonly face?: MenuFace;
  /** Widens every row to at least this many UI pixels; the widest label still wins. */
  readonly minWidth?: number;
}

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
 * polls gamepad and keyboard once per rendered frame — and the UI layer's
 * own pointer events (`render/gfx/layer.ts`) cover the mouse without any
 * extra wiring.
 */
export class Menu {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly focusRing: FocusRing;
  private readonly metrics: FaceMetrics;
  private readonly minWidth: number;
  private readonly rows: MenuRow[] = [];
  private focusIndex = 0;
  private menuWidth: number;

  constructor(kit: UiKit, items: readonly MenuItem[], options: MenuOptions = {}) {
    this.kit = kit;
    this.focusRing = new FocusRing(kit);
    this.metrics = FACES[options.face ?? 'text'];
    this.minWidth = Math.max(this.metrics.minWidth, options.minWidth ?? 0);
    this.menuWidth = this.minWidth;
    this.setItems(items);
  }

  /** Rebuilds the whole row list — a screen with menus that change shape (none do yet) would call this. */
  setItems(items: readonly MenuItem[]): void {
    this.view.removeChildren();
    this.rows.length = 0;
    const { buttonHeight, buttonGap, padX, padY, measure, make } = this.metrics;
    this.menuWidth = Math.max(
      this.minWidth,
      ...items.map((item) => measure(item.label) + padX * 2),
    );
    items.forEach((item, index) => {
      const container = new Container();
      container.position.set(0, index * (buttonHeight + buttonGap));
      const background = this.kit.buttonSprite('normal', this.menuWidth, buttonHeight);
      container.addChild(background);
      const label = make(item.label);
      label.position.set(padX, padY);
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
      : this.rows.length * (this.metrics.buttonHeight + this.metrics.buttonGap) -
          this.metrics.buttonGap;
  }

  /** The height of one row, for a caller lining something else up with it. */
  get rowHeight(): number {
    return this.metrics.buttonHeight;
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
      height: this.metrics.buttonHeight,
    });
  }
}
