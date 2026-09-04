import { Container, Graphics, type BitmapText, type Renderer } from 'pixi.js';
import { EFFECT_PALETTE, UI_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { Menu, type MenuItem, type MenuScreen } from './ui/menu.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { UI_LINE_HEIGHT, uiText, uiTextWidth } from './ui/text.js';

const GAP_BELOW_HEADLINE = 14;
const GAP_ABOVE_MENU = 20;

/**
 * Who and what made the game — plain, factual lines rather than authored
 * flavour text, since there is no in-fiction voice for "who built this" the
 * way there is for a boss plate or a death word.
 */
const CREDIT_LINES: readonly string[] = [
  'A game by tilorgb',
  'Built with Claude Code',
  'Engine: PixiJS',
];

export interface CreditsScreenActions {
  readonly onBack: () => void;
}

/**
 * The credits screen (#158): the last title-flow screen with nothing to
 * play, just to read. Same dim-and-headline shape as the rest of the flow,
 * with a single "Back" row standing in for a hint line so it stays reachable
 * by gamepad and keyboard as well as a mouse click.
 */
export class CreditsScreen implements MenuScreen {
  readonly view = new Container();

  private readonly dim: Graphics;
  private readonly headline: DisplayTitle;
  private readonly creditLabels: BitmapText[] = [];
  private readonly menu: Menu;
  private width = 0;
  private height = 0;

  constructor(kit: UiKit, renderer: Renderer, actions: CreditsScreenActions) {
    this.view.visible = false;

    this.dim = new Graphics();
    this.view.addChild(this.dim);

    this.headline = new DisplayTitle(renderer, TITLE_STYLES.heading);
    this.headline.set('Credits');
    this.view.addChild(this.headline.view);

    for (const line of CREDIT_LINES) {
      const label = uiText(line, { colour: UI_PALETTE.textDim });
      this.creditLabels.push(label);
      this.view.addChild(label);
    }

    const items: MenuItem[] = [{ label: 'Back', onSelect: actions.onBack }];
    this.menu = new Menu(kit, items);
    this.view.addChild(this.menu.view);
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
    this.dim.rect(0, 0, width, height).fill({ color: EFFECT_PALETTE.gameOverDim, alpha: 0.96 });

    const centreX = Math.round(width / 2);
    const linesHeight = this.creditLabels.length * UI_LINE_HEIGHT;
    const totalHeight =
      this.headline.height + GAP_BELOW_HEADLINE + linesHeight + GAP_ABOVE_MENU + this.menu.height;
    let top = Math.round(height / 2 - totalHeight / 2);

    this.headline.place(centreX, top);
    top += this.headline.height + GAP_BELOW_HEADLINE;

    for (const label of this.creditLabels) {
      const lineWidth = uiTextWidth(label.text);
      label.position.set(Math.round(centreX - lineWidth / 2), top);
      top += UI_LINE_HEIGHT;
    }
    top += GAP_ABOVE_MENU;

    this.menu.view.position.set(Math.round(centreX - this.menu.width / 2), top);
  }
}
