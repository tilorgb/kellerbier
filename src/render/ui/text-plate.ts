import { Container, type BitmapText, type NineSliceSprite } from 'pixi.js';
import type { UiKit } from './kit.js';
import { uiText, type UiTextOptions } from './text.js';

/** Space between the plate's inner edge and its text, in UI pixels. */
const PADDING_X = 5;
const PADDING_Y = 3;

/**
 * A line (or a paragraph) of text on a kit panel, sized to fit it.
 *
 * Every floating message the game shows — the boss room's intro banner, the
 * pickup toast, a shop item's price preview, a pedestal's name plate and its
 * reveal panel — was a bare `Text` in a system font drawn straight onto the
 * room. Over a bright floor (Die Alpen's snow, Die Wiesn's everything) that
 * is text with no background at all, which is the one thing a message the
 * player has half a second to read cannot be.
 *
 * The plate is what fixes it, and it is the same nine-slice the pause menu
 * and the map overlay use, so a message reads as part of the same UI rather
 * than as a label that happened to grow a box.
 *
 * `set` re-sizes the plate to whatever it is given; `place` centres it. The
 * two are separate because the text changes on an event and the position
 * changes on a resize, and neither should force the other.
 */
export class TextPlate {
  readonly view = new Container();

  private readonly plate: NineSliceSprite;
  private readonly label: BitmapText;

  constructor(kit: UiKit, options: UiTextOptions = {}) {
    this.plate = kit.panelSprite(1, 1);
    this.view.addChild(this.plate);
    this.label = uiText('', options);
    this.label.position.set(PADDING_X, PADDING_Y);
    this.view.addChild(this.label);
    this.view.visible = false;
  }

  /** Sets the text and re-sizes the plate around it. */
  set(text: string): void {
    this.label.text = text;
    // `label.width`/`height` rather than `uiTextWidth`, because a wrapped
    // paragraph's width is whatever the wrap actually produced, not the width
    // of its longest authored line.
    this.plate.width = Math.ceil(this.label.width) + PADDING_X * 2;
    this.plate.height = Math.ceil(this.label.height) + PADDING_Y * 2;
  }

  /** Centres the plate horizontally on `centreX`, with its top at `top`. All in UI pixels. */
  place(centreX: number, top: number): void {
    this.view.position.set(Math.round(centreX - this.plate.width / 2), Math.round(top));
  }

  /** Recolours the label — a shop preview goes grey the moment it is unaffordable. */
  setColour(colour: number): void {
    this.label.style.fill = colour;
  }

  /** Centres the plate on a point, both axes. */
  placeCentred(centreX: number, centreY: number): void {
    this.place(centreX, Math.round(centreY - this.plate.height / 2));
  }

  set visible(value: boolean) {
    this.view.visible = value;
  }

  get visible(): boolean {
    return this.view.visible;
  }

  get width(): number {
    return this.plate.width;
  }

  get height(): number {
    return this.plate.height;
  }
}
