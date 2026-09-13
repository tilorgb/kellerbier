import { Container, type BitmapText, type Texture } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { UI_PALETTE } from './palette.js';
import { Postcard } from './postcard.js';
import { uiText } from './ui/text.js';

const MARGIN = 24;
/** Where the art zone ends and the caption band begins, as a fraction of the frame's height. */
const ART_SPLIT = 0.68;

/**
 * A one-time illustrated story beat (#58): a full-frame `Postcard` with an
 * optional illustration filling most of it and one or two lines of body
 * text in a band beneath, up for as long as the player leaves it — there is
 * no auto-advance timer, only a skip. `app/main.ts`'s `startRun` is the one
 * caller, gated on `app/story/beats.ts`'s `hasSeenStoryBeat` so this ever
 * shows at most once per save, however many times a run is retried
 * afterwards.
 *
 * The card itself — backdrop, border, art-fit, caption band — is
 * `Postcard`, the same physical object the title screen's right pane now
 * holds; this class only adds what makes a full-frame *beat* different from
 * a title screen's picture: it fills the entire frame rather than a pane,
 * and it carries the skip hint the title screen has no use for.
 */
export class StoryCard {
  readonly view = new Container();

  private readonly postcard = new Postcard({ artSplit: ART_SPLIT });
  private readonly hint: BitmapText;

  private width = 0;
  private height = 0;

  constructor(locale: Locale) {
    this.view.visible = false;
    this.view.addChild(this.postcard.view);

    this.hint = uiText(t(locale, 'ui.storyCard.skipHint'), { colour: UI_PALETTE.textDim });
    this.view.addChild(this.hint);
  }

  /** Shows the card with `text` as its caption — already resolved, the same convention `FloorTitleCard.show` uses. */
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
    this.postcard.resize(this.width, this.height);
    this.hint.position.set(
      this.width - MARGIN - this.hint.width,
      this.height - MARGIN - this.hint.height,
    );
  }
}
