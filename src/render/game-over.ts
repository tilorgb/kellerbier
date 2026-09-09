import { Container, Graphics, type BitmapText } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { EFFECT_PALETTE, HUD_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { Menu, type MenuItem, type MenuScreen } from './ui/menu.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { uiText, uiTextWidth } from './ui/text.js';

/** How much bigger than its authored size the death word is drawn. Whole, like every other scale here. */
const HEADLINE_SCALE = 3;

/** Padding inside the plate the summary sits on. */
const PLATE_PADDING = 8;

const GAP_ABOVE_MENU = 10;

/** What the screen shows. Assembled by whoever tracks the run, not read from `GameSim` directly. */
export interface RunSummaryText {
  /** The headline, drawn from `docs/CONTENT_BIBLE.md` §7's pool — shown exactly as authored. */
  readonly word: string;
  readonly seconds: number;
  readonly kills: number;
  /** "floor 0" today — see `src/debug/panels/run-info.ts`, the same placeholder until #20. */
  readonly floor: string;
}

export interface GameOverScreenActions {
  readonly onRetry: () => void;
  readonly onResults: () => void;
  readonly onHub: () => void;
}

/**
 * The game-over screen: a dim over the game, the death word, a short run
 * summary on a plate, and the way onward.
 *
 * Laid out in UI pixels, like every other HUD piece — `main.ts` scales the
 * whole layer.
 *
 * The death word is drawn in the **display face**, in the same bled treatment
 * the boss plate takes: `docs/CONTENT_BIBLE.md` §7's pool is Boarisch for
 * "fell over", it is the last thing a run says, and nothing is shooting while
 * it is on screen — which is the whole test for whether a broken script
 * belongs somewhere (`docs/DECISIONS.md` #44). The two lines under it stay in
 * the text face, because they are numbers a player actually reads.
 *
 * `Menu` (#158) replaced the two-key hint line this used to have: "R: Try
 * Again  T: Results" worked only for a keyboard. `R`/`T` still do the same
 * thing globally (muscle memory, and a bug report referencing them), but the
 * screen itself is now reachable and leavable with a gamepad or a mouse too.
 */
export class GameOverScreen implements MenuScreen {
  readonly view = new Container();

  private readonly actions: GameOverScreenActions;
  private readonly dim: Graphics;
  private readonly plate: Container;
  private readonly headline: DisplayTitle;
  private readonly summary: BitmapText;
  private readonly menu: Menu;
  private readonly kit: UiKit;
  private locale: Locale;
  private lastInfo: RunSummaryText | null = null;
  private width = 0;
  private height = 0;

  constructor(kit: UiKit, actions: GameOverScreenActions, locale: Locale) {
    this.kit = kit;
    this.actions = actions;
    this.locale = locale;
    this.view.visible = false;

    this.dim = new Graphics();
    this.view.addChild(this.dim);

    this.plate = new Container();
    this.view.addChild(this.plate);

    this.headline = new DisplayTitle(TITLE_STYLES.threat);
    this.headline.view.scale.set(HEADLINE_SCALE);
    this.view.addChild(this.headline.view);

    this.summary = uiText('', { colour: HUD_PALETTE.gameOverSummary });
    this.view.addChild(this.summary);

    this.menu = new Menu(kit, this.menuItems());
    this.view.addChild(this.menu.view);
  }

  private menuItems(): MenuItem[] {
    const locale = this.locale;
    const actions = this.actions;
    return [
      { label: t(locale, 'ui.gameOver.retry'), onSelect: actions.onRetry },
      { label: t(locale, 'ui.gameOver.results'), onSelect: actions.onResults },
      { label: t(locale, 'ui.gameOver.hub'), onSelect: actions.onHub },
    ];
  }

  /** Rebuilds the summary and menu labels in `locale` — call whenever the player changes the language. */
  setLocale(locale: Locale): void {
    this.locale = locale;
    this.menu.setItems(this.menuItems());
    if (this.lastInfo !== null) {
      this.applySummary(this.lastInfo);
    }
    if (this.view.visible) {
      this.layOut();
    }
  }

  get visible(): boolean {
    return this.view.visible;
  }

  private applySummary(info: RunSummaryText): void {
    this.summary.text = t(this.locale, 'ui.gameOver.summary', {
      seconds: info.seconds.toFixed(1),
      kills: info.kills,
      floor: info.floor,
    });
  }

  show(info: RunSummaryText): void {
    this.lastInfo = info;
    this.headline.set(info.word);
    this.applySummary(info);
    this.view.visible = true;
    this.menu.refresh();
    this.layOut();
  }

  hide(): void {
    this.view.visible = false;
  }

  moveFocus(delta: 1 | -1): void {
    this.menu.moveFocus(delta);
  }

  activate(): void {
    this.menu.activate();
  }

  /** Call on every resize, same as the HUD's own layout pass. Dimensions in UI pixels. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.view.visible) {
      this.layOut();
    }
  }

  private layOut(): void {
    const { width, height } = this;

    this.dim.clear();
    this.dim.rect(0, 0, width, height).fill({ color: EFFECT_PALETTE.gameOverDim, alpha: 0.78 });

    const centreX = width / 2;
    const centreY = height / 2;

    this.headline.place(centreX, Math.round(centreY - this.headline.height * HEADLINE_SCALE - 6));

    const summaryWidth = uiTextWidth(this.summary.text);
    const plateWidth = Math.max(summaryWidth, this.menu.width) + PLATE_PADDING * 2;
    const plateHeight = PLATE_PADDING * 3 + this.summary.height + GAP_ABOVE_MENU + this.menu.height;
    const plateX = Math.round(centreX - plateWidth / 2);
    const plateY = Math.round(centreY + 4);

    this.plate.removeChildren();
    const panel = this.kit.panelSprite(plateWidth, plateHeight);
    this.plate.addChild(panel);
    this.plate.position.set(plateX, plateY);

    this.summary.position.set(Math.round(centreX - summaryWidth / 2), plateY + PLATE_PADDING);
    this.menu.view.position.set(
      Math.round(centreX - this.menu.width / 2),
      plateY + PLATE_PADDING * 2 + this.summary.height + GAP_ABOVE_MENU,
    );
  }
}
