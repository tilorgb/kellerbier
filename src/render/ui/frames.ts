import type { PixelArt } from './pixel-art.js';

/**
 * The kit's nine-slice frames (#154), authored in `pixel-art.ts`'s role format.
 *
 * Every frame is 9×9 with 3-pixel corners: rows and columns 3-5 are what
 * `NineSliceSprite` stretches, so a panel of any size keeps a one-pixel border
 * and a one-pixel bevel rather than a border that grows with the box. That is
 * the whole reason these are nine-slices instead of a texture per panel size —
 * a 2× wide panel drawn from a stretched 18×18 texture has a two-pixel border,
 * which at this scale reads as a different frame, not a bigger one.
 *
 * The middle rows are deliberately identical to each other (and the middle
 * columns to each other), so nothing depends on *where* in the stretch band a
 * pixel came from.
 */

/**
 * The panel every HUD plate and menu box is drawn on.
 *
 * **Bierdeckl**: chamfered corners, a hard outline, and one amber rim inside
 * it on a dark field. Chosen over a plain bevelled slab and over an
 * enamel-sign double border because it is the only one of the three with a
 * voice — it reads as a beer mat or a brewery sign, which is the game this
 * is — while staying dark enough to sit over any of the seven floors. The
 * amber is not a new colour: an open door and Der Keller's one hanging bulb
 * are already this exact value.
 *
 * The chamfer is a real trade. Four corner pixels are transparent, so the
 * room shows through them; that is what stops a panel from reading as a
 * rectangle stamped on the screen, and it is why nothing important may be
 * drawn within a pixel of a panel's corner.
 */
export const FRAME_PANEL: PixelArt = [
  '..ooooo..',
  '.oaaaaao.',
  'oafffffao',
  'oafffffao',
  'oafffffao',
  'oafffffao',
  'oafffffao',
  '.oaaaaao.',
  '..ooooo..',
];

/**
 * A button, a menu row, a settings row — the panel's chamfer with a bevel
 * instead of a rim: lit along the top, shadowed along the bottom, so a stack
 * of them reads as a stack rather than as five panels.
 */
export const FRAME_BUTTON: PixelArt = [
  '..ooooo..',
  '.ohhhhho.',
  'offfffffo',
  'offfffffo',
  'offfffffo',
  'offfffffo',
  'offfffffo',
  '.oaaaaao.',
  '..ooooo..',
];

/**
 * A sunken well: a slider track, a Promille meter, a charge bar.
 *
 * The bevel is the button's, inverted — shadow on top, highlight underneath —
 * which is the one cue that says "this is a hole with something in it" rather
 * than "this is a thing sitting on the panel." Bar fills are drawn *inside*
 * it, so the fill never has to draw its own border.
 */
export const FRAME_WELL: PixelArt = [
  '..ooooo..',
  '.oaaaaao.',
  'offfffffo',
  'offfffffo',
  'offfffffo',
  'offfffffo',
  'offfffffo',
  '.ohhhhho.',
  '..ooooo..',
];

/**
 * The slot an item sits in — a well with its corners marked, so an empty slot
 * still reads as a slot rather than as a hole in the panel.
 */
export const FRAME_SLOT: PixelArt = [
  '..ooooo..',
  '.oaaaaao.',
  'oaf...fao',
  'of.....fo',
  'of.....fo',
  'of.....fo',
  'oaf...fao',
  '.ohhhhho.',
  '..ooooo..',
];

/**
 * The gamepad focus ring (#53).
 *
 * Corner brackets rather than a full outline, and drawn *outside* the thing it
 * marks: a ring that traced the element would be one more border on a screen
 * that already has several, and at 1× it would be indistinguishable from the
 * button's own edge. Brackets are unmistakably an annotation.
 *
 * Not a nine-slice — the corners must not stretch — so `kit.ts` draws four
 * copies of one corner texture, mirrored.
 */
export const FOCUS_CORNER: PixelArt = ['aaaa', 'aoo.', 'ao..', 'a...'];

/** A slider's knob. Deliberately taller than its track, so it reads as sitting *on* the track. */
export const KNOB: PixelArt = ['ooooo', 'ohhho', 'ohfho', 'ohfho', 'ohfho', 'oaaao', 'ooooo'];

/** Corner size of every nine-slice frame in this file. */
export const FRAME_CORNER = 3;
