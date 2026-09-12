import { Container, Graphics, Sprite, type BitmapText, type Texture } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { TITLE_PALETTE, UI_PALETTE } from './palette.js';
import { uiText } from './ui/text.js';

const MARGIN = 24;
/** Where the art zone ends and the text band begins, as a fraction of the frame's height. */
const ART_SPLIT = 0.68;

/**
 * A one-time illustrated story beat (#58): a full-frame plate with an
 * optional illustration filling most of it and one or two lines of body
 * text in a band beneath, up for as long as the player leaves it — there is
 * no auto-advance timer, only a skip. `app/main.ts`'s `startRun` is the one
 * caller, gated on `app/story/beats.ts`'s `hasSeenStoryBeat` so this ever
 * shows at most once per save, however many times a run is retried
 * afterwards.
 *
 * Same family as `FloorTitleCard` — an opaque plate, not a dim, since there
 * is no run behind it worth showing through — but a different shape:
 * `FloorTitleCard` announces a place in the display face; this tells a
 * moment of story in the text face, because it is the one thing on the card
 * meant to be read all the way through rather than glanced at.
 *
 * ## The art tier is the same two-step swap `TitleScreen.setPoster` uses
 *
 * `show()` can be called with no art yet loaded — the card still works,
 * text-only, the same graceful-degradation shape `docs/DECISIONS.md` #19
 * asks for a content gap applied to an asset fetch. `setArt()` swaps a real
 * texture in once it resolves. Sized by contain-fit within the art zone for
 * the same reason `TitleScreen`'s real poster is: this layer has no clip
 * rectangle (`docs/DECISIONS.md` #93), so an arbitrary-aspect illustration
 * has to fit inside its zone rather than be cropped to it at render time.
 */
export class StoryCard {
  readonly view = new Container();

  private readonly backdrop: Graphics;
  private readonly border: Graphics;
  private readonly art: Sprite;
  private body: BitmapText;
  private readonly hint: BitmapText;

  private hasArt = false;
  private bodyText = '';
  private bodyWrapWidth = 0;
  private width = 0;
  private height = 0;

  constructor(locale: Locale) {
    this.view.visible = false;

    this.backdrop = new Graphics();
    this.view.addChild(this.backdrop);

    this.art = new Sprite();
    this.art.visible = false;
    this.view.addChild(this.art);

    this.border = new Graphics();
    this.view.addChild(this.border);

    // Built for real in `layOut`, once a wrap width is known — `BitmapText`'s
    // word-wrap is fixed at construction (`style.wordWrapWidth` is read only
    // by `rebuild()`, which nothing here re-triggers after the fact), so this
    // placeholder only exists to give `layOut` something to replace.
    this.body = uiText('', { colour: UI_PALETTE.text, align: 'center' });
    this.view.addChild(this.body);

    this.hint = uiText(t(locale, 'ui.storyCard.skipHint'), { colour: UI_PALETTE.textDim });
    this.view.addChild(this.hint);
  }

  /** Shows the card with `text` as its body — already resolved, the same convention `FloorTitleCard.show` uses. */
  show(text: string): void {
    this.bodyText = text;
    this.view.visible = true;
    this.view.alpha = 1;
    this.layOut();
  }

  /** Swaps in a real illustration once one has finished loading — safe to call before or after `show`. */
  setArt(texture: Texture): void {
    this.art.texture = texture;
    this.hasArt = true;
    this.art.visible = true;
    if (this.view.visible) {
      this.layOut();
    }
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
    if (width <= 0 || height <= 0) {
      return;
    }
    const centreX = Math.round(width / 2);

    this.backdrop.clear();
    this.backdrop.rect(0, 0, width, height).fill({ color: TITLE_PALETTE.cardEdge });

    const inset = 6;
    this.border.clear();
    this.border
      .rect(inset, inset, width - inset * 2, 2)
      .rect(inset, height - inset - 2, width - inset * 2, 2)
      .rect(inset, inset, 2, height - inset * 2)
      .rect(width - inset - 2, inset, 2, height - inset * 2)
      .fill({ color: TITLE_PALETTE.rule });

    const artBottom = Math.round(height * ART_SPLIT);
    const artZone = { x: MARGIN, y: MARGIN, width: width - MARGIN * 2, height: artBottom - MARGIN };
    if (this.hasArt) {
      const fitScale = Math.min(
        artZone.width / this.art.texture.width,
        artZone.height / this.art.texture.height,
      );
      const artWidth = this.art.texture.width * fitScale;
      const artHeight = this.art.texture.height * fitScale;
      this.art.width = artWidth;
      this.art.height = artHeight;
      this.art.position.set(
        Math.round(artZone.x + (artZone.width - artWidth) / 2),
        Math.round(artZone.y + (artZone.height - artHeight) / 2),
      );
    }

    this.border
      .rect(MARGIN, artBottom, width - MARGIN * 2, 1)
      .fill({ color: TITLE_PALETTE.ruleShade });

    const wrapWidth = width - MARGIN * 4;
    if (wrapWidth !== this.bodyWrapWidth) {
      this.bodyWrapWidth = wrapWidth;
      this.view.removeChild(this.body);
      this.body.destroy();
      this.body = uiText(this.bodyText, {
        colour: UI_PALETTE.text,
        align: 'center',
        wrapWidth,
      });
      this.view.addChild(this.body);
    } else if (this.body.text !== this.bodyText) {
      this.body.text = this.bodyText;
    }

    const textZoneTop = artBottom + 16;
    const textZoneHeight = height - MARGIN - textZoneTop;
    this.body.position.set(
      Math.round(centreX - this.body.width / 2),
      Math.round(textZoneTop + (textZoneHeight - this.body.height) / 2),
    );

    this.hint.position.set(width - MARGIN - this.hint.width, height - MARGIN - this.hint.height);
  }
}
