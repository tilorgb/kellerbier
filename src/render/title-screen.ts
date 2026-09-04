import { Container, Graphics, type Renderer } from 'pixi.js';
import { EFFECT_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { Menu, type MenuItem, type MenuScreen } from './ui/menu.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';

/** How much bigger than its authored size the name is drawn. */
const HEADLINE_SCALE = 2;

const GAP_BELOW_HEADLINE = 24;

export interface TitleScreenActions {
  readonly onStart: () => void;
  readonly onContinue: () => void;
  readonly onSettings: () => void;
  readonly onCredits: () => void;
  readonly onQuit: () => void;
  /** Re-checked on every `show()` — whether a save exists to resume into. */
  readonly canContinue: () => boolean;
}

/**
 * The title screen (#158): the first thing anyone sees, and the one screen
 * in the game a stranger judges it by before playing at all.
 *
 * Same shape as `GameOverScreen`/`VictoryScreen` — a dim, a headline in the
 * display face, laid out in UI pixels — with a `Menu` (#154's `FocusRing`,
 * finally with a consumer) standing in for their static hint text, since
 * this is the one screen with more than one thing a player can do from it.
 */
export class TitleScreen implements MenuScreen {
  readonly view = new Container();

  private readonly dim: Graphics;
  private readonly headline: DisplayTitle;
  private readonly menu: Menu;
  private width = 0;
  private height = 0;

  constructor(kit: UiKit, renderer: Renderer, actions: TitleScreenActions) {
    this.view.visible = false;

    this.dim = new Graphics();
    this.view.addChild(this.dim);

    // `title.ts`'s own doc comment names `TITLE_STYLES.floor` for "the game's
    // own name" alongside a floor's intro card — this is that name.
    this.headline = new DisplayTitle(renderer, TITLE_STYLES.floor);
    this.headline.view.scale.set(HEADLINE_SCALE);
    this.headline.set('Kellerbier');
    this.view.addChild(this.headline.view);

    const items: MenuItem[] = [
      { label: 'Start', onSelect: actions.onStart },
      { label: 'Continue', onSelect: actions.onContinue, disabled: () => !actions.canContinue() },
      { label: 'Settings', onSelect: actions.onSettings },
      { label: 'Credits', onSelect: actions.onCredits },
      { label: 'Quit', onSelect: actions.onQuit },
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
    this.dim.rect(0, 0, width, height).fill({ color: EFFECT_PALETTE.gameOverDim, alpha: 0.96 });

    const centreX = Math.round(width / 2);
    const headlineTop = Math.round(height * 0.28);
    this.headline.place(centreX, headlineTop);

    const menuTop = headlineTop + this.headline.height * HEADLINE_SCALE + GAP_BELOW_HEADLINE;
    this.menu.view.position.set(Math.round(centreX - this.menu.width / 2), Math.round(menuTop));
  }
}
