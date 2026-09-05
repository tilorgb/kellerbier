import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanSprites } from '../../tools/art/scan.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { inkedBounds } from '../../tools/art/validate.mjs';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { ENEMY_PROFILES, ENEMY_SIZE_BY_NAME } from '../../src/sim/enemy/size.js';
import { ACTOR_PIXELS_PER_UNIT } from '../../src/render/resolution.js';

/**
 * The check that was missing, and whose absence is the whole of
 * `docs/DECISIONS.md` #45.
 *
 * The art pipeline was well guarded on everything except the one number that
 * decides how large a creature reads. `validateSpriteSize` range-checks a
 * canvas against a category box wide enough for a woodlouse and a tractor
 * alike; `findOffPalettePixel` catches a borrowed colour;
 * `sprite-coverage.test.ts` catches art that does not exist;
 * `animated-sprites.test.ts` catches a clip pointing past the end of a strip.
 * Nothing compared a sprite to the collider it would be drawn over — which is
 * why the Kellerassel's redraw grew it to 2.24x its on-screen area, through a
 * reviewed pull request, with a green suite: no check in the tree was looking
 * at the number that changed.
 *
 * Now that a body is drawn at `ACTOR_SPRITE_SCALE` — one authored pixel per
 * internal pixel, always — the comparison is finally a fair one, because
 * authored size *is* on-screen size. So this reads the real sprite tree, the
 * way `sprite-coverage.test.ts` does, and holds every creature to the body it
 * is authored as.
 */

const SPRITE_ROOT = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));

/**
 * How wide a collider is, in internal pixels.
 *
 * `radius` is in world units and the whole diameter is what a player aims at,
 * so this is `2 * radius` world units expressed at the actor grid's own scale.
 * The three classes come out at 16, 28 and 40.
 */
function colliderPixels(sizeName: string): number {
  const id = ENEMY_SIZE_BY_NAME[sizeName as keyof typeof ENEMY_SIZE_BY_NAME];
  const profile = ENEMY_PROFILES[id];
  return profile.radius * 2 * ACTOR_PIXELS_PER_UNIT;
}

/**
 * How far a silhouette may sit from its own collider, measured on its longest
 * axis.
 *
 * The longest axis rather than height, because the collider is a circle and a
 * creature is not: a Kellerassel is a flat, wide animal, and no single circle
 * can match both its 24px width and its 14px height. Its width is what a
 * player reads and what they shoot at, so its width is what the circle is
 * sized against — and checking height instead would demand every flat creature
 * grow tall for a reason nothing in the game actually has.
 *
 * The floor stops a body disappearing inside its own hitbox, which is being
 * hit by nothing. The ceiling stops one sprawling past what can be hit, which
 * is shooting at nothing. Both are wide, deliberately: this is a gate against
 * a sprite drifting away from its collider unnoticed, not a house style for
 * how big a creature should be. That decision stays where
 * `CLAUDE.md`'s sign-off ritual puts it — with a person looking at options.
 */
const MIN_SILHOUETTE = 0.6;
const MAX_SILHOUETTE = 1.8;

/**
 * Creatures whose art does not yet fit the collider it is drawn over.
 *
 * Art debt from #45, recorded rather than papered over. Empty since #194: the
 * Shopkeeper was the last name on it — a body drawn well inside its own
 * hitbox, 16 internal pixels tall behind a 28-pixel collider, because the old
 * renderer inflated it to fit and nothing ever had to be authored to size.
 * Redrawn from `tools/art/authoring/shopkeeper.mjs` at 22×32, ~1.1× the
 * collider. The Kellerassel-Segment left this list in #191, redrawn from
 * `tools/art/authoring/floor1-roster.mjs`.
 *
 * This list may only ever shrink; the test below fails if an entry stops being
 * needed, so a fixed sprite cannot quietly leave its exemption behind for the
 * next mis-sized one to inherit. Should a future creature ever need it again,
 * add its name back rather than reaching for a different mechanism.
 */
const PENDING_REDRAW: ReadonlySet<string> = new Set();

const sprites = await scanSprites(SPRITE_ROOT);
const creatureArt = new Map(
  sprites
    .filter((sprite) => sprite.category === 'character' || sprite.category === 'boss')
    .map((sprite) => [sprite.name, sprite] as const),
);

interface Measured {
  readonly id: string;
  readonly sizeName: string;
  /** The silhouette's longest axis, in internal pixels. */
  readonly silhouette: number;
  readonly collider: number;
  readonly canvas: string;
  readonly inked: string;
}

const measured: Measured[] = [];
for (const definition of ENEMY_DEFINITIONS) {
  const sprite = creatureArt.get(definition.id);
  if (sprite === undefined) {
    // `sprite-coverage.test.ts` owns "every enemy has art" — this file is only
    // about the art that exists, so a gap there fails once, over there.
    continue;
  }
  const { width, height, pixels } = decodePng(await readFile(sprite.filePath));
  const frameWidth = sprite.animation === null ? width : width / sprite.animation.frames;
  const bounds = inkedBounds(pixels, width, height, frameWidth);
  if (bounds === null) {
    throw new Error(`${sprite.filePath}: every pixel is transparent`);
  }
  measured.push({
    id: definition.id,
    sizeName: definition.size,
    silhouette: Math.max(bounds.width, bounds.height),
    collider: colliderPixels(definition.size),
    canvas: `${String(frameWidth)}x${String(height)}`,
    inked: `${String(bounds.width)}x${String(bounds.height)}`,
  });
}

describe('every creature is drawn at the size it can be hit at', () => {
  it('there is a roster to check, so this file is not silently vacuous', () => {
    expect(measured.length).toBeGreaterThan(10);
  });

  it.each(measured.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
    const ratio = entry.silhouette / entry.collider;
    const detail =
      `${entry.id} (${entry.sizeName}): canvas ${entry.canvas}, silhouette ${entry.inked}, ` +
      `collider ${String(entry.collider)}px, longest axis ${ratio.toFixed(2)}x the collider`;
    if (PENDING_REDRAW.has(entry.id)) {
      // Known too small, and allowed to be — but not allowed to get worse,
      // and not allowed to already be fine (see the shrink check below).
      expect(ratio, detail).toBeLessThan(MIN_SILHOUETTE);
      return;
    }
    expect(ratio, detail).toBeGreaterThanOrEqual(MIN_SILHOUETTE);
    expect(ratio, detail).toBeLessThanOrEqual(MAX_SILHOUETTE);
  });

  it('PENDING_REDRAW only ever shrinks', () => {
    const stillNeeded = measured
      .filter((entry) => {
        const ratio = entry.silhouette / entry.collider;
        return ratio < MIN_SILHOUETTE || ratio > MAX_SILHOUETTE;
      })
      .map((entry) => entry.id)
      .sort();
    expect(stillNeeded).toEqual([...PENDING_REDRAW].sort());
  });
});
