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
 * leaves it — there is no auto-advance timer, only a skip. `app/main.ts` is
 * the one caller, gated on `app/story/beats.ts`'s `hasSeenStoryBeat` so any
 * given beat shows at most once per save, however many times a run is retried
 * afterwards.
 *
 * ## One card, several beats
 *
 * There is more than one beat now — the opening before floor 1, and chapter
 * two's card on the way up out of the cellar (`STORY_BEAT_CHAPTER_TWO`) — and
 * they share this one `Postcard` rather than one instance each: the sheet, its
 * paper grain and its layout are identical, and only the picture and the words
 * differ. That sharing is exactly why `show` takes the beat's id and why art
 * is registered *per beat* (`setArt`): a beat with no illustration of its own
 * must show an empty picture window, not silently inherit whichever
 * illustration the previous beat happened to load. `docs/DECISIONS.md` #96's
 * two-tier path — plain or procedural first, real art swapped in once it is
 * generated and signed off — is per-beat for the same reason.
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

  /** Illustrations by beat id, filled in as each one's fetch resolves — see `setArt`. */
  private readonly art = new Map<string, Texture>();
  /** Which beat is on the card right now, or `null` while it is down — see `beat`. */
  private shownBeat: string | null = null;

  private width = 0;
  private height = 0;

  constructor(locale: Locale) {
    this.view.visible = false;
    this.view.addChild(this.dim);
    this.view.addChild(this.postcard.view);

    this.hint = uiText(t(locale, 'ui.storyCard.skipHint'), { colour: UI_PALETTE.textDim });
    this.view.addChild(this.hint);
  }

  /**
   * Shows `beat`'s card with `text` as its message — already resolved, the
   * same convention `FloorTitleCard.show` uses. The picture is whatever
   * `setArt` has registered for *this* beat, and an empty window if nothing
   * has.
   */
  show(beat: string, text: string): void {
    this.shownBeat = beat;
    const art = this.art.get(beat);
    if (art === undefined) {
      this.postcard.clearArt();
    } else {
      this.postcard.setArt(art);
    }
    this.postcard.setCaption(text);
    this.view.visible = true;
    this.view.alpha = 1;
    this.layOut();
  }

  /**
   * Registers `beat`'s illustration once its fetch has resolved — safe to call
   * before or after `show`, and for a beat that is not the one currently up.
   * A late-resolving fetch for the beat the player is looking at right now
   * swaps in behind their eyes rather than being dropped.
   */
  setArt(beat: string, texture: Texture): void {
    this.art.set(beat, texture);
    if (this.view.visible && this.shownBeat === beat) {
      this.postcard.setArt(texture);
    }
  }

  hide(): void {
    this.view.visible = false;
    this.shownBeat = null;
  }

  get visible(): boolean {
    return this.view.visible;
  }

  /** The beat currently on the card, or `null` while it is down — what the caller marks seen on dismissal. */
  get beat(): string | null {
    return this.shownBeat;
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
