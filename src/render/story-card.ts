import { Container, Graphics, type BitmapText, type Texture } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { EFFECT_PALETTE, UI_PALETTE } from './palette.js';
import { Postcard } from './postcard.js';
import { uiText } from './ui/text.js';

const MARGIN = 24;
/** How far the card is held off the top and bottom of the frame — more than the sides, so it reads as landscape. */
const VERTICAL_INSET = 40;
/** How dark the room behind the card goes while it is up. */
const DIM_ALPHA = 0.78;

/**
 * A one-time illustrated story beat (#58): a `Postcard` lying on the dimmed
 * room with its illustration and its text on it, up for as long as the player
 * leaves it — there is no auto-advance timer, only a skip. `app/main.ts`'s
 * `startRun` is the one caller, gated on `app/story/beats.ts`'s
 * `hasSeenStoryBeat` so this ever shows at most once per save, however many
 * times a run is retried afterwards.
 *
 * ## Why it stopped being the whole frame
 *
 * It used to *be* the card: a `Postcard` stretched edge to edge with the
 * illustration filling the top two thirds and the text in a band underneath.
 * At that size nothing about it read as a postcard — a picture touching all
 * four sides of the screen is a background, and the card's own border was the
 * one pixel of evidence otherwise. So the card is now inset, with the room
 * dimmed behind it and the card's shadow falling on that: a physical object
 * somebody is holding up, which is the whole point of the motif
 * (`docs/DECISIONS.md` #98) and the one thing the full-frame version could not
 * show.
 *
 * Being inset is also what lets the beat use the *back* of a card: a landscape
 * box wide enough for `Postcard` to divide, with the picture on the left and
 * this beat's two paragraphs set as a message on the right. The card picks
 * that itself from its box — see `ui/postcard-paper.ts` — so nothing here
 * chooses a layout; it only chooses how big the card is.
 */
export class StoryCard {
  readonly view = new Container();

  private readonly dim = new Graphics();
  private readonly postcard = new Postcard({ seed: 3 });
  private readonly hint: BitmapText;

  private width = 0;
  private height = 0;

  constructor(locale: Locale) {
    this.view.visible = false;
    this.view.addChild(this.dim);
    this.view.addChild(this.postcard.view);

    this.hint = uiText(t(locale, 'ui.storyCard.skipHint'), { colour: UI_PALETTE.textDim });
    this.view.addChild(this.hint);
  }

  /** Shows the card with `text` as its message — already resolved, the same convention `FloorTitleCard.show` uses. */
  show(text: string): void {
    this.postcard.setCaption(text);
    this.view.visible = true;
    this.view.alpha = 1;
    this.layOut();
  }

  /** Swaps in a real illustration once one has finished loading — safe to call before or after `show`. */
  setArt(texture: Texture): void {
    this.postcard.setArt(texture);
  }

  hide(): void {
    this.view.visible = false;
  }

  get visible(): boolean {
    return this.view.visible;
  }

  setLocale(locale: Locale): void {
    this.hint.text = t(locale, 'ui.storyCard.skipHint');
    if (this.view.visible) {
      this.layOut();
    }
  }

  /** Call on every resize. Dimensions in UI pixels. */
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
    this.dim
      .rect(0, 0, width, height)
      .fill({ color: EFFECT_PALETTE.gameOverDim, alpha: DIM_ALPHA });

    const cardWidth = Math.max(1, width - MARGIN * 2);
    const cardHeight = Math.max(1, height - VERTICAL_INSET * 2);
    this.postcard.view.position.set(MARGIN, VERTICAL_INSET);
    this.postcard.resize(cardWidth, cardHeight);

    this.hint.position.set(
      width - MARGIN - this.hint.width,
      height - VERTICAL_INSET / 2 - this.hint.height / 2,
    );
  }
}
