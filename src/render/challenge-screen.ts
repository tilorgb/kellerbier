import { Container, Graphics, type BitmapText } from './gfx/index.js';
import type { ChallengeView } from '../app/meta/progress.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { EFFECT_PALETTE, UI_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { Menu, type MenuItem, type MenuScreen } from './ui/menu.js';
import { PostcardPanel } from './postcard-panel.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { UI_LINE_HEIGHT, uiText, uiTextWidth } from './ui/text.js';

const GAP_BELOW_HEADLINE = 12;
const GAP_ABOVE_RULES = 12;
const PANEL_PADDING = 16;
const MENU_MIN_WIDTH = 180;
const RULES_MIN_WIDTH = 240;

export interface ChallengeScreenActions {
  /** The challenges as the save has them right now — re-read every time the screen opens. */
  readonly list: () => readonly ChallengeView[];
  readonly onStart: (id: string) => void;
  readonly onBack: () => void;
}

/**
 * The challenge runs (#507), from the title menu once the game has been
 * won: one row per challenge, then Back. A row starts its run; one already
 * won says so. Under the menu, every challenge's rule in a line — the rows
 * are names, and the names alone (#50's) do not say what they ask.
 */
export class ChallengeScreen implements MenuScreen {
  readonly view = new Container();

  private readonly actions: ChallengeScreenActions;
  private readonly dim: Graphics;
  private readonly panel = new PostcardPanel();
  private readonly headline: DisplayTitle;
  private readonly rules = new Container();
  private readonly menu: Menu;
  private locale: Locale;
  private width = 0;
  private height = 0;

  constructor(kit: UiKit, actions: ChallengeScreenActions, locale: Locale) {
    this.actions = actions;
    this.locale = locale;
    this.view.visible = false;
    this.dim = new Graphics();
    this.view.addChild(this.dim);
    this.view.addChild(this.panel.view);
    this.headline = new DisplayTitle(TITLE_STYLES.heading);
    this.headline.set(t(locale, 'ui.challenges.headline'));
    this.view.addChild(this.headline.view);
    this.menu = new Menu(kit, [], { minWidth: MENU_MIN_WIDTH });
    this.view.addChild(this.menu.view);
    this.view.addChild(this.rules);
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
    this.headline.set(t(locale, 'ui.challenges.headline'));
    if (this.view.visible) {
      this.rebuild();
    }
  }

  get visible(): boolean {
    return this.view.visible;
  }

  show(): void {
    this.view.visible = true;
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

  private rebuild(): void {
    const list = this.actions.list();
    const items: MenuItem[] = list.map((challenge) => ({
      label: challenge.completed
        ? t(this.locale, 'ui.challenges.won', { name: challenge.name })
        : challenge.name,
      onSelect: () => {
        this.actions.onStart(challenge.id);
      },
    }));
    items.push({
      label: t(this.locale, 'ui.credits.back'),
      onSelect: () => {
        this.actions.onBack();
      },
    });
    this.menu.setItems(items);
    this.rules.removeChildren();
    list.forEach((challenge, index) => {
      const line: BitmapText = uiText(`${challenge.name}: ${challenge.description}`, {
        colour: challenge.completed ? UI_PALETTE.accent : UI_PALETTE.textDim,
      });
      line.position.set(0, index * UI_LINE_HEIGHT);
      this.rules.addChild(line);
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
    const rulesWidth = Math.max(
      RULES_MIN_WIDTH,
      ...this.rules.children.map((child) => uiTextWidth((child as BitmapText).text)),
    );
    const rulesHeight = this.rules.children.length * UI_LINE_HEIGHT;
    const contentHeight =
      this.headline.height + GAP_BELOW_HEADLINE + this.menu.height + GAP_ABOVE_RULES + rulesHeight;
    const contentWidth = Math.max(this.headline.width, this.menu.width, rulesWidth);
    const panelWidth = contentWidth + PANEL_PADDING * 2;
    const panelHeight = contentHeight + PANEL_PADDING * 2;
    const panelX = Math.round(centreX - panelWidth / 2);
    const panelY = Math.round(height / 2 - panelHeight / 2);
    this.panel.view.position.set(panelX, panelY);
    this.panel.resize(panelWidth, panelHeight);

    let top = panelY + PANEL_PADDING;
    this.headline.place(centreX, top);
    top += this.headline.height + GAP_BELOW_HEADLINE;
    this.menu.view.position.set(Math.round(centreX - this.menu.width / 2), top);
    top += this.menu.height + GAP_ABOVE_RULES;
    this.rules.position.set(Math.round(centreX - rulesWidth / 2), top);
  }
}
