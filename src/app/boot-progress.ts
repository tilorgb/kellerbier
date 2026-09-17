/**
 * The loading screen, from the browser's first paint to the first frame of
 * the game (#56's loading-experience bullet).
 *
 * ## Why it exists at all
 *
 * Nothing the player can see happens until `boot()` in `app/main.ts` has run
 * to the end: the bundle has to be parsed, the atlas sheets decoded, the pixel
 * fonts compiled, floor one generated and its scene built. On a warm dev
 * server that is fast enough to miss; on a first visit to the hosted build, or
 * on the single-file release opening a twenty-megabyte page, it is seconds of
 * a black window. A black window is indistinguishable from a broken download,
 * and the person looking at it is usually somebody doing you a favour by
 * trying the game — so they wait, and then they close the tab.
 *
 * The markup and the styling live in `index.html` rather than here, because
 * the whole point is that it is painted *before* this module exists.
 *
 * ## Why the milestones are where they are, and why each one yields
 *
 * `boot()` has exactly one `await` of its own (the atlas load). Everything
 * else between the first line and the first frame is synchronous, which means
 * a bar updated at four points along it would repaint at none of them — the
 * style change lands, the main thread never yields, and the browser paints
 * once, at the end, with the bar at 100%. So `advance` returns a promise that
 * resolves after a real animation frame, and `boot` awaits it. That buys a
 * handful of frames of wall-clock time, deliberately, in exchange for the bar
 * being a progress bar rather than a picture of one.
 *
 * The weights are measured-ish rather than even: decoding the atlases and
 * building the first room dominate, and a bar that spends most of its travel
 * on the part that takes no time is a bar that lies in the more annoying
 * direction.
 */

/** Where the bar sits at each point `boot` reports reaching. */
export const BOOT_MILESTONES = {
  /** The renderer exists and the pixel fonts are compiled. */
  renderer: 0.12,
  /** `loadFloorArt`/`loadPlayerArt` have resolved — the one real await. */
  art: 0.58,
  /** Audio sample decoding has been kicked off (it finishes on its own). */
  audio: 0.68,
  /** Floor one is generated, its scene is built, the title screen is up. */
  world: 0.92,
} as const;

export type BootMilestone = keyof typeof BOOT_MILESTONES;

export interface BootProgress {
  /**
   * Moves the bar to `milestone` and resolves once the browser has actually
   * painted it. Awaiting this is what makes the bar move; not awaiting it is
   * harmless but pointless.
   */
  advance(milestone: BootMilestone): Promise<void>;
  /** Fills the bar, fades the screen out and removes it. */
  done(): void;
  /** Replaces the bar with the "this did not start" panel `index.html` carries. */
  fail(): void;
}

/** One frame is enough to get the style change committed; two is enough to have it on screen. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

/**
 * Binds to the boot screen in `index.html`.
 *
 * Every method is a no-op when the markup is missing rather than a throw: a
 * harness that mounts the game into its own page (the headless perf walk, a
 * test) has no boot screen, and failing to boot because the *loading
 * indicator* is absent would be an absurd way to lose a run.
 */
export function createBootProgress(): BootProgress {
  const screen = document.getElementById('boot-screen');
  const fill = document.getElementById('boot-bar-fill');

  const setFraction = (fraction: number): void => {
    if (fill !== null) {
      fill.style.width = `${String(Math.round(fraction * 100))}%`;
    }
  };

  return {
    async advance(milestone: BootMilestone): Promise<void> {
      if (screen === null) {
        return;
      }
      setFraction(BOOT_MILESTONES[milestone]);
      await nextPaint();
    },
    done(): void {
      if (screen === null) {
        return;
      }
      setFraction(1);
      screen.classList.add('kb-boot-done');
      // Matches the CSS fade. Removed rather than left at `opacity: 0`, so
      // nothing is left covering the canvas for pointer events to hit — the
      // sprite-picking click handler and the touch sticks both live under it.
      window.setTimeout(() => {
        screen.remove();
      }, 300);
    },
    fail(): void {
      screen?.classList.add('kb-boot-failed');
    },
  };
}
