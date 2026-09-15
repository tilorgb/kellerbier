import { Container, Graphics, Sprite, type BitmapText, type Texture } from './gfx/index.js';
import { POSTCARD_PALETTE } from './palette.js';
import {
  POSTCARD_SHADOW_OFFSET,
  postcardCaptionWrapWidth,
  postcardGeometry,
  postcardTexture,
  type PostcardGeometry,
  type PostcardPaperOptions,
} from './ui/postcard-paper.js';
import { uiText } from './ui/text.js';

/** How dark the card's own shadow is, over whatever it is lying on. */
const SHADOW_ALPHA = 0.45;

export interface PostcardOptions {
  /**
   * Which sheet of paper this is: the grain and foxing are a hash of it, so
   * two cards on screen at once are not the same sheet twice and one card
   * keeps its own paper across a resize.
   */
  readonly seed?: number;
}

/**
 * The physical postcard: a printed sheet of card stock with one illustration
 * mounted on it, an optional message, and a franked corner — the object the
 * title screen's right pane, `StoryCard`'s story beats and `BossIntroPlate`'s
 * reveal all hold, so every motif the game shows a player reads as the same
 * thing posted from the same place.
 *
 * The paper itself is `ui/postcard-paper.ts`: it draws the sheet, punches the
 * picture's window out of it and hands back the geometry. This class is the
 * scene-graph half — the shadow the card casts, the illustration sprite in the
 * window, and the caption set in the paper — and it owns nothing about how a
 * postcard *looks*.
 *
 * Two-tier art loading, same shape as every illustrated screen in this game
 * (`docs/DECISIONS.md` #19 applied to an asset fetch): the sheet is up the
 * moment `resize` is called, `setArt` swaps a real texture into its window
 * once one resolves, and a card that never gets a caption never reserves room
 * for one — `TitleScreen`'s postcard has no caption at all, only art.
 *
 * The caption is measured before it is placed: `postcardCaptionWrapWidth` says
 * how wide the text wraps for this card's box, the wrapped text's own height
 * is what the paper then reserves, and the layout (a front with a caption in
 * the foot, or a divided back with a message beside the picture) falls out of
 * the box in `postcardGeometry`. A caller never picks the layout.
 */
export class Postcard {
  readonly view = new Container();

  private readonly shadow = new Graphics();
  private readonly paper = new Sprite();
  private readonly art = new Sprite();
  private caption: BitmapText | null = null;
  private captionText = '';
  private captionWrapWidth = -1;
  private hasArt = false;
  private artAspect: number | undefined;
  private width = 0;
  private height = 0;
  private readonly seed: number;
  /** What the current paper texture was drawn for — a redraw is a texture upload, so it is not done per layout. */
  private paperKey = '';

  constructor(options: PostcardOptions = {}) {
    this.seed = options.seed ?? 1;
    this.view.addChild(this.shadow);
    this.view.addChild(this.paper);
    this.art.visible = false;
    this.view.addChild(this.art);
  }

  /** Swaps a real illustration in once one has finished loading — safe to call before or after `resize`. */
  setArt(texture: Texture): void {
    this.art.texture = texture;
    this.hasArt = true;
    this.art.visible = true;
    this.artAspect = texture.height === 0 ? undefined : texture.width / texture.height;
    this.layOut();
  }

  /** Shows (or updates) the card's message. First call is what reserves room for it. */
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

    const captionHeight = this.layOutCaptionText();
    const options: PostcardPaperOptions = {
      ...(this.artAspect === undefined ? {} : { artAspect: this.artAspect }),
      captionHeight,
      seed: this.seed,
    };
    const geometry = postcardGeometry(width, height, options);

    // Joined rather than interpolated: these are the four numbers a sheet is
    // drawn from, and re-drawing one is a texture upload.
    const key = [width, height, captionHeight, Math.round((this.artAspect ?? 0) * 1000)].join(':');
    if (key !== this.paperKey) {
      const previous = this.paper.texture;
      this.paper.texture = postcardTexture(width, height, options);
      if (previous.width > 1) {
        previous.destroy(true);
      }
      this.paperKey = key;
    }
    this.paper.width = width;
    this.paper.height = height;

    this.shadow.clear();
    this.shadow
      .rect(POSTCARD_SHADOW_OFFSET, POSTCARD_SHADOW_OFFSET, width, height)
      .fill({ color: POSTCARD_PALETTE.shadow, alpha: SHADOW_ALPHA });

    if (this.hasArt) {
      this.art.width = geometry.picture.width;
      this.art.height = geometry.picture.height;
      this.art.position.set(geometry.picture.x, geometry.picture.y);
    }

    this.placeCaption(geometry);
  }

  /**
   * Builds the caption at this box's wrap width, if there is one, and returns
   * how tall it draws — which is what the paper reserves for it. Nothing is
   * positioned here: where the band ends up is `postcardGeometry`'s answer,
   * and that answer needs this number first.
   */
  private layOutCaptionText(): number {
    if (this.captionText.length === 0) {
      if (this.caption !== null) {
        this.view.removeChild(this.caption);
        this.caption.destroy();
        this.caption = null;
        this.captionWrapWidth = -1;
      }
      return 0;
    }

    const wrapWidth = postcardCaptionWrapWidth(
      this.width,
      this.height,
      this.artAspect === undefined ? {} : { artAspect: this.artAspect },
    );
    if (this.caption === null || wrapWidth !== this.captionWrapWidth) {
      if (this.caption !== null) {
        this.view.removeChild(this.caption);
        this.caption.destroy();
      }
      this.captionWrapWidth = wrapWidth;
      this.caption = uiText(this.captionText, {
        colour: POSTCARD_PALETTE.ink,
        wrapWidth,
      });
      this.view.addChild(this.caption);
    } else if (this.caption.text !== this.captionText) {
      this.caption.text = this.captionText;
    }
    return Math.round(this.caption.height);
  }

  private placeCaption(geometry: PostcardGeometry): void {
    const caption = this.caption;
    const band = geometry.caption;
    if (caption === null || band === null) {
      return;
    }
    // Set from the band's left edge — a message on a postcard is written, not
    // centred — and centred vertically in whatever the band turned out to be,
    // so a short message on a tall divided back sits in the middle of its half
    // rather than clinging to the franking above it.
    caption.position.set(
      band.x,
      Math.round(band.y + Math.max(0, (band.height - caption.height) / 2)),
    );
  }
}
