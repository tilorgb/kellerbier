import type { PixelArt } from './pixel-art.js';

/**
 * The HUD's icon set (#154), authored in `pixel-art.ts`'s role format.
 *
 * Sized against the font rather than against the world: the font cell is 8
 * rows, so an icon that sits on a text row is 7-9 tall and one that heads a
 * row of its own is up to 12. Nothing here is 16×16, because nothing here is
 * a tile — see `docs/DECISIONS.md` #43.
 *
 * Silhouette first, colour second. Every icon has to survive being drawn in
 * one of several role palettes (a Bratwurst is red, a Weißwurst pale, a
 * Blutwurst near-black — one bitmap, three sets of roles), so a reading that
 * depends on its colour is a reading that breaks on the second use.
 * `CONTRIBUTING.md`'s art row says the same thing about enemies; it is more
 * true, not less, of something drawn at nine pixels across.
 */

/**
 * A whole Wurst — tied off at both ends, one accent-role fleck part way down
 * (a grill mark on Bratwurst, a fat fleck on Blutwurst; invisible on
 * Weißwurst, whose accent role is set to its own fill colour).
 */
export const ICON_WURST_FULL: PixelArt = [
  '...ooo...',
  '...oho...',
  '...ofo...',
  '..offfo..',
  '.ohffffo.',
  '.ohfaffo.',
  '.ohffffo.',
  '.ohfaffo.',
  '..offfo..',
  '...ofo...',
  '...oho...',
  '...ooo...',
];

/** Half a Wurst — split clean down the middle, per health-food-redesign's sign-off: the top piece, tied end and all, outlined at the cut. */
export const ICON_WURST_HALF: PixelArt = [
  '...ooo...',
  '...oho...',
  '...ofo...',
  '..offfo..',
  '.ohffffo.',
  '.ooooooo.',
];

/** An empty Wurst. Drawn, not removed: a spent slot has to leave its outline behind or the row gets shorter as you lose. */
export const ICON_WURST_EMPTY: PixelArt = [
  '...ooo...',
  '...o.o...',
  '...o.o...',
  '..o...o..',
  '.o.....o.',
  '.o.....o.',
  '.o.....o.',
  '.o.....o.',
  '..o...o..',
  '...o.o...',
  '...o.o...',
  '...ooo...',
];

/** A Biermarke — the beer token the Wiesn actually runs on, and this game's coin. */
export const ICON_BIERMARKE: PixelArt = [
  '..oooo..',
  '.ohhhho.',
  'ohaaaaho',
  'oaaaaaao',
  'oaaaaaao',
  'ohaaaaho',
  '.oaaaao.',
  '..oooo..',
];

/** A Kellerschlüssel — bow, shaft, two teeth. */
export const ICON_KEY: PixelArt = [
  '.ooo.......',
  'oa.ao......',
  'oaaaaaaaaaa',
  'oa.ao.a.a..',
  '.ooo.......',
];

/** A Bierfassl — the hooped keg that stands in for a bomb. */
export const ICON_FASSL: PixelArt = [
  '.ooooooo.',
  'ohfffffho',
  'oaaaaaaao',
  'ohfffffho',
  'ohfffffho',
  'oaaaaaaao',
  'ohfffffho',
  '.ooooooo.',
];

/** A drop — the Promille meter's own mark, and what a tier icon is built from. */
export const ICON_PROMILLE: PixelArt = [
  '...o...',
  '..ofo..',
  '..ofo..',
  '.offfo.',
  '.offfo.',
  'offfffo',
  'offfffo',
  'offfffo',
  '.ooooo.',
];

/** A padlock — a locked door, and a gated item that is currently shut. */
export const ICON_LOCK: PixelArt = [
  '..oooo..',
  '.of..fo.',
  '.of..fo.',
  '.of..fo.',
  'oooooooo',
  'ofaaaafo',
  'ofa..afo',
  'ofa..afo',
  'ofaaaafo',
  'oooooooo',
];

/** A skull — a curse (#49), and anything else that is working against the player. */
export const ICON_SKULL: PixelArt = [
  '.oooooo.',
  'offffffo',
  'oo.ff.oo',
  'offffffo',
  'offffffo',
  '.offffo.',
  '.o.oo.o.',
  '..oooo..',
];

/** A star — item quality, and the "this one matters" mark on a pedestal. */
export const ICON_STAR: PixelArt = [
  '....o....',
  '...oao...',
  '...oao...',
  'oooaaaooo',
  '.oaaaaao.',
  '..oaaao..',
  '..oaaao..',
  '.oao.oao.',
  '.oo...oo.',
];

/** A tick — a setting that is on. */
export const ICON_TICK: PixelArt = [
  '.....oo',
  '....oao',
  'o...ao.',
  'oa.ao..',
  '.oao...',
  '..o....',
];

/** A caret — which row the gamepad is on, next to the focus ring rather than instead of it. */
export const ICON_CARET: PixelArt = [
  'o...',
  'oo..',
  'oao.',
  'oaao',
  'oaao',
  'oaao',
  'oao.',
  'oo..',
  'o...',
];

/** Every icon by name — the kit's own gallery walks this rather than a hand-kept list. */
export const UI_ICONS: Readonly<Record<string, PixelArt>> = {
  'wurst-full': ICON_WURST_FULL,
  'wurst-half': ICON_WURST_HALF,
  'wurst-empty': ICON_WURST_EMPTY,
  biermarke: ICON_BIERMARKE,
  key: ICON_KEY,
  fassl: ICON_FASSL,
  promille: ICON_PROMILLE,
  lock: ICON_LOCK,
  skull: ICON_SKULL,
  star: ICON_STAR,
  tick: ICON_TICK,
  caret: ICON_CARET,
};
