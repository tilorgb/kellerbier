import { Container, Graphics, type BitmapText, type Renderer } from 'pixi.js';
import { EFFECT_PALETTE, HUD_PALETTE, UI_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { uiText, uiTextWidth, UI_LINE_HEIGHT, UI_TEXT_HEIGHT } from './ui/text.js';

/** How much bigger than its authored size the death word is drawn. Whole, like every other scale here. */
const HEADLINE_SCALE = 3;

/** Padding inside the plate the summary sits on. */
const PLATE_PADDING = 8;

/** What the screen shows. Assembled by whoever tracks the run, not read from `GameSim` directly. */
export interface RunSummaryText {
  /** The headline, drawn from `docs/CONTENT_BIBLE.md` §7's pool — shown exactly as authored. */
  readonly word: string;
  readonly seconds: number;
  readonly kills: number;
  /** "floor 0" today — see `src/debug/panels/run-info.ts`, the same placeholder until #20. */
  readonly floor: string;
}

/**
 * The game-over screen: a dim over the game, the death word, and a short run
 * summary on a plate.
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
 */
export class GameOverScreen {
  readonly view = new Container();

  private readonly dim: Graphics;
  private readonly plate: Container;
  private readonly headline: DisplayTitle;
  private readonly summary: BitmapText;
  private readonly hint: BitmapText;
  private readonly kit: UiKit;
  private width = 0;
  private height = 0;

  constructor(kit: UiKit, renderer: Renderer) {
    this.kit = kit;
    this.view.visible = false;

    this.dim = new Graphics();
    this.view.addChild(this.dim);

    this.plate = new Container();
    this.view.addChild(this.plate);

    this.headline = new DisplayTitle(renderer, TITLE_STYLES.threat);
    this.headline.view.scale.set(HEADLINE_SCALE);
    this.view.addChild(this.headline.view);

    this.summary = uiText('', { colour: HUD_PALETTE.gameOverSummary });
    this.view.addChild(this.summary);

    this.hint = uiText(
      // Two ways out of a finished run: straight into another one, or to the
      // results screen for the last run's stats and unlocks. A run that
      // earned something new opens the second on its own
      // (`main.ts`'s `advanceDeathSequence`); this is for every other death.
      // Plain English (#221): a control hint is read on every single death,
      // which makes it functional text under `docs/CONTENT_BIBLE.md` §0 —
      // no seasoned Bavarian word here, unlike the death word above it.
      'R: Try Again    T: Results',
      { colour: UI_PALETTE.textDim },
    );
    this.view.addChild(this.hint);
  }

  show(info: RunSummaryText): void {
    this.headline.set(info.word);
    this.summary.text = `${info.seconds.toFixed(1)}s survived   ${String(info.kills)} killed   ${info.floor}`;
    this.view.visible = true;
    this.layOut();
  }

  hide(): void {
    this.view.visible = false;
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
    const hintWidth = uiTextWidth(this.hint.text);
    const plateWidth = Math.max(summaryWidth, hintWidth) + PLATE_PADDING * 2;
    const plateHeight = UI_LINE_HEIGHT + UI_TEXT_HEIGHT + PLATE_PADDING * 2;
    const plateX = Math.round(centreX - plateWidth / 2);
    const plateY = Math.round(centreY + 4);

    this.plate.removeChildren();
    const panel = this.kit.panelSprite(plateWidth, plateHeight);
    this.plate.addChild(panel);
    this.plate.position.set(plateX, plateY);

    this.summary.position.set(Math.round(centreX - summaryWidth / 2), plateY + PLATE_PADDING);
    this.hint.position.set(
      Math.round(centreX - hintWidth / 2),
      plateY + PLATE_PADDING + UI_LINE_HEIGHT,
    );
  }
}
