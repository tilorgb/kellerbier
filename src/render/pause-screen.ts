import { Container, Graphics } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { EFFECT_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { Menu, type MenuItem, type MenuScreen } from './ui/menu.js';
import { PostcardPanel } from './postcard-panel.js';
import { PromillePanel, type PromillePanelData } from './promille-panel.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';

const GAP_BELOW_HEADLINE = 14;
const PANEL_PADDING = 16;
/** Air between the menu card and the Promille card, and between either and the frame edge. */
const CARD_GAP = 8;
/** The Promille card's widest; wider just makes tier lines read as a single long row. */
const PROMILLE_MAX_WIDTH = 330;
/** Narrower than this and the tier lines wrap into a column nobody reads. */
const PROMILLE_MIN_WIDTH = 200;

export interface PauseScreenActions {
  readonly onResume: () => void;
  readonly onSettings: () => void;
  readonly onCollection: () => void;
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
  private readonly promille = new PromillePanel();
  /** The Promille panel's source, or `null` while the meter is locked — then there is no panel to draw (#460). */
  private promilleData: PromillePanelData | null = null;
  private locale: Locale;
  private width = 0;
  private height = 0;

  constructor(kit: UiKit, actions: PauseScreenActions, locale: Locale) {
    this.actions = actions;
    this.locale = locale;
    this.view.visible = false;

    this.dim = new Graphics();
    this.view.addChild(this.dim);
    this.view.addChild(this.panel.view);

    this.headline = new DisplayTitle(TITLE_STYLES.heading);
    this.headline.set(t(locale, 'ui.pause.headline'));
    this.view.addChild(this.headline.view);

    this.menu = new Menu(kit, this.menuItems(locale));
    this.view.addChild(this.menu.view);
    this.view.addChild(this.promille.view);
  }

  /**
   * Gives the pause menu its Promille panel (#460), or takes it away with
   * `null` — a sober run, or one whose meter is not unlocked yet, has
   * nothing to list. Cheap to call every frame: it only lays out again when
   * the panel's words or the screen change.
   */
  setPromille(data: PromillePanelData | null): void {
    const previous = this.promilleData;
    this.promilleData = data;
    const unchanged =
      previous === data ||
      (previous !== null &&
        data !== null &&
        previous.tier === data.tier &&
        previous.trinkfest === data.trinkfest &&
        previous.neutralReskin === data.neutralReskin);
    if (!unchanged && this.view.visible) {
      this.layOut();
    }
  }

  private menuItems(locale: Locale): MenuItem[] {
    const actions = this.actions;
    return [
      { label: t(locale, 'ui.pause.resume'), onSelect: actions.onResume },
      { label: t(locale, 'ui.pause.settings'), onSelect: actions.onSettings },
      { label: t(locale, 'ui.pause.collection'), onSelect: actions.onCollection },
      { label: t(locale, 'ui.pause.quitToTitle'), onSelect: actions.onQuitToTitle },
    ];
  }

  /** Rebuilds the headline and menu labels in `locale` — call whenever the player changes the language. */
  setLocale(locale: Locale): void {
    this.locale = locale;
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

    const centreY = Math.round(height / 2);
    const contentHeight = this.headline.height + GAP_BELOW_HEADLINE + this.menu.height;
    const panelWidth = Math.max(this.headline.width, this.menu.width) + PANEL_PADDING * 2;
    const panelHeight = contentHeight + PANEL_PADDING * 2;

    // Where the Promille card goes (#460): beside the menu card when the
    // frame is wide enough for a readable column, under it when it is only
    // tall enough, and nowhere when neither fits — the pause menu itself must
    // never be what gets squeezed out.
    let centreX = Math.round(width / 2);
    let menuTop = centreY - Math.round(panelHeight / 2);
    this.promille.view.visible = false;
    const data = this.promilleData;
    if (data !== null) {
      const beside = Math.min(PROMILLE_MAX_WIDTH, width - panelWidth - CARD_GAP * 3);
      if (beside >= PROMILLE_MIN_WIDTH) {
        const cardHeight = this.promille.layOut(beside, data, this.locale);
        const total = panelWidth + CARD_GAP + beside;
        const left = Math.round((width - total) / 2);
        centreX = left + Math.round(panelWidth / 2);
        this.promille.place(left + panelWidth + CARD_GAP, Math.round(centreY - cardHeight / 2));
        this.promille.view.visible = true;
      } else {
        const below = Math.min(PROMILLE_MAX_WIDTH, width - CARD_GAP * 2);
        if (below >= PROMILLE_MIN_WIDTH) {
          const cardHeight = this.promille.layOut(below, data, this.locale);
          const total = panelHeight + CARD_GAP + cardHeight;
          if (total <= height - CARD_GAP * 2) {
            menuTop = Math.round((height - total) / 2);
            this.promille.place(Math.round((width - below) / 2), menuTop + panelHeight + CARD_GAP);
            this.promille.view.visible = true;
          }
        }
      }
    }

    const panelX = Math.round(centreX - panelWidth / 2);
    const panelY = menuTop;
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
