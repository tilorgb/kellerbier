import { Container, Graphics, Sprite, type BitmapText, type Texture } from './gfx/index.js';
import { TITLE_PALETTE, UI_PALETTE } from './palette.js';
import { uiText } from './ui/text.js';

const MARGIN = 10;
const CAPTION_GAP = 10;

export interface PostcardOptions {
  /** Fraction of the card's own height the art zone gets once a caption is set. Ignored if `setCaption` is never called. */
  readonly artSplit?: number;
}

/**
 * The physical postcard: a bordered plate holding one illustration, with an
 * optional caption band underneath — the shared frame the title screen's
 * right pane and `StoryCard`'s full-frame story beats both sit inside, so
 * every motif the game shows a player (the title, the opening, a future
 * chapter beat) reads as the same object with a different picture in it,
 * per the title-screen redesign that put a postcard on the title screen
 * itself rather than a full-bleed backdrop.
 *
 * Two-tier art loading, same shape as every illustrated screen in this game
 * (`docs/DECISIONS.md` #19 applied to an asset fetch): the frame and border
 * are up the moment `resize` is called, `setArt` swaps a real texture in
 * once one resolves, and a card that never gets a caption never reserves
 * room for one — `TitleScreen`'s postcard has no caption at all, only art.
 */
export class Postcard {
  readonly view = new Container();

  private readonly backdrop = new Graphics();
  private readonly border = new Graphics();
  private readonly art = new Sprite();
  private caption: BitmapText | null = null;
  private captionText = '';
  private captionWrapWidth = -1;
  private hasArt = false;
  private width = 0;
  private height = 0;
  private readonly artSplit: number;

  constructor(options: PostcardOptions = {}) {
    this.artSplit = options.artSplit ?? 1;
    this.view.addChild(this.backdrop);
    this.art.visible = false;
    this.view.addChild(this.art);
    this.view.addChild(this.border);
  }

  /** Swaps a real illustration in once one has finished loading — safe to call before or after `resize`. */
  setArt(texture: Texture): void {
    this.art.texture = texture;
    this.hasArt = true;
    this.art.visible = true;
    this.layOut();
  }

  /** Shows (or updates) the caption band under the art. First call is what reserves the band's room. */
  setCaption(text: string): void {
    this.captionText = text;
    this.layOut();
  }

  /** Call whenever the card's own box changes — dimensions are the card's, not the screen's, both in UI pixels. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.layOut();
  }

  private layOut(): void {
    const { width, height } = this;
    if (width <= 0 || height <= 0) {
      return;
    }

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

    const hasCaption = this.captionText.length > 0;
    const artBottom = hasCaption ? Math.round(height * this.artSplit) : height - MARGIN;
    if (this.hasArt) {
      const zoneWidth = width - MARGIN * 2;
      const zoneHeight = artBottom - MARGIN;
      const fitScale = Math.min(
        zoneWidth / this.art.texture.width,
        zoneHeight / this.art.texture.height,
      );
      const artWidth = this.art.texture.width * fitScale;
      const artHeight = this.art.texture.height * fitScale;
      this.art.width = artWidth;
      this.art.height = artHeight;
      this.art.position.set(
        Math.round(MARGIN + (zoneWidth - artWidth) / 2),
        Math.round(MARGIN + (zoneHeight - artHeight) / 2),
      );
    }

    if (!hasCaption) {
      if (this.caption !== null) {
        this.view.removeChild(this.caption);
        this.caption.destroy();
        this.caption = null;
        this.captionWrapWidth = -1;
      }
      return;
    }

    this.border
      .rect(MARGIN, artBottom, width - MARGIN * 2, 1)
      .fill({ color: TITLE_PALETTE.ruleShade });

    const wrapWidth = width - MARGIN * 4;
    if (this.caption === null || wrapWidth !== this.captionWrapWidth) {
      if (this.caption !== null) {
        this.view.removeChild(this.caption);
        this.caption.destroy();
      }
      this.captionWrapWidth = wrapWidth;
      this.caption = uiText(this.captionText, {
        colour: UI_PALETTE.text,
        align: 'center',
        wrapWidth,
      });
      this.view.addChild(this.caption);
    } else if (this.caption.text !== this.captionText) {
      this.caption.text = this.captionText;
    }

    const textZoneTop = artBottom + CAPTION_GAP;
    const textZoneHeight = height - MARGIN - textZoneTop;
    this.caption.position.set(
      Math.round(width / 2 - this.caption.width / 2),
      Math.round(textZoneTop + (textZoneHeight - this.caption.height) / 2),
    );
  }
}
