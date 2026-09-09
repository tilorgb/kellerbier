import { describe, expect, it } from 'vitest';
import { Vignette } from '../../src/render/vignette.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from '../../src/render/resolution.js';

/**
 * The tunnel closing in — the sight half of the risk/reward pass, and the
 * penalty that took most of camera sway's job (`PromilleTuning.maxSway`).
 *
 * Headless: `createVignetteTexture` returns `Texture.EMPTY` with no DOM, but
 * everything this checks is the sprite's own geometry — the frame it reads
 * and the size it draws at — which is arithmetic, not pixels. What the
 * gradient looks like inside that frame is an art question a unit test has
 * no business having an opinion about; what it must never do is leave a
 * corner of the screen unshaded, which is what the coverage assertion below
 * is really guarding.
 */
function simAt(promille: number): GameSim {
  const sim = new GameSim({ room: new RoomGeometry(0, 0, 320, 180) });
  sim.tuning.promille.current = promille;
  return sim;
}

/** The width of the frame the sprite reads: bigger frame, tighter tunnel. */
function frameWidth(vignette: Vignette): number {
  return vignette.view.texture.frame.width;
}

describe('Vignette: the tunnel closes as Promille rises', () => {
  it('reads a wider slice of the gradient the drunker the run is', () => {
    const vignette = new Vignette();
    vignette.sync(simAt(0), 320, 180);
    const sober = frameWidth(vignette);

    vignette.sync(simAt(1.0), 320, 180);
    const tipsy = frameWidth(vignette);

    vignette.sync(simAt(3.0), 320, 180);
    const drunk = frameWidth(vignette);

    vignette.sync(simAt(4.4), 320, 180);
    const wrecked = frameWidth(vignette);

    // A larger frame over the same texture squeezes the same gradient into a
    // smaller part of the quad, which is the tunnel getting tighter.
    expect(tipsy).toBeGreaterThan(sober);
    expect(drunk).toBeGreaterThan(tipsy);
    expect(wrecked).toBeGreaterThan(drunk);
    // The first Maß is felt but is not the headline: Angeheitert costs about
    // a tenth of the sight radius, not half of it.
    expect(tipsy / sober).toBeLessThan(1.2);
    // ...and the last Maß before Umgfalln is properly claustrophobic.
    expect(wrecked / sober).toBeGreaterThan(1.8);
  });

  it('keeps covering the whole frame at every Promille', () => {
    // The reason the tunnel is drawn by growing the *frame* rather than by
    // shrinking the sprite: a sprite small enough to be a tight tunnel is
    // too small to reach the screen corners once camera-follow pushes the
    // player off centre, and the uncovered corner would read as a hole in
    // the dark. The quad's own size never changes.
    const vignette = new Vignette();
    for (const promille of [0, 0.5, 1.5, 3, 4.4, 5]) {
      vignette.sync(simAt(promille), 0, 0);
      expect(vignette.view.width).toBeCloseTo(INTERNAL_WIDTH * 2.2);
      expect(vignette.view.height).toBeCloseTo(INTERNAL_HEIGHT * 2.2);
    }
  });

  it('bottoms out rather than closing to nothing once Trinkfest pushes past the old ceiling', () => {
    // `promilleTunnelVision` is deliberately unbounded, like every ramp in
    // `sim/game/promille.ts`. This is the renderer's half of that contract:
    // the Trinkfest stages keep tightening on a shallower slope and then
    // stop, because a tunnel that kept shrinking with the ramp would end as
    // a black screen.
    const vignette = new Vignette();
    vignette.sync(simAt(5), 320, 180);
    const ceiling = frameWidth(vignette);
    // 7.0 is the real ceiling — `promilleCapFor` at `TRINKFEST_MAX` — and is
    // where the second slope is sized to bottom out.
    vignette.sync(simAt(7), 320, 180);
    const deep = frameWidth(vignette);
    vignette.sync(simAt(40), 320, 180);
    const absurd = frameWidth(vignette);

    expect(deep).toBeGreaterThan(ceiling);
    expect(absurd).toBe(deep);
  });

  it('softens the closing for a reduced-motion run without switching it off', () => {
    // Softened, not removed — the tunnel is one of the two things left
    // telling a player how drunk they are, and an accessibility toggle that
    // removes information is not an accessibility toggle (`app/settings.ts`).
    const full = new Vignette();
    const reduced = new Vignette();
    reduced.setReducedMotion(true);

    full.sync(simAt(0), 320, 180);
    reduced.sync(simAt(0), 320, 180);
    const sober = frameWidth(full);
    expect(frameWidth(reduced)).toBe(sober);

    full.sync(simAt(4.4), 320, 180);
    reduced.sync(simAt(4.4), 320, 180);
    expect(frameWidth(reduced)).toBeLessThan(frameWidth(full));
    expect(frameWidth(reduced)).toBeGreaterThan(sober);
  });

  it('is wide open for a sober run, whatever the debug slider says', () => {
    const vignette = new Vignette();
    const unlocked = simAt(0);
    vignette.sync(unlocked, 320, 180);
    const open = frameWidth(vignette);

    const sober = new GameSim({ room: new RoomGeometry(0, 0, 320, 180), promilleUnlocked: false });
    sober.tuning.promille.current = 4;
    vignette.sync(sober, 320, 180);
    expect(frameWidth(vignette)).toBe(open);
  });
});
