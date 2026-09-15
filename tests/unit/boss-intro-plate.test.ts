import { describe, expect, it } from 'vitest';
import { BossIntroPlate } from '../../src/render/boss-intro-plate.js';
import { textureFromPixels } from '../../src/render/gfx/index.js';
import { installPixelFonts } from '../../src/render/ui/font.js';

installPixelFonts();

/**
 * `BossIntroPlate` (`render/boss-intro-plate.ts`), in the order `app/main.ts`
 * actually drives it: the resize handler `place`s the plate at boot while it
 * is still hidden and has no art, and `show` arrives much later, on the
 * boss-room warmup edge, with a 1344×768 postcard texture. The first live
 * boss room after the postcard tier landed drew that texture at its native
 * size over the whole 640×360 frame — the top-left quarter of the picture and
 * nothing else — because only `place` ever sized the postcard, and `show`
 * did not re-run it. Hence the specific choreography below.
 */

const FRAME_WIDTH = 640;
const ART_W = 1344;
const ART_H = 768;

function keyArt() {
  return textureFromPixels(ART_W, ART_H, new Int32Array(ART_W * ART_H).fill(0x336633));
}

describe('BossIntroPlate', () => {
  it('shows postcard art fitted inside the plate when placed hidden and shown later with art', () => {
    const plate = new BossIntroPlate();
    plate.hide();
    plate.resize(FRAME_WIDTH);
    plate.place(FRAME_WIDTH / 2, 58);

    plate.show('Der Stier', 'en', undefined, undefined, keyArt());

    const bounds = plate.view.getLocalBounds();
    expect(plate.visible).toBe(true);
    // The whole plate — postcard, name, title — stays well inside the frame.
    expect(bounds.width).toBeLessThan(FRAME_WIDTH * 0.6);
    expect(bounds.height).toBeLessThan(260);
    expect(bounds.x).toBeGreaterThan(FRAME_WIDTH * 0.2);
  });

  it('is exactly the text-only banner with no art', () => {
    const plate = new BossIntroPlate();
    plate.resize(FRAME_WIDTH);
    plate.place(FRAME_WIDTH / 2, 58);
    plate.show('Die Große Kellerassel', 'en');
    const bounds = plate.view.getLocalBounds();
    expect(bounds.height).toBeLessThan(60);
    expect(bounds.y).toBeGreaterThanOrEqual(58);
  });
});
