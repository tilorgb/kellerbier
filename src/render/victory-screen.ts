import { Container, Graphics, type BitmapText, type Renderer } from 'pixi.js';
import { EFFECT_PALETTE, HUD_PALETTE, UI_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { Menu, type MenuItem, type MenuScreen } from './ui/menu.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { uiText, uiTextWidth } from './ui/text.js';

/** How much bigger than its authored size the headline is drawn — same scale `GameOverScreen` uses. */
const HEADLINE_SCALE = 3;

/** Padding inside the plate the summary/epilogue sits on. */
const PLATE_PADDING = 8;

const GAP_ABOVE_MENU = 10;

/** What the screen shows. Assembled by whoever tracks the run, not read from `GameSim` directly. */
export interface VictorySummaryText {
  readonly seconds: number;
  readonly kills: number;
  readonly floor: string;
}

export interface VictoryScreenActions {
  readonly onRetry: () => void;
  readonly onResults: () => void;
  readonly onHub: () => void;
}

/**
 * The victory screen (#155): clearing Der Stier — the last boss the game
 * has today — ends the run and says so.
 *
 * Same shape as `GameOverScreen`, on purpose: a dim over the game, a
 * headline in the display face, a summary plate, a `Menu` (#158) in place of
 * the old two-key hint. The headline takes `TITLE_STYLES.floor` (gold)
 * rather than `threat` (blood) — the one other place a title this size
 * appears — so a win reads as a different feeling from a death rather than a
 * re-skinned loss screen.
 *
 * The epilogue line is deliberately short and not character-specific: #58
 * (story delivery, chapter cards, the real chapter-two cliffhanger) is M8
 * scope and not built yet. This is "the moment of quiet" #155 itself asks
 * for — a beat that closes the run — not the finished narrative beat #58
 * will eventually replace it with.
 */
export class VictoryScreen implements MenuScreen {
  readonly view = new Container();

  private readonly dim: Graphics;
  private readonly plate: Container;
  private readonly headline: DisplayTitle;
  private readonly epilogue: BitmapText;
  private readonly summary: BitmapText;
  private readonly menu: Menu;
  private readonly kit: UiKit;
  private width = 0;
  private height = 0;

  constructor(kit: UiKit, renderer: Renderer, actions: VictoryScreenActions) {
    this.kit = kit;
    this.view.visible = false;

    this.dim = new Graphics();
    this.view.addChild(this.dim);

    this.plate = new Container();
    this.view.addChild(this.plate);

    this.headline = new DisplayTitle(renderer, TITLE_STYLES.floor);
    this.headline.view.scale.set(HEADLINE_SCALE);
    this.headline.set('Sieg!');
    this.view.addChild(this.headline.view);

    // Short and plain (#221), not the two-line dialect paragraph this used
    // to be. #58 (story delivery) replaces this beat properly; until then
    // it stays a placeholder beat — "the moment of quiet" #155 asks for,
    // not the finished narrative #58 will eventually write.
    this.epilogue = uiText('To be continued.', { colour: UI_PALETTE.text, align: 'center' });
    this.view.addChild(this.epilogue);

    this.summary = uiText('', { colour: HUD_PALETTE.gameOverSummary });
    this.view.addChild(this.summary);

    const items: MenuItem[] = [
      { label: 'Retry', onSelect: actions.onRetry },
      { label: 'Results', onSelect: actions.onResults },
      { label: 'Hub', onSelect: actions.onHub },
    ];
    this.menu = new Menu(kit, items);
    this.view.addChild(this.menu.view);
  }

  get visible(): boolean {
    return this.view.visible;
  }

  show(info: VictorySummaryText): void {
    this.summary.text = `${info.seconds.toFixed(1)}s   ${String(info.kills)} killed   ${info.floor}`;
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

    this.headline.place(centreX, Math.round(centreY - this.headline.height * HEADLINE_SCALE - 34));

    const epilogueWidth = uiTextWidth(this.epilogue.text);
    this.epilogue.position.set(
      Math.round(centreX - epilogueWidth / 2),
      Math.round(centreY - (this.headline.height * HEADLINE_SCALE) / 2 + 10),
    );

    const summaryWidth = uiTextWidth(this.summary.text);
    const plateWidth = Math.max(summaryWidth, this.menu.width) + PLATE_PADDING * 2;
    const plateHeight = PLATE_PADDING * 3 + this.summary.height + GAP_ABOVE_MENU + this.menu.height;
    const plateX = Math.round(centreX - plateWidth / 2);
    const plateY = Math.round(centreY + 30);

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
