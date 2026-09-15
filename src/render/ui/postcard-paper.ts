import { textureFromPixels, type Texture } from '../gfx/index.js';
import { POSTCARD_PALETTE, TITLE_PALETTE } from '../palette.js';

/**
 * The card stock a postcard is printed on, drawn as pixels rather than fetched
 * as a PNG.
 *
 * ## Why this exists
 *
 * `docs/DECISIONS.md` #98 made "a postcard" the game's way of showing a
 * picture — the title screen, the opening story beat and a boss's reveal are
 * one physical object with a different illustration in it. What actually
 * shipped was a *frame*: a near-black plate with a two-pixel gold rule around
 * it. The title screen still read as a postcard, but only because its own
 * illustration happens to carry a printed cream border baked into the picture;
 * the story beat (a full-bleed painting stretched edge to edge) and the boss
 * plate (a bare 1344×768 crop floating over the room) carried no such hint, so
 * a player had no way to know the three were meant to be the same object at
 * all.
 *
 * So the card stops being a border and starts being paper: an off-white sheet
 * with print grain and worn edges, the picture *mounted on* it inside an ink
 * keyline, and — the one detail that says "postcard" in a single glance and no
 * words — a franked corner: a perforated stamp carrying the Raute, struck by a
 * postmark that clips its edge and runs off onto the paper.
 *
 * ## Two layouts, picked by whether the card carries a message
 *
 * A card with no text on it is a **front**: the picture mounted high, the
 * franking down in the foot where it cannot cover the illustration. That is
 * the title screen's card and a boss's.
 *
 * A card wide enough to carry one *and* given a caption is a **divided back**:
 * the picture on the left, the message set to the right of a printed divider,
 * the franking up in the corner where a stamp actually goes. That is the
 * opening story beat, whose two paragraphs never fit under a picture without
 * squeezing the picture down to a strip — a real postcard solves that by
 * turning the card over, and so does this.
 *
 * The choice is made here, from the card's own box, rather than asked of every
 * caller: a card too narrow to divide falls back to the front layout with its
 * caption in the foot, which is `docs/DECISIONS.md` #19's graceful degradation
 * applied to a layout instead of to content.
 *
 * ## Pure, for the same reasons `ui/ornament.ts` and `ui/title.ts` are
 *
 * `renderPostcardPixels` needs no renderer and no DOM, so the specimen sheets
 * this design was signed off from (`tools/art/postcard-specimens.mjs`) are
 * drawn by the same code that draws the card a player sees — `CLAUDE.md`'s
 * UI-art shortcut — and a test can assert the geometry without standing a
 * scene up. `postcardGeometry` is deliberately separate and called by both:
 * `render/postcard.ts` positions the illustration and the caption from it, and
 * `renderPostcardPixels` draws the paper around exactly those rectangles, so
 * the two can never disagree about where the picture's window is.
 *
 * Everything here is measured in UI pixels (`ui/text.ts`'s note), and the grid
 * this returns is 1:1 with them — the card is drawn at the UI layer's own
 * integer scale, never resampled.
 */

/** A box in card-local UI pixels. */
export interface PostcardRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Which way round the card is printed — see this file's doc comment. */
export type PostcardLayout = 'front' | 'dividedBack';

export interface PostcardPaperOptions {
  /**
   * Width ÷ height of the illustration that will be mounted. The picture's
   * window is fitted to it, so the paper margins absorb the difference and a
   * picture is never letterboxed against paper inside its own keyline.
   * Omitted (no art loaded yet) leaves the window at the full available box.
   */
  readonly artAspect?: number;
  /**
   * UI pixels of caption text to make room for — the caller's already-wrapped
   * text height, measured at `postcardCaptionWrapWidth`. `0` for a card with
   * no caption at all, which is what makes it a front.
   */
  readonly captionHeight?: number;
  /** Deterministic seed for grain and foxing, so one card keeps its own paper across a resize. */
  readonly seed?: number;
}

export interface PostcardGeometry {
  readonly layout: PostcardLayout;
  /** Where the illustration is mounted — inside the keyline, not including it. */
  readonly picture: PostcardRect;
  /** The paper the caller's caption text is set in, or `null` when none was asked for. */
  readonly caption: PostcardRect | null;
}

/** Paper left around the picture. */
const MARGIN = 8;
/**
 * Paper under the picture on a front. Deep enough to actually frank: the
 * stamp is 25 tall and the picture's keyline and the card's own bottom margin
 * each take their bite out of this, so anything tighter silently drops the
 * franking (`renderPostcardPixels` will not overflow a band that cannot hold
 * it) and the card loses the one detail that says postcard.
 */
const FOOT = 42;
/** Between the picture's keyline and the caption's first line. */
const CAPTION_GAP = 8;
/** Between the picture's half of a divided back and the message's, either side of the divider. */
const DIVIDER_GUTTER = 10;

/** The franking block: a perforated stamp and the postmark that cancels it. */
const STAMP_WIDTH = 21;
const STAMP_HEIGHT = 25;
const POSTMARK_RADIUS = 12;
/** How far the cancellation's bars run out of the ring, to the left of the stamp. */
const CANCEL_REACH = 13;
/** Paper the whole franking block needs to itself — the stamp, the ring clipping it, and the bars. */
const FRANKING_WIDTH = STAMP_WIDTH + POSTMARK_RADIUS + CANCEL_REACH + 12;

/**
 * Below this, a card is too narrow to divide: the message column would be
 * barely wider than the franking sitting above it.
 */
const MIN_DIVIDED_WIDTH = 360;
/** And a card taller than it is wide is a picture postcard whichever way you turn it. */
const MIN_DIVIDED_ASPECT = 1.3;

/** How far the card's own shadow falls, down and to the right. Not part of the card's box. */
export const POSTCARD_SHADOW_OFFSET = 3;

export function postcardLayoutFor(
  width: number,
  height: number,
  options: PostcardPaperOptions = {},
): PostcardLayout {
  const captionHeight = Math.max(0, Math.round(options.captionHeight ?? 0));
  if (captionHeight === 0) {
    return 'front';
  }
  if (width < MIN_DIVIDED_WIDTH || width / Math.max(1, height) < MIN_DIVIDED_ASPECT) {
    return 'front';
  }
  return 'dividedBack';
}

/** Where the message half of a divided back starts. */
function messageLeft(width: number): number {
  const half = Math.floor((width - MARGIN * 2 - DIVIDER_GUTTER * 2) / 2);
  return MARGIN + half + DIVIDER_GUTTER * 2;
}

/**
 * How wide the caption wraps, for a caller that has to measure its text
 * *before* it knows how much room the text needs. Deliberately independent of
 * `captionHeight`, so that two-step is not circular: the wrap width falls out
 * of the card's own box, and the measured height then comes back in as
 * `captionHeight`.
 */
export function postcardCaptionWrapWidth(
  width: number,
  height: number,
  options: PostcardPaperOptions = {},
): number {
  // The layout question here is only "would a caption be divided", so it is
  // asked with a caption present rather than with the caller's unmeasured one.
  const layout = postcardLayoutFor(width, height, { ...options, captionHeight: 1 });
  if (layout === 'front') {
    return Math.max(1, width - MARGIN * 2 - FRANKING_WIDTH);
  }
  return Math.max(1, width - MARGIN - messageLeft(width));
}

/** Fits a picture to `aspect` inside `box`, centred. */
function mount(box: PostcardRect, aspect: number | undefined): PostcardRect {
  let pictureWidth = box.width;
  let pictureHeight = box.height;
  if (aspect !== undefined && aspect > 0) {
    const fit = Math.min(box.width / aspect, box.height);
    pictureHeight = Math.max(1, Math.round(fit));
    pictureWidth = Math.max(1, Math.round(fit * aspect));
  }
  return {
    x: Math.round(box.x + (box.width - pictureWidth) / 2),
    y: Math.round(box.y + (box.height - pictureHeight) / 2),
    width: pictureWidth,
    height: pictureHeight,
  };
}

export function postcardGeometry(
  width: number,
  height: number,
  options: PostcardPaperOptions = {},
): PostcardGeometry {
  const captionHeight = Math.max(0, Math.round(options.captionHeight ?? 0));
  const layout = postcardLayoutFor(width, height, options);

  if (layout === 'dividedBack') {
    const left = messageLeft(width);
    const picture = mount(
      {
        x: MARGIN,
        y: MARGIN,
        width: Math.max(1, left - DIVIDER_GUTTER * 2 - MARGIN),
        height: Math.max(1, height - MARGIN * 2),
      },
      options.artAspect,
    );
    // The message column starts under the franking, which owns the card's
    // top-right corner the way a stamp owns a real one's, and runs to the foot:
    // it is the *column* that is reserved here, not the text's own height, so a
    // short message sits in the middle of its half rather than clinging to the
    // franking above it. `captionHeight` has already done its work by the time
    // this branch is reached — it is what chose this layout.
    const top = MARGIN + STAMP_HEIGHT + CAPTION_GAP;
    return {
      layout,
      picture,
      caption: {
        x: left,
        y: top,
        width: Math.max(1, width - MARGIN - left),
        height: Math.max(1, height - MARGIN - 10 - top),
      },
    };
  }

  const band = captionHeight > 0 ? captionHeight + CAPTION_GAP + MARGIN : FOOT;
  const picture = mount(
    {
      x: MARGIN,
      y: MARGIN,
      width: Math.max(1, width - MARGIN * 2),
      height: Math.max(1, height - MARGIN - band),
    },
    options.artAspect,
  );
  if (captionHeight === 0) {
    return { layout, picture, caption: null };
  }
  return {
    layout,
    picture,
    caption: {
      // Set against the card's own margin rather than the picture's, so the
      // wrap width can be known before the picture's box is (see
      // `postcardCaptionWrapWidth`). The franking keeps the band's right end.
      x: MARGIN,
      y: picture.y + picture.height + CAPTION_GAP,
      width: Math.max(1, width - MARGIN * 2 - FRANKING_WIDTH),
      height: captionHeight,
    },
  };
}

/**
 * The card box that mounts a `pictureWidth`-wide picture of `artAspect` as a
 * front — what a caller sizing a card *around* an illustration needs, rather
 * than one fitting an illustration into a box it already chose.
 * `BossIntroPlate` and `TitleScreen` both size their cards this way.
 */
export function postcardBoxForPicture(
  pictureWidth: number,
  artAspect: number,
): { width: number; height: number } {
  const picture = Math.max(1, Math.round(pictureWidth));
  return {
    width: picture + MARGIN * 2,
    height: Math.round(picture / Math.max(0.01, artAspect)) + MARGIN + FOOT,
  };
}

/**
 * The largest front-layout card that fits in `maxWidth`×`maxHeight` with a
 * picture of `artAspect` mounted on it — for a caller that has a hole in its
 * layout to fill rather than a picture size in mind. `TitleScreen`'s right pane
 * is the case: the pane's box is fixed, and the card should be as big as the
 * pane allows without the foot running off the bottom of it.
 */
export function postcardBoxWithin(
  maxWidth: number,
  maxHeight: number,
  artAspect: number,
): { width: number; height: number } {
  const byWidth = postcardBoxForPicture(maxWidth - MARGIN * 2, artAspect);
  if (byWidth.height <= maxHeight) {
    return byWidth;
  }
  const pictureHeight = maxHeight - MARGIN - FOOT;
  return postcardBoxForPicture(Math.max(1, pictureHeight * artAspect), artAspect);
}

/** A rasterised card: one colour per pixel, `-1` where the sheet is not. */
export interface PostcardPixels {
  readonly width: number;
  readonly height: number;
  readonly colours: Int32Array;
}

class Sheet {
  readonly width: number;
  readonly height: number;
  readonly colours: Int32Array;

  constructor(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.colours = new Int32Array(this.width * this.height).fill(-1);
  }

  set(x: number, y: number, colour: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }
    this.colours[y * this.width + x] = colour;
  }

  fillRect(x: number, y: number, width: number, height: number, colour: number): void {
    for (let row = y; row < y + height; row++) {
      for (let column = x; column < x + width; column++) {
        this.set(column, row, colour);
      }
    }
  }

  strokeRect(x: number, y: number, width: number, height: number, colour: number): void {
    for (let column = x; column < x + width; column++) {
      this.set(column, y, colour);
      this.set(column, y + height - 1, colour);
    }
    for (let row = y; row < y + height; row++) {
      this.set(x, row, colour);
      this.set(x + width - 1, row, colour);
    }
  }
}

/**
 * The paper's own noise: a hash rather than a random number generator, so a
 * card redrawn at the same size comes back with the same grain in the same
 * places and a resize does not make the sheet crawl.
 */
function grainAt(x: number, y: number, seed: number): number {
  let value = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function drawPaper(sheet: Sheet, seed: number): void {
  const { width, height } = sheet;
  sheet.fillRect(0, 0, width, height, POSTCARD_PALETTE.paper);

  // Print grain, then a sparser scatter of foxing — the two together are what
  // keep a flat fill from reading as a UI panel at this size.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const noise = grainAt(x, y, seed);
      if (noise > 0.93) {
        sheet.set(x, y, POSTCARD_PALETTE.paperGrain);
      } else if (noise > 0.925) {
        sheet.set(x, y, POSTCARD_PALETTE.paperShade);
      }
    }
  }

  // A cut edge: the sheet darkens into its own rim, and the rim is bitten
  // irregularly so the card never reads as a rectangle drawn with a pen.
  sheet.strokeRect(1, 1, width - 2, height - 2, POSTCARD_PALETTE.paperGrain);
  for (let x = 0; x < width; x++) {
    if (grainAt(x, 0, seed + 7) > 0.6) {
      sheet.set(x, 1, POSTCARD_PALETTE.paperShade);
    }
    if (grainAt(x, height - 1, seed + 7) > 0.6) {
      sheet.set(x, height - 2, POSTCARD_PALETTE.paperShade);
    }
  }
  for (let y = 0; y < height; y++) {
    if (grainAt(0, y, seed + 11) > 0.6) {
      sheet.set(1, y, POSTCARD_PALETTE.paperShade);
    }
    if (grainAt(width - 1, y, seed + 11) > 0.6) {
      sheet.set(width - 2, y, POSTCARD_PALETTE.paperShade);
    }
  }

  // The ink keyline around the whole card, with the corners knocked off: a
  // postcard has slightly rounded corners, and one missing pixel per corner is
  // the whole of that at this scale.
  sheet.strokeRect(0, 0, width, height, POSTCARD_PALETTE.ink);
  for (const [x, y] of [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ] as const) {
    sheet.set(x, y, -1);
  }
}

/** The picture's own printed edge: an ink keyline with a hairline of paper showing inside it. */
function drawPictureKeyline(sheet: Sheet, picture: PostcardRect): void {
  sheet.strokeRect(
    picture.x - 2,
    picture.y - 2,
    picture.width + 4,
    picture.height + 4,
    POSTCARD_PALETTE.paperGrain,
  );
  sheet.strokeRect(
    picture.x - 1,
    picture.y - 1,
    picture.width + 2,
    picture.height + 2,
    POSTCARD_PALETTE.ink,
  );
  // The window itself is punched out — the illustration sprite is what fills
  // it, and a colour under a sprite is a colour nobody ever sees.
  sheet.fillRect(picture.x, picture.y, picture.width, picture.height, -1);
}

/** A perforated stamp carrying the Raute — the one motif that says where the card was posted. */
function drawStamp(sheet: Sheet, x: number, y: number): void {
  const { paper, paperShade, stampInk, stampBlue, stampPaper } = POSTCARD_PALETTE;
  sheet.fillRect(x, y, STAMP_WIDTH, STAMP_HEIGHT, stampPaper);

  // Perforations: every other edge pixel bitten back out to the card's own
  // paper, which is what a torn-from-the-sheet edge reads as once it is only
  // one pixel deep.
  for (let column = 0; column < STAMP_WIDTH; column++) {
    if (column % 2 === 1) {
      sheet.set(x + column, y, paper);
      sheet.set(x + column, y + STAMP_HEIGHT - 1, paper);
    }
  }
  for (let row = 0; row < STAMP_HEIGHT; row++) {
    if (row % 2 === 1) {
      sheet.set(x, y + row, paper);
      sheet.set(x + STAMP_WIDTH - 1, y + row, paper);
    }
  }
  // A shadow under the stamp's own edge: it is a second piece of paper stuck
  // to the first, and that is the only thing that says so at this size.
  for (let column = 1; column < STAMP_WIDTH; column++) {
    sheet.set(x + column + 1, y + STAMP_HEIGHT, paperShade);
  }

  sheet.strokeRect(x + 2, y + 2, STAMP_WIDTH - 4, STAMP_HEIGHT - 4, stampInk);
  sheet.fillRect(x + 3, y + 3, STAMP_WIDTH - 6, STAMP_HEIGHT - 6, stampPaper);

  // The Raute itself — the flag's lozenge, four cells of it, blue on white.
  const fieldX = x + 4;
  const fieldY = y + 4;
  const fieldWidth = STAMP_WIDTH - 8;
  const fieldHeight = STAMP_HEIGHT - 12;
  const cell = 5;
  const centre = (cell - 1) / 2;
  for (let row = 0; row < fieldHeight; row++) {
    for (let column = 0; column < fieldWidth; column++) {
      const diamond =
        Math.abs((column % cell) - centre) + Math.abs((row % cell) - centre) <= centre;
      sheet.set(fieldX + column, fieldY + row, diamond ? stampBlue : stampPaper);
    }
  }
  // The engraved band along the foot, where a denomination would be printed.
  // Left wordless on purpose: a stamp is exactly the kind of place an agent
  // would invent a Bavarian place name, and naming things is the project
  // owner's (`CLAUDE.md`, `docs/CONTENT_BIBLE.md` §0).
  sheet.fillRect(x + 4, y + STAMP_HEIGHT - 7, STAMP_WIDTH - 8, 3, stampInk);
  for (let column = 0; column < STAMP_WIDTH - 8; column += 2) {
    sheet.set(fieldX + column, y + STAMP_HEIGHT - 6, stampPaper);
  }
}

/**
 * The cancellation: a ring and the bars that run out of it, struck so the ring
 * clips the stamp's left edge and the rest lands on the paper — a strike
 * centred on the stamp would bury the Raute under it at this size, and the
 * stamp is the half of the franking that carries the motif. Dithered rather
 * than solid: a rubber stamp never prints evenly, and a solid ring this size
 * reads as a drawn circle instead of as ink.
 */
function drawPostmark(sheet: Sheet, centreX: number, centreY: number): void {
  const ink = POSTCARD_PALETTE.postmarkInk;
  const radius = POSTMARK_RADIUS;
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const distance = Math.sqrt(x * x + y * y);
      if (distance > radius || distance <= radius - 1.2) {
        continue;
      }
      if (grainAt(centreX + x, centreY + y, 31) > 0.15) {
        sheet.set(centreX + x, centreY + y, ink);
      }
    }
  }
  // Two short rules inside the ring, where the date would be struck. Marks
  // rather than characters: a legible date is a piece of fiction nobody has
  // written, and an illegible one at this size is what the real thing looks
  // like anyway.
  for (const offset of [-2, 1]) {
    for (let x = -4; x <= 4; x++) {
      if (grainAt(centreX + x, centreY + offset, 41) > 0.3) {
        sheet.set(centreX + x, centreY + offset, ink);
      }
    }
  }
  // The killer bars, running left out of the ring.
  for (const offset of [-3, 3]) {
    const y = centreY + offset;
    for (let x = centreX - radius - CANCEL_REACH; x < centreX - radius; x++) {
      if (grainAt(x, y, 37) > 0.12) {
        sheet.set(x, y, ink);
      }
    }
  }
}

/** A thin printed rule, gold over its own shade — the same two colours a card's border has always used. */
function drawRule(sheet: Sheet, x: number, y: number, width: number): void {
  for (let column = x; column < x + width; column++) {
    sheet.set(column, y, TITLE_PALETTE.rule);
    sheet.set(column, y + 1, TITLE_PALETTE.ruleShade);
  }
}

/** The divider down the back of a posted card, between the picture and the message. */
function drawVerticalRule(sheet: Sheet, x: number, y: number, height: number): void {
  for (let row = y; row < y + height; row++) {
    sheet.set(x, row, TITLE_PALETTE.rule);
    sheet.set(x + 1, row, TITLE_PALETTE.ruleShade);
  }
}

/** The dotted line an address would be written along. */
function drawDottedRule(sheet: Sheet, x: number, y: number, width: number): void {
  for (let column = x; column < x + width; column++) {
    if (column % 3 === 0) {
      sheet.set(column, y, POSTCARD_PALETTE.paperShade);
    }
  }
}

/**
 * The card, `width`×`height` UI pixels, with its picture window punched out
 * (`-1`) for the illustration sprite to show through.
 */
export function renderPostcardPixels(
  width: number,
  height: number,
  options: PostcardPaperOptions = {},
): PostcardPixels {
  const sheet = new Sheet(width, height);
  const geometry = postcardGeometry(sheet.width, sheet.height, options);
  const { picture, caption } = geometry;
  drawPaper(sheet, options.seed ?? 1);
  drawPictureKeyline(sheet, picture);

  if (geometry.layout === 'dividedBack' && caption !== null) {
    drawVerticalRule(
      sheet,
      picture.x + picture.width + DIVIDER_GUTTER + 1,
      MARGIN,
      sheet.height - MARGIN * 2,
    );
    const stampX = sheet.width - MARGIN - STAMP_WIDTH;
    drawStamp(sheet, stampX, MARGIN);
    drawPostmark(sheet, stampX - 6, MARGIN + STAMP_HEIGHT - 8);
    drawDottedRule(sheet, caption.x, sheet.height - MARGIN - 6, caption.width);
    return { width: sheet.width, height: sheet.height, colours: sheet.colours };
  }

  // A front: the franking sits in the foot, clear of the picture. The
  // illustration is the thing a player is being shown, and a stamp across its
  // corner buys the postcard read at the picture's expense.
  const stampX = sheet.width - MARGIN - STAMP_WIDTH;
  const bandTop = picture.y + picture.height + 2;
  const bandHeight = sheet.height - MARGIN - bandTop;
  const stampY = Math.round(bandTop + (bandHeight - STAMP_HEIGHT) / 2);
  if (bandHeight >= STAMP_HEIGHT && stampX > picture.x + FRANKING_WIDTH) {
    drawStamp(sheet, stampX, stampY);
    drawPostmark(sheet, stampX - 6, stampY + Math.round(STAMP_HEIGHT / 2));
  }
  if (caption !== null) {
    drawRule(sheet, picture.x, caption.y - 5, picture.width);
  }

  return { width: sheet.width, height: sheet.height, colours: sheet.colours };
}

export function postcardTexture(
  width: number,
  height: number,
  options: PostcardPaperOptions = {},
): Texture {
  const { colours } = renderPostcardPixels(width, height, options);
  return textureFromPixels(Math.max(1, width), Math.max(1, height), colours);
}
