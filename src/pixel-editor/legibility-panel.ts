import {
  contrastRatio,
  MIN_PROJECTILE_CONTRAST,
  relativeLuminance,
} from '../../tools/art/contrast.mjs';
import { floorBackgroundSwatches } from '../../tools/art/palette.mjs';
import { FLOOR_BUCKETS, floorTagForBucket } from '../../tools/art/spec.mjs';
import { brightestOpaqueColor } from '../../tools/art/validate.mjs';
import type { PixelEditorState } from './state.js';

export interface LegibilityPanelHandle {
  destroy(): void;
}

/**
 * "Enemy shots must read against every background" (`docs/CONTENT_BIBLE.md`
 * §5), checked live while drawing a projectile — the same
 * `brightestOpaqueColor` + `contrastRatio` pair `tools/art/build.mjs` runs at
 * build time, called here on every paint instead of after a save. A sprite
 * authored under one floor's bucket is only ever checked against that
 * floor's own background swatches, matching `build.mjs`'s reasoning exactly
 * ("a projectile authored under one floor's bucket only ever appears
 * there"); a `common` projectile is shared by every floor and is held to all
 * seven at once.
 *
 * Hidden entirely outside the `projectile` category — the check does not
 * apply to a tile or a boss, and an empty panel would just read as "nothing
 * to show" rather than "not relevant here".
 */
export function createLegibilityPanel(
  state: PixelEditorState,
  host: HTMLElement,
): LegibilityPanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-pixel-panel';
  host.appendChild(root);

  const heading = document.createElement('h2');
  heading.textContent = 'Projectile legibility';
  root.appendChild(heading);

  const list = document.createElement('div');
  root.appendChild(list);

  function floorsToCheck(): { floorTag: string; colors: readonly number[] }[] {
    const ownFloorTag = floorTagForBucket(state.bucketId);
    const bucketsToCheck =
      ownFloorTag === null
        ? FLOOR_BUCKETS
        : FLOOR_BUCKETS.filter((bucket) => bucket.floorTag === ownFloorTag);
    return bucketsToCheck.map((bucket) => ({
      floorTag: bucket.floorTag,
      colors: floorBackgroundSwatches(bucket.floorTag),
    }));
  }

  function render(): void {
    root.style.display = state.category === 'projectile' ? '' : 'none';
    if (state.category !== 'projectile') {
      return;
    }

    list.replaceChildren();
    const rim = brightestOpaqueColor(
      asBuffer(state.activeFrame),
      state.width,
      state.height,
      relativeLuminance,
    );
    if (rim === null) {
      const empty = document.createElement('p');
      empty.textContent = 'Draw at least one opaque pixel to check legibility.';
      list.appendChild(empty);
      return;
    }

    for (const floor of floorsToCheck()) {
      let worstRatio = Infinity;
      let worstColor: number | null = null;
      for (const background of floor.colors) {
        const ratio = contrastRatio(rim, background);
        if (ratio < worstRatio) {
          worstRatio = ratio;
          worstColor = background;
        }
      }
      const passes = worstRatio >= MIN_PROJECTILE_CONTRAST;
      const against = worstColor === null ? '?' : `#${worstColor.toString(16).padStart(6, '0')}`;
      const row = document.createElement('p');
      row.className = passes ? 'kb-pixel-legibility-ok' : 'kb-pixel-legibility-fail';
      row.textContent =
        `${floor.floorTag}: ${worstRatio.toFixed(2)}:1 against ${against} ` +
        (passes ? '✓' : `(needs ${MIN_PROJECTILE_CONTRAST.toFixed(1)}:1)`);
      list.appendChild(row);
    }
  }

  const unsubscribe = state.subscribe(render);
  render();

  return {
    destroy(): void {
      unsubscribe();
      root.remove();
    },
  };
}

/**
 * `validate.mjs`'s hand-written type names the real Node `Buffer` — the type
 * the pipeline's server-side half actually passes — but the function itself
 * only ever indexes `pixels[i]`, which a `Uint8ClampedArray` (what the
 * canvas hands back) supports identically. There is no Node `Buffer` in a
 * browser bundle to construct one from.
 */
function asBuffer(pixels: Uint8ClampedArray): Buffer {
  return pixels as unknown as Buffer;
}
