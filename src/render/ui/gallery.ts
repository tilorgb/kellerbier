import { Container, Graphics, Sprite, type BitmapText, type Renderer } from 'pixi.js';
import { EFFECT_PALETTE, TITLE_PALETTE, UI_PALETTE } from '../palette.js';
import { UI_ICONS } from './icons.js';
import { DISPLAY_FACE, TEXT_FACE } from './font-compile.js';
import { FocusRing, iconRoles, type ButtonState, type UiKit } from './kit.js';
import { DisplayTitle, TITLE_STYLES } from './title.js';
import { displayText, uiText, uiTextWidth, UI_LINE_HEIGHT } from './text.js';

/** Clear of the dev app's DOM toolbar over the canvas's top-left corner. */
const TOP_MARGIN = 26;

/** The rows the button strip shows, in order. */
const BUTTON_STATES: readonly ButtonState[] = ['normal', 'selected', 'pressed', 'disabled'];

/**
 * The longest German strings the UI actually holds, shown at 1:1.
 *
 * Not decoration: #154's acceptance criterion is that the longest *real*
 * German string fits its element, checked against the real strings rather than
 * English placeholders. `tests/unit/ui-strings.test.ts` asserts it; this is
 * where a person looks at it.
 */
const SPECIMEN: readonly string[] = [
  'ÄÖÜ äöü ß — Weißbier, Maßkrug, Größe',
  'Biermarken 128  Schlüssel 3  Bierfassl 2',
  'Kellerschlüssel — Sperrt die verschlossene Tür auf',
  'Übersteuert 4,7‰  Kater  T+2',
  'Trink-Rucksack (Füllstand 87%)  [E]',
  '„Des schmeckt nach Rosinen“ — Opa, 1994',
];

/**
 * The kit's own specimen page: every glyph, frame, state and icon, at the
 * size a player sees them.
 *
 * ## Why this ships rather than living in a test
 *
 * `CLAUDE.md`: a feature nobody can experience is not finished, however
 * thoroughly it is unit-tested. Most of #154's kit — the button states, the
 * slider, the focus ring gamepad navigation (#53) needs — has no consumer in
 * the game yet, because the menus that will use it are M8. Without this page
 * the only way to see any of it would be to read the source, and art nobody
 * looks at is art nobody notices is wrong.
 *
 * It is also the fastest way to answer the question this issue exists for:
 * *is that legible at 1×?* Toggled with `K`, drawn on the same UI grid as the
 * HUD, so what it shows is what the game draws.
 */
export class UiKitGallery {
  readonly view = new Container();

  private readonly backdrop = new Graphics();
  private readonly focusRing: FocusRing;

  /** Which button row the focus ring is on. Stepped by `K` re-presses so the ring is visibly a thing that moves. */
  private focusRow = 1;

  constructor(kit: UiKit, renderer: Renderer) {
    this.view.visible = false;
    this.view.addChild(this.backdrop);

    const title = new DisplayTitle(renderer, TITLE_STYLES.floor);
    title.set('UI-Kastl');
    // Clear of the dev app's own DOM toolbar, which sits over the canvas's
    // top-left corner and would otherwise eat the heading.
    title.view.position.set(12, TOP_MARGIN);
    this.view.addChild(title.view);

    const subtitle = uiText('K blättert weiter und schließt — jede Zeile 1:1', {
      colour: UI_PALETTE.textDim,
    });
    subtitle.position.set(12, TOP_MARGIN + DISPLAY_FACE.metrics.cellHeight + 4);
    this.view.addChild(subtitle);

    this.coverage = uiText(
      `${String(TEXT_FACE.characters().length)} Zeichen im Textschnitt, ` +
        `${String(DISPLAY_FACE.characters().length)} im Fraktur`,
      { colour: UI_PALETTE.textDim },
    );
    this.view.addChild(this.coverage);

    let y = TOP_MARGIN + DISPLAY_FACE.metrics.cellHeight + 4 + UI_LINE_HEIGHT + 4;
    for (const line of SPECIMEN) {
      const label = uiText(line);
      label.position.set(12, y);
      this.view.addChild(label);
      y += UI_LINE_HEIGHT;
    }

    y += 6;
    const displaySpecimen = displayText('Der Keller — Die Wiesn', {
      colour: TITLE_PALETTE.rule,
    });
    displaySpecimen.position.set(12, y);
    this.view.addChild(displaySpecimen);
    y += DISPLAY_FACE.metrics.lineAdvance + 6;

    // --- the frames and their states ---
    const panel = kit.panelSprite(150, 34);
    panel.position.set(12, y);
    this.view.addChild(panel);
    const panelLabel = uiText('Panel', { colour: UI_PALETTE.textDim });
    panelLabel.position.set(20, y + 6);
    this.view.addChild(panelLabel);
    const well = kit.wellSprite(120, 10);
    well.position.set(20, y + 19);
    this.view.addChild(well);
    const wellFill = new Sprite(kit.solid);
    wellFill.tint = UI_PALETTE.sliderFill;
    wellFill.position.set(22, y + 21);
    wellFill.width = 70;
    wellFill.height = 6;
    this.view.addChild(wellFill);

    const buttonX = 180;
    let buttonY = y;
    this.focusRing = new FocusRing(kit);
    for (const state of BUTTON_STATES) {
      const button = kit.buttonSprite(state, 150, 16);
      button.position.set(buttonX, buttonY);
      this.view.addChild(button);
      const label = uiText(state, {
        colour: state === 'disabled' ? UI_PALETTE.textDisabled : UI_PALETTE.text,
      });
      label.position.set(buttonX + 10, buttonY + 3);
      this.view.addChild(label);
      buttonY += 20;
    }
    this.view.addChild(this.focusRing.view);
    this.buttonOrigin = { x: buttonX, y };

    // --- the slider ---
    const slider = new Container();
    slider.position.set(buttonX, buttonY + 4);
    slider.addChild(kit.wellSprite(150, 8));
    const sliderFill = new Sprite(kit.solid);
    sliderFill.tint = UI_PALETTE.sliderFill;
    sliderFill.position.set(2, 2);
    sliderFill.height = 4;
    sliderFill.width = 90;
    slider.addChild(sliderFill);
    const knob = new Sprite(kit.knob);
    knob.position.set(88, -1);
    slider.addChild(knob);
    this.view.addChild(slider);

    // --- every icon, with its name under it, on a panel ---
    const iconTop = buttonY + 26;
    const iconPanel = kit.panelSprite(1, 26);
    iconPanel.position.set(8, iconTop - 4);
    this.view.addChild(iconPanel);
    let iconX = 12;
    for (const [name, art] of Object.entries(UI_ICONS)) {
      const sprite = new Sprite(kit.icon(name, iconRoles(UI_PALETTE.accent)));
      sprite.position.set(iconX, iconTop);
      this.view.addChild(sprite);
      const caption = uiText(name, { colour: UI_PALETTE.textDim });
      caption.position.set(iconX, iconTop + 13);
      this.view.addChild(caption);
      iconX += Math.max(uiTextWidth(name), art[0]?.length ?? 8) + 6;
    }
    // Sized once the row is laid out. The icons carry a near-black outline —
    // that is what makes them read over a lit room — so on the gallery's own
    // dark backdrop they need something behind them or half the set vanishes.
    iconPanel.width = iconX - 4;
  }

  private readonly buttonOrigin: { x: number; y: number };
  private readonly coverage: BitmapText;

  /** Shows or hides the page; a re-press while open steps the focus ring instead of closing. */
  toggle(): void {
    if (!this.view.visible) {
      this.view.visible = true;
      this.focusRow = 0;
    } else if (this.focusRow < BUTTON_STATES.length - 1) {
      this.focusRow += 1;
    } else {
      this.view.visible = false;
      return;
    }
    this.syncFocus();
  }

  get visible(): boolean {
    return this.view.visible;
  }

  private syncFocus(): void {
    this.focusRing.sync({
      x: this.buttonOrigin.x,
      y: this.buttonOrigin.y + this.focusRow * 20,
      width: 150,
      height: 16,
    });
  }

  /** Call on every resize. Dimensions in UI pixels. */
  resize(width: number, height: number): void {
    this.backdrop.clear();
    this.backdrop
      .rect(0, 0, width, height)
      .fill({ color: EFFECT_PALETTE.gameOverDim, alpha: 0.96 });
    // Top-right: the bottom-left corner is the dev readout's.
    this.coverage.position.set(
      width - uiTextWidth(this.coverage.text) - 12,
      TOP_MARGIN + DISPLAY_FACE.metrics.cellHeight + 4,
    );
  }
}
