import type { WebGLProgram, WebGLRenderer } from 'three';

/**
 * Keeps every shader program the renderer has ever linked alive for the life
 * of the renderer.
 *
 * ## Why
 *
 * three.js reference-counts programs per material: `material.dispose()` on the
 * last material using a program calls `gl.deleteProgram`, and the next mesh
 * that needs the identical program compiles and links it from source again.
 * `gl.linkProgram` plus the first `LINK_STATUS` read is the most expensive
 * synchronous call a GL driver offers — a `MeshStandardMaterial` with shadow
 * mapping and a couple of dozen point lights is tens to hundreds of
 * milliseconds per link on a real driver (D3D's HLSL compiler under ANGLE on
 * Windows is the slow case players actually hit). Rooms come and go
 * (`SceneryCache` evicts, the prewarm is discarded, a floor change clears the
 * lot) and each one owns a few materials of its own — a billboard's tinted
 * standard material, a door leaf's, a floor sprite's — so with nothing else
 * holding their programs, a crossing could delete a program on one frame and
 * relink it a second later, forever (`docs/PERFORMANCE_AUDIT.md` F1, re-measured
 * in §3b; `docs/DECISIONS.md` #80).
 *
 * ## How
 *
 * `WebGLProgram.usedTimes` is the reference count `WebGLPrograms.releaseProgram`
 * decrements and deletes at zero. `pin` walks `renderer.info.programs` after a
 * frame and bumps the count once for each program it has not seen before, so
 * no material disposal can ever take it to zero. A `WeakSet` remembers which
 * programs already hold their extra reference; a program that *is* deleted
 * (only `renderer.dispose()` can, now) simply drops out of the set.
 *
 * The set of programs this keeps alive is bounded because every input to a
 * program's cache key is now constant across a run: the point-light count
 * (`Lighting`'s pools), the shadow setup, the output colour space
 * (`GameView.warmSceneryGroup` renders to the canvas, not an offscreen target)
 * and the handful of material shapes the renderer draws. Measured over a
 * 30-crossing tour of both floors it plateaus in the tens, where before this
 * it climbed past a hundred and fifty and never stopped.
 */
export class ProgramPins {
  private readonly pinned = new WeakSet<WebGLProgram>();
  /** Pinned programs whose link has not been forced to completion yet — see `settle`. */
  private readonly unsettled: WebGLProgram[] = [];

  /** Pins every program the renderer currently holds that is not pinned yet. Returns how many it pinned. */
  pin(renderer: WebGLRenderer): number {
    const programs = renderer.info.programs;
    if (programs === null) {
      return 0;
    }
    let pinned = 0;
    for (const program of programs) {
      if (this.pinned.has(program)) {
        continue;
      }
      this.pinned.add(program);
      this.unsettled.push(program);
      program.usedTimes += 1;
      pinned += 1;
    }
    return pinned;
  }

  /**
   * Forces up to `limit` newly pinned programs to finish linking now.
   *
   * `gl.linkProgram` returns before the link is done; the driver blocks on the
   * first status or uniform query instead. three.js makes that query on a
   * program's first *draw* — so a program `renderer.compile` linked for a
   * hidden mesh (an empty telegraph shape, a spare pedestal slot) would pay
   * its link on the frame that mesh first shows, mid-fight or mid-crossing,
   * not on the frame that compiled it. Fetching the uniforms
   * (`WebGLProgram.getUniforms`, which is what first use does) settles it
   * here, a couple per frame behind the floor title card. A program already
   * drawn is settled already and costs nothing. Returns how many it settled.
   */
  settle(limit = 2): number {
    let settled = 0;
    while (settled < limit) {
      const program = this.unsettled.shift();
      if (program === undefined) {
        break;
      }
      program.getUniforms();
      settled += 1;
    }
    return settled;
  }
}
