import { Container, Graphics, type BitmapText } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { EFFECT_PALETTE, UI_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { Menu, type MenuScreen } from './ui/menu.js';
import { PostcardPanel } from './postcard-panel.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { uiText, uiTextWidth } from './ui/text.js';

const GAP_BELOW_HEADLINE = 10;
const GAP_BELOW_BODY = 12;
const PANEL_PADDING = 16;
const MENU_MIN_WIDTH = 180;

export interface ConfirmScreenActions {
  readonly onConfirm: () => void;
  readonly onBack: () => void;
}

/**
 * "Start a new run? Your current run will be lost." (#521) — asked when the
 * title would start a run while there is one to continue, so a run is never
 * thrown away by two presses of Enter. Opens focused on Back: the safe
 * answer is the default one.
 */
export class ConfirmScreen implements MenuScreen {
  readonly view = new Container();

  private readonly actions: ConfirmScreenActions;
  private readonly dim = new Graphics();
  private readonly panel = new PostcardPanel();
  private readonly headline: DisplayTitle;
  private readonly body: BitmapText;
  private readonly menu: Menu;
  private locale: Locale;
  private width = 0;
  private height = 0;

  constructor(kit: UiKit, actions: ConfirmScreenActions, locale: Locale) {
    this.actions = actions;
    this.locale = locale;
    this.view.visible = false;
    this.view.addChild(this.dim);
    this.view.addChild(this.panel.view);
    this.headline = new DisplayTitle(TITLE_STYLES.heading);
    this.view.addChild(this.headline.view);
    this.body = uiText('', { colour: UI_PALETTE.textDim });
    this.view.addChild(this.body);
    this.menu = new Menu(kit, [], { minWidth: MENU_MIN_WIDTH });
    this.view.addChild(this.menu.view);
    this.rebuild();
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
    this.rebuild();
  }

  get visible(): boolean {
    return this.view.visible;
  }

  show(): void {
    this.view.visible = true;
    this.rebuild();
    this.menu.focusRow(1);
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
    this.layOut();
  }

  private rebuild(): void {
    this.headline.set(t(this.locale, 'ui.confirm.newRun.headline'));
    this.body.text = t(this.locale, 'ui.confirm.newRun.body');
    this.menu.setItems([
      {
        label: t(this.locale, 'ui.confirm.newRun.confirm'),
        onSelect: () => {
          this.actions.onConfirm();
        },
      },
      {
        label: t(this.locale, 'ui.confirm.newRun.back'),
        onSelect: () => {
          this.actions.onBack();
        },
      },
    ]);
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
    const bodyWidth = uiTextWidth(this.body.text);
    const contentWidth = Math.max(this.headline.width, bodyWidth, this.menu.width);
    const contentHeight =
      this.headline.height +
      GAP_BELOW_HEADLINE +
      this.body.height +
      GAP_BELOW_BODY +
      this.menu.height;
    const panelWidth = contentWidth + PANEL_PADDING * 2;
    const panelHeight = contentHeight + PANEL_PADDING * 2;
    const panelX = Math.round(centreX - panelWidth / 2);
    const panelY = Math.round(height / 2 - panelHeight / 2);
    this.panel.view.position.set(panelX, panelY);
    this.panel.resize(panelWidth, panelHeight);
    let top = panelY + PANEL_PADDING;
    this.headline.place(centreX, top);
    top += this.headline.height + GAP_BELOW_HEADLINE;
    this.body.position.set(Math.round(centreX - bodyWidth / 2), top);
    top += this.body.height + GAP_BELOW_BODY;
    this.menu.view.position.set(Math.round(centreX - this.menu.width / 2), top);
  }
}
