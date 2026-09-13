import { Container, Graphics } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { EFFECT_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { Menu, type MenuItem, type MenuScreen } from './ui/menu.js';
import { PostcardPanel } from './postcard-panel.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';

const GAP_BELOW_HEADLINE = 14;
const PANEL_PADDING = 16;

export interface PauseScreenActions {
  readonly onResume: () => void;
  readonly onSettings: () => void;
  readonly onQuitToTitle: () => void;
}

/**
 * The pause screen (#158): what actually covers the game while
 * `FixedTimestepLoop.paused` (`app/loop.ts`) has genuinely stopped the
 * accumulator, rather than the freeze silently having no UI at all.
 *
 * Same shape as `GameOverScreen`/`TitleScreen` — a dim, a headline, a
 * `Menu` — over whatever room the run was paused in.
 */
export class PauseScreen implements MenuScreen {
  readonly view = new Container();

  private readonly actions: PauseScreenActions;
  private readonly dim: Graphics;
  private readonly panel = new PostcardPanel();
  private readonly headline: DisplayTitle;
  private readonly menu: Menu;
  private width = 0;
  private height = 0;

  constructor(kit: UiKit, actions: PauseScreenActions, locale: Locale) {
    this.actions = actions;
    this.view.visible = false;

    this.dim = new Graphics();
    this.view.addChild(this.dim);
    this.view.addChild(this.panel.view);

    this.headline = new DisplayTitle(TITLE_STYLES.heading);
    this.headline.set(t(locale, 'ui.pause.headline'));
    this.view.addChild(this.headline.view);

    this.menu = new Menu(kit, this.menuItems(locale));
    this.view.addChild(this.menu.view);
  }

  private menuItems(locale: Locale): MenuItem[] {
    const actions = this.actions;
    return [
      { label: t(locale, 'ui.pause.resume'), onSelect: actions.onResume },
      { label: t(locale, 'ui.pause.settings'), onSelect: actions.onSettings },
      { label: t(locale, 'ui.pause.quitToTitle'), onSelect: actions.onQuitToTitle },
    ];
  }

  /** Rebuilds the headline and menu labels in `locale` — call whenever the player changes the language. */
  setLocale(locale: Locale): void {
    this.headline.set(t(locale, 'ui.pause.headline'));
    this.menu.setItems(this.menuItems(locale));
    if (this.view.visible) {
      this.layOut();
    }
  }

  get visible(): boolean {
    return this.view.visible;
  }

  show(): void {
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

    const centreX = Math.round(width / 2);
    const centreY = Math.round(height / 2);
    const contentHeight = this.headline.height + GAP_BELOW_HEADLINE + this.menu.height;
    const panelWidth = Math.max(this.headline.width, this.menu.width) + PANEL_PADDING * 2;
    const panelHeight = contentHeight + PANEL_PADDING * 2;
    const panelX = Math.round(centreX - panelWidth / 2);
    const panelY = Math.round(centreY - panelHeight / 2);
    this.panel.view.position.set(panelX, panelY);
    this.panel.resize(panelWidth, panelHeight);

    const top = panelY + PANEL_PADDING;
    this.headline.place(centreX, top);
    this.menu.view.position.set(
      Math.round(centreX - this.menu.width / 2),
      top + this.headline.height + GAP_BELOW_HEADLINE,
    );
  }
}
