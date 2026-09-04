import { Container, Graphics, type Renderer } from 'pixi.js';
import { EFFECT_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { Menu, type MenuItem, type MenuScreen } from './ui/menu.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';

const GAP_BELOW_HEADLINE = 14;

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

  private readonly dim: Graphics;
  private readonly headline: DisplayTitle;
  private readonly menu: Menu;
  private width = 0;
  private height = 0;

  constructor(kit: UiKit, renderer: Renderer, actions: PauseScreenActions) {
    this.view.visible = false;

    this.dim = new Graphics();
    this.view.addChild(this.dim);

    this.headline = new DisplayTitle(renderer, TITLE_STYLES.heading);
    this.headline.set('Paused');
    this.view.addChild(this.headline.view);

    const items: MenuItem[] = [
      { label: 'Resume', onSelect: actions.onResume },
      { label: 'Settings', onSelect: actions.onSettings },
      { label: 'Quit to Title', onSelect: actions.onQuitToTitle },
    ];
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
    this.dim.rect(0, 0, width, height).fill({ color: EFFECT_PALETTE.gameOverDim, alpha: 0.78 });

    const centreX = Math.round(width / 2);
    const centreY = Math.round(height / 2);
    const totalHeight = this.headline.height + GAP_BELOW_HEADLINE + this.menu.height;
    const top = Math.round(centreY - totalHeight / 2);

    this.headline.place(centreX, top);
    this.menu.view.position.set(
      Math.round(centreX - this.menu.width / 2),
      top + this.headline.height + GAP_BELOW_HEADLINE,
    );
  }
}
