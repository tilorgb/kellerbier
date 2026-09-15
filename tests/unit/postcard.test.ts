import { describe, expect, it } from 'vitest';
import { textureFromPixels } from '../../src/render/gfx/index.js';
import { Postcard } from '../../src/render/postcard.js';
import { StoryCard } from '../../src/render/story-card.js';
import { installPixelFonts } from '../../src/render/ui/font.js';
import { postcardGeometry } from '../../src/render/ui/postcard-paper.js';

installPixelFonts();

const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 360;
/** The opening beat's illustration, `assets/art/story/opening.png`. */
const STORY_ART = { width: 1152, height: 896 };

function art(width: number, height: number) {
  return textureFromPixels(width, height, new Int32Array(width * height).fill(0x336633));
}

const OPENING =
  "Opa's last Pfeitinger is empty. The full crate beside it is the same beer, but the label " +
  'is new: water, malt, hops — and raisins.\n\nAlois takes Opa’s Trink-Rucksack down off its ' +
  'hook, fills it with the tainted crate, and switches it from trinken to schießen.';

describe('Postcard', () => {
  it('mounts the illustration in the window the paper punched for it', () => {
    const card = new Postcard();
    card.setArt(art(STORY_ART.width, STORY_ART.height));
    card.resize(248, 190);

    const { picture } = postcardGeometry(248, 190, {
      artAspect: STORY_ART.width / STORY_ART.height,
    });
    const bounds = card.view.getLocalBounds();
    // The card, plus the shadow it casts past its own bottom-right corner.
    expect(bounds.width).toBeGreaterThanOrEqual(248);
    expect(picture.x).toBeGreaterThan(0);
    expect(picture.x + picture.width).toBeLessThan(248);
  });

  it('is laid out the same whether the art or the box arrives first', () => {
    const artFirst = new Postcard({ seed: 2 });
    artFirst.setArt(art(STORY_ART.width, STORY_ART.height));
    artFirst.resize(300, 220);

    const boxFirst = new Postcard({ seed: 2 });
    boxFirst.resize(300, 220);
    boxFirst.setArt(art(STORY_ART.width, STORY_ART.height));

    expect(boxFirst.view.getLocalBounds().width).toBe(artFirst.view.getLocalBounds().width);
    expect(boxFirst.view.getLocalBounds().height).toBe(artFirst.view.getLocalBounds().height);
  });

  it('sets a long message without it running off the card', () => {
    const card = new Postcard();
    card.setArt(art(STORY_ART.width, STORY_ART.height));
    card.setCaption(OPENING);
    card.resize(592, 280);

    const bounds = card.view.getLocalBounds();
    // Nothing sticks out to the left or above, and the only thing past the
    // card's own box is the shadow.
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.width).toBeLessThanOrEqual(592 + 4);
    expect(bounds.height).toBeLessThanOrEqual(280 + 4);
  });
});

describe('StoryCard', () => {
  it('leaves the room visible around the card it is holding up', () => {
    const beat = new StoryCard('en');
    beat.setArt(art(STORY_ART.width, STORY_ART.height));
    beat.resize(FRAME_WIDTH, FRAME_HEIGHT);
    beat.show(OPENING);

    expect(beat.visible).toBe(true);
    // The dim covers the frame; the card itself does not, which is the whole
    // point of it no longer being full-bleed. The card is the second child —
    // the dim is drawn first, under it.
    const card = beat.view.children[1];
    const cardBounds = card?.getLocalBounds();
    expect(cardBounds?.width ?? FRAME_WIDTH).toBeLessThan(FRAME_WIDTH);
    expect(cardBounds?.height ?? FRAME_HEIGHT).toBeLessThan(FRAME_HEIGHT);
  });

  it('shows and hides without needing a resize in between', () => {
    const beat = new StoryCard('en');
    beat.resize(FRAME_WIDTH, FRAME_HEIGHT);
    beat.show(OPENING);
    expect(beat.visible).toBe(true);
    beat.hide();
    expect(beat.visible).toBe(false);
  });
});
