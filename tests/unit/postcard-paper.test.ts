import { describe, expect, it } from 'vitest';
import { POSTCARD_PALETTE } from '../../src/render/palette.js';
import {
  postcardBoxForPicture,
  postcardBoxWithin,
  postcardCaptionWrapWidth,
  postcardGeometry,
  renderPostcardPixels,
} from '../../src/render/ui/postcard-paper.js';

/** `assets/art/bosses/*.png` and `assets/art/story/opening.png`'s own aspects. */
const BOSS_ART = 1344 / 768;
const STORY_ART = 1152 / 896;
/** `StoryCard`'s card at the game's 640×360 frame — the one divided back that ships. */
const STORY_CARD = { width: 640 - 24 * 2, height: 360 - 40 * 2 };

function countColour(
  pixels: { width: number; height: number; colours: Int32Array },
  colour: number,
): number {
  let found = 0;
  for (const value of pixels.colours) {
    if (value === colour) {
      found++;
    }
  }
  return found;
}

describe('postcard paper', () => {
  it('is a franked front when it carries no message', () => {
    const geometry = postcardGeometry(248, 183, { artAspect: BOSS_ART });
    expect(geometry.layout).toBe('front');
    expect(geometry.caption).toBeNull();
  });

  it('turns a wide card with a message into a divided back', () => {
    const geometry = postcardGeometry(STORY_CARD.width, STORY_CARD.height, {
      artAspect: STORY_ART,
      captionHeight: 60,
    });
    expect(geometry.layout).toBe('dividedBack');
    // Picture on the left, message on the right, neither over the other.
    expect(geometry.caption).not.toBeNull();
    expect(geometry.caption?.x).toBeGreaterThan(geometry.picture.x + geometry.picture.width);
  });

  it('falls back to a front when the card is too narrow to divide', () => {
    // A phone-ish frame, or a very large text scale: the message goes under the
    // picture rather than into a column two words wide (`docs/DECISIONS.md` #19
    // applied to a layout).
    const geometry = postcardGeometry(300, 240, { artAspect: STORY_ART, captionHeight: 60 });
    expect(geometry.layout).toBe('front');
    expect(geometry.caption?.y).toBeGreaterThan(geometry.picture.y + geometry.picture.height);
  });

  it('keeps the message clear of the franking on a front', () => {
    const width = 336;
    const geometry = postcardGeometry(width, 332, { artAspect: STORY_ART, captionHeight: 96 });
    const caption = geometry.caption;
    expect(caption).not.toBeNull();
    // The stamp and the cancel that runs off it own the band's right-hand end;
    // text wrapped to this width can never reach them.
    expect((caption?.x ?? 0) + (caption?.width ?? 0)).toBeLessThanOrEqual(width - 21 - 8);
  });

  it('wraps a caption to a width the geometry then agrees with', () => {
    const wrapWidth = postcardCaptionWrapWidth(STORY_CARD.width, STORY_CARD.height, {
      artAspect: STORY_ART,
    });
    // The two-step the class depends on: measure at this width, hand the
    // measured height back, and the band that comes out is exactly that wide.
    const geometry = postcardGeometry(STORY_CARD.width, STORY_CARD.height, {
      artAspect: STORY_ART,
      captionHeight: 60,
    });
    expect(geometry.caption?.width).toBe(wrapWidth);
  });

  it('mounts the picture at the art’s own aspect, inside the card', () => {
    const geometry = postcardGeometry(248, 183, { artAspect: BOSS_ART });
    const { picture } = geometry;
    expect(picture.width / picture.height).toBeCloseTo(BOSS_ART, 1);
    expect(picture.x).toBeGreaterThan(0);
    expect(picture.y).toBeGreaterThan(0);
    expect(picture.x + picture.width).toBeLessThan(248);
    expect(picture.y + picture.height).toBeLessThan(183);
  });

  it('punches the picture window out of the sheet for the illustration to show through', () => {
    const width = 248;
    const height = 183;
    const pixels = renderPostcardPixels(width, height, { artAspect: BOSS_ART });
    const { picture } = postcardGeometry(width, height, { artAspect: BOSS_ART });
    for (const [x, y] of [
      [picture.x, picture.y],
      [picture.x + picture.width - 1, picture.y + picture.height - 1],
    ] as const) {
      expect(pixels.colours[y * width + x]).toBe(-1);
    }
    // And the paper around it is not punched.
    expect(pixels.colours[(picture.y - 4) * width + picture.x]).not.toBe(-1);
  });

  /**
   * The regression this test exists for: the card box is built from
   * `postcardBoxForPicture`, and `renderPostcardPixels` silently drops the
   * franking when the foot is too shallow to hold a stamp. A boss card and the
   * title card both came out unfranked that way — the one detail that says
   * "postcard" missing from two of the three screens that exist to say it.
   */
  it('always has room to frank a card sized around its own picture', () => {
    for (const pictureWidth of [140, 180, 232, 300]) {
      for (const aspect of [BOSS_ART, STORY_ART, 832 / 1216]) {
        const box = postcardBoxForPicture(pictureWidth, aspect);
        const pixels = renderPostcardPixels(box.width, box.height, { artAspect: aspect });
        const where = [box.width, box.height].join('×');
        expect(
          countColour(pixels, POSTCARD_PALETTE.stampBlue),
          `no stamp on a ${where} card`,
        ).toBeGreaterThan(0);
        expect(
          countColour(pixels, POSTCARD_PALETTE.postmarkInk),
          `no cancellation on a ${where} card`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('franks a divided back too, up in the corner a stamp actually goes', () => {
    const pixels = renderPostcardPixels(STORY_CARD.width, STORY_CARD.height, {
      artAspect: STORY_ART,
      captionHeight: 60,
    });
    expect(countColour(pixels, POSTCARD_PALETTE.stampBlue)).toBeGreaterThan(0);
    const { picture } = postcardGeometry(STORY_CARD.width, STORY_CARD.height, {
      artAspect: STORY_ART,
      captionHeight: 60,
    });
    // Top-right corner, which is the message half — never over the picture.
    let leftmostStamp = STORY_CARD.width;
    for (let y = 0; y < STORY_CARD.height; y++) {
      for (let x = 0; x < STORY_CARD.width; x++) {
        if (pixels.colours[y * STORY_CARD.width + x] === POSTCARD_PALETTE.stampBlue) {
          leftmostStamp = Math.min(leftmostStamp, x);
        }
      }
    }
    expect(leftmostStamp).toBeGreaterThan(picture.x + picture.width);
  });

  it('fits a card into the box a caller has room for', () => {
    for (const [maxWidth, maxHeight] of [
      [220, 260],
      [400, 120],
      [140, 300],
    ] as const) {
      const box = postcardBoxWithin(maxWidth, maxHeight, 832 / 1216);
      expect(box.width).toBeLessThanOrEqual(maxWidth);
      expect(box.height).toBeLessThanOrEqual(maxHeight);
    }
  });

  it('draws the same sheet twice for the same card, and a different one per seed', () => {
    const first = renderPostcardPixels(200, 160, { artAspect: BOSS_ART, seed: 3 });
    const again = renderPostcardPixels(200, 160, { artAspect: BOSS_ART, seed: 3 });
    const other = renderPostcardPixels(200, 160, { artAspect: BOSS_ART, seed: 4 });
    expect(Array.from(again.colours)).toEqual(Array.from(first.colours));
    expect(Array.from(other.colours)).not.toEqual(Array.from(first.colours));
  });

  it('survives a degenerate box without throwing', () => {
    for (const [width, height] of [
      [0, 0],
      [1, 1],
      [12, 400],
    ] as const) {
      expect(() => renderPostcardPixels(width, height, { artAspect: BOSS_ART })).not.toThrow();
    }
  });
});
