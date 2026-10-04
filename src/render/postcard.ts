import {
  Container,
  Graphics,
  Sprite,
  Texture,
  textureFromImage,
  type BitmapText,
} from './gfx/index.js';
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
  /** Blank card stock filling the punched window while there is no picture — see `layOut`. */
  private readonly mount = new Graphics();
  private readonly art = new Sprite();
  private caption: BitmapText | null = null;
  private captionText = '';
  private captionWrapWidth = -1;
  /** The illustration as it was loaded — `art` shows `pixelArt`, a copy cut down to the window's size. */
  private source: Texture | null = null;
  private pixelArt: Texture | null = null;
  private pixelArtKey = '';
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
    this.view.addChild(this.mount);
    this.art.visible = false;
    this.view.addChild(this.art);
  }

  /** Swaps a real illustration in once one has finished loading — safe to call before or after `resize`. */
  setArt(texture: Texture): void {
    this.source = texture;
    this.dropPixelArt();
    this.art.texture = texture;
    this.hasArt = true;
    this.art.visible = true;
    this.artAspect = texture.height === 0 ? undefined : texture.width / texture.height;
    this.layOut();
  }

  /**
   * Takes the illustration back out of the window — the sheet keeps its shape
   * and the picture is empty again, exactly as it was before the first
   * `setArt`. One `Postcard` instance outliving several different pictures is
   * the reason this exists: `StoryCard` shows more than one beat off the same
   * card, and a beat with no art of its own must not inherit the last one's.
   */
  clearArt(): void {
    if (!this.hasArt) {
      return;
    }
    this.source = null;
    this.dropPixelArt();
    this.art.texture = Texture.EMPTY;
    this.hasArt = false;
    this.art.visible = false;
    this.artAspect = undefined;
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

    // The sheet has a real hole where the picture goes (`drawPictureKeyline`
    // punches it, on the reasoning that a sprite always covers it) — so a card
    // with no picture needs something *in* the window, or the room behind the
    // card shows straight through it and the card reads as a cut-out rather
    // than as an unprinted one. Blank stock, a shade darker than the sheet, is
    // what an empty mount looks like. Cleared the moment art arrives, which is
    // every case this class had before a beat existed without its own picture.
    this.mount.clear();
    if (this.hasArt) {
      this.art.texture = this.pixelArtFor(geometry.picture.width, geometry.picture.height);
      this.art.width = geometry.picture.width;
      this.art.height = geometry.picture.height;
      this.art.position.set(geometry.picture.x, geometry.picture.y);
    } else {
      this.mount
        .rect(
          geometry.picture.x,
          geometry.picture.y,
          geometry.picture.width,
          geometry.picture.height,
        )
        .fill({ color: POSTCARD_PALETTE.paperShade });
    }

    this.placeCaption(geometry);
  }

  /**
   * The illustration cut down to one texel per UI pixel of its window.
   *
   * The source is a large generated picture, and its pixelated look is
   * deliberate: it hides the small artefacts of generated art and leaves the
   * fine detail to the imagination. That look used to come for free from the
   * 640x360 frame. Now the frame is the display's size
   * (`RENDER_AT_DISPLAY_RESOLUTION`), so the picture is sampled down here
   * instead — nearest-neighbour, the same sampling the coarse frame did — and
   * each texel is then drawn as a whole block of screen pixels.
   *
   * Redone only when the window's size changes. With no DOM (a headless
   * test) the source is shown as it is.
   */
  private pixelArtFor(width: number, height: number): Texture {
    const source = this.source;
    if (source === null) {
      return Texture.EMPTY;
    }
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const key = `${String(w)}:${String(h)}`;
    if (this.pixelArt !== null && key === this.pixelArtKey) {
      return this.pixelArt;
    }
    const image = source.source.texture.image as CanvasImageSource | null | undefined;
    if (typeof document === 'undefined' || image === null || image === undefined) {
      return source;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    if (context === null) {
      return source;
    }
    context.imageSmoothingEnabled = false;
    const frame = source.frame;
    context.drawImage(image, frame.x, frame.y, frame.width, frame.height, 0, 0, w, h);
    this.dropPixelArt();
    this.pixelArt = textureFromImage(canvas);
    this.pixelArtKey = key;
    return this.pixelArt;
  }

  private dropPixelArt(): void {
    this.pixelArt?.destroy(true);
    this.pixelArt = null;
    this.pixelArtKey = '';
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
