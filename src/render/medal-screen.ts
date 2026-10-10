import { Container, Graphics, type BitmapText } from './gfx/index.js';
import type { MedalShelfView } from '../app/meta/progress.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { EFFECT_PALETTE, UI_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { Menu, type MenuScreen } from './ui/menu.js';
import { PostcardPanel } from './postcard-panel.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { UI_LINE_HEIGHT, uiText, uiTextWidth } from './ui/text.js';

const GAP_BELOW_HEADLINE = 6;
const GAP_BELOW_COUNT = 10;
const GAP_ABOVE_MENU = 14;
const PANEL_PADDING = 16;
const LIST_MIN_WIDTH = 240;

export interface MedalScreenActions {
  /** The shelf as the save has it right now — re-read every time the screen opens. */
  readonly view: () => MedalShelfView;
  readonly onBack: () => void;
}

/**
 * The medal shelf (#506), from the title menu: every medal as a line of
 * text, earned ones first in the accent colour, the rest dimmed, a hidden
 * one as "???" until it is earned.
 *
 * Text only on purpose — medal art is its own ticket and goes through the
 * pixel-art sign-off (`CLAUDE.md`); the shelf it will hang on is this one.
 * The only control is Back, so keyboard, gamepad and touch all reach it
 * through the same `Menu` every other screen uses.
 */
export class MedalScreen implements MenuScreen {
  readonly view = new Container();

  private readonly actions: MedalScreenActions;
  private readonly dim: Graphics;
  private readonly panel = new PostcardPanel();
  private readonly headline: DisplayTitle;
  private readonly list = new Container();
  private readonly count: BitmapText;
  private readonly menu: Menu;
  private locale: Locale;
  private width = 0;
  private height = 0;

  constructor(kit: UiKit, actions: MedalScreenActions, locale: Locale) {
    this.actions = actions;
    this.locale = locale;
    this.view.visible = false;
    this.dim = new Graphics();
    this.view.addChild(this.dim);
    this.view.addChild(this.panel.view);
    this.headline = new DisplayTitle(TITLE_STYLES.heading);
    this.headline.set(t(locale, 'ui.medals.headline'));
    this.view.addChild(this.headline.view);
    this.count = uiText('', { colour: UI_PALETTE.textDim });
    this.view.addChild(this.count);
    this.view.addChild(this.list);
    this.menu = new Menu(kit, this.menuItems());
    this.view.addChild(this.menu.view);
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
    this.headline.set(t(locale, 'ui.medals.headline'));
    this.menu.setItems(this.menuItems());
    if (this.view.visible) {
      this.rebuild();
    }
  }

  get visible(): boolean {
    return this.view.visible;
  }

  show(): void {
    this.view.visible = true;
    this.menu.refresh();
    this.rebuild();
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

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.view.visible) {
      this.layOut();
    }
  }

  private menuItems(): { label: string; onSelect: () => void }[] {
    return [
      {
        label: t(this.locale, 'ui.credits.back'),
        onSelect: () => {
          this.actions.onBack();
        },
      },
    ];
  }

  private rebuild(): void {
    const shelf = this.actions.view();
    this.count.text = t(this.locale, 'ui.medals.count', {
      earned: shelf.earned,
      total: shelf.total,
    });
    this.list.removeChildren();
    shelf.medals.forEach((medal, index) => {
      const label = uiText(medal.text, {
        colour: medal.earned ? UI_PALETTE.accent : UI_PALETTE.textDisabled,
      });
      label.position.set(0, index * UI_LINE_HEIGHT);
      this.list.addChild(label);
    });
    this.layOut();
  }

  private layOut(): void {
    const { width, height } = this;
    if (width <= 0 || height <= 0) {
      return;
    }
    this.dim.clear();
    this.dim.rect(0, 0, width, height).fill({ color: EFFECT_PALETTE.gameOverDim, alpha: 0.96 });

    const centreX = Math.round(width / 2);
    const listWidth = Math.max(
      LIST_MIN_WIDTH,
      ...this.list.children.map((child) => uiTextWidth((child as BitmapText).text)),
    );
    const listHeight = this.list.children.length * UI_LINE_HEIGHT;
    const contentHeight =
      this.headline.height +
      GAP_BELOW_HEADLINE +
      UI_LINE_HEIGHT +
      GAP_BELOW_COUNT +
      listHeight +
      GAP_ABOVE_MENU +
      this.menu.height;
    const contentWidth = Math.max(this.headline.width, listWidth, this.menu.width);
    const panelWidth = contentWidth + PANEL_PADDING * 2;
    const panelHeight = contentHeight + PANEL_PADDING * 2;
    const panelX = Math.round(centreX - panelWidth / 2);
    const panelY = Math.round(height / 2 - panelHeight / 2);
    this.panel.view.position.set(panelX, panelY);
    this.panel.resize(panelWidth, panelHeight);

    let top = panelY + PANEL_PADDING;
    this.headline.place(centreX, top);
    top += this.headline.height + GAP_BELOW_HEADLINE;
    this.count.position.set(Math.round(centreX - uiTextWidth(this.count.text) / 2), top);
    top += UI_LINE_HEIGHT + GAP_BELOW_COUNT;
    this.list.position.set(Math.round(centreX - listWidth / 2), top);
    top += listHeight + GAP_ABOVE_MENU;
    this.menu.view.position.set(Math.round(centreX - this.menu.width / 2), top);
  }
}
