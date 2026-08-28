import { Sprite, Texture } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, type GameLayout } from './resolution.js';
import { EFFECT_PALETTE, ENTITY_PALETTE } from './palette.js';

/** Highest the vignette ever gets, even at Promille's max. Never fully opaque. */
const MAX_ALPHA = 0.8;

/**
 * How much of `sim.promilleScreenDistortion` (#92) actually gets spent on
 * the extra pulsing alpha, so a Filmriss-deep distortion value (which can
 * run well past `1`) still reads as "worse," not as the vignette breaking.
 * The ramp itself is left uncapped in `sim/game/promille.ts` — this is the
 * one place that decides how far a renderer is willing to push it.
 */
const MAX_DISTORTION_ALPHA = 0.18;

/**
 * A radial gradient, transparent centre to opaque edge, generated once via
 * `<canvas>` rather than pixi `Graphics` — a soft radial fade is a Canvas 2D
 * gradient, not a shape, and there is no reason to reach for a shader for it.
 */
function createVignetteTexture(): Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    // No 2D context is a headless/test environment, not a real failure —
    // the caller just gets an unused blank texture.
    return Texture.from(canvas);
  }
  const centre = size / 2;
  const gradient = context.createRadialGradient(
    centre,
    centre,
    size * 0.18,
    centre,
    centre,
    centre,
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

/**
 * Oversize factor on the vignette sprite, relative to the viewport.
 *
 * The vignette follows the player rather than sitting fixed at screen
 * centre. Camera-follow (#100) keeps the player near screen centre inside a
 * room bigger than one screen, but only ever exactly centred there when the
 * follow isn't clamped against a room edge — near an edge "centred on
 * screen" and "centred on the player" are still two different things, same
 * as they always were in a `1x1` room the moment the player isn't standing
 * in the middle of it. Sized generously past 1x so the opaque outer edge
 * still reaches every screen corner even when the player is off in one of
 * them.
 */
const COVERAGE = 2.2;

/**
 * Tunnel vision (#17): the game-feel half of Promille, alongside camera sway
 * — "the visual exaggeration should outrun the mechanical penalty" per
 * `docs/GAME_DESIGN.md` §5's own guardrail. Purely opacity-driven rather
 * than an animated inner radius: simpler to get right, and a vignette
 * darkening in is already what "tunnel vision" reads as.
 *
 * #92 layers Trinkfest's own screen-distortion penalty onto the same sprite
 * — a red pulse on top of the fade — rather than adding a second full-screen
 * effect: one thing the player's eye already reads as "how drunk am I"
 * getting worse is more legible than two independent overlays competing for
 * the same attention.
 *
 * Screen-space, in `uiLayer` — same reasoning as `GameOverScreen` and
 * `HealthHud`: never inside anything the camera shakes or sways, or the
 * vignette itself would visibly jitter independently of following the
 * player.
 */
export class Vignette {
  readonly view: Sprite;

  constructor() {
    this.view = new Sprite(createVignetteTexture());
    this.view.anchor.set(0.5);
    this.view.alpha = 0;
  }

  /**
   * `screenX`/`screenY` are where the player actually renders this frame —
   * `GameView.playerScreenPosition()` — so the clear centre of the tunnel
   * tracks the player exactly, camera shake/sway and all.
   */
  sync(sim: GameSim, screenX: number, screenY: number): void {
    const intensity = Math.min(1, sim.promille / 5);
    // Screen distortion (#92): a fast, deterministic pulse layered on top of
    // the ordinary tunnel-vision fade, plus a red tint — the third readable
    // penalty the issue asks for, alongside sway and aim wobble. Zero (and
    // pure white) below Vollrausch, since `sim.promilleScreenDistortion` is;
    // a sine rather than RNG for the same "same tick, same frame, every
    // replay" reason `shooting.ts`'s aim wobble already is one.
    const distortion = sim.promilleScreenDistortion;
    // The pulse itself speeds up past `1` (the pre-#92 ceiling) rather than
    // only the alpha climbing and then flattening out — a faster flicker is
    // still legibly "worse" once the alpha spend below is already capped,
    // which is how the Trinkfest stages keep escalating past Vollrausch's
    // own top instead of looking identical to it.
    const period = Math.max(
      1,
      sim.tuning.promille.screenDistortionPeriodTicks / Math.max(1, distortion),
    );
    const pulse = distortion > 0 ? (Math.sin((sim.tick / period) * Math.PI * 2) + 1) / 2 : 0;
    const distortionAlpha =
      Math.min(MAX_DISTORTION_ALPHA, distortion * MAX_DISTORTION_ALPHA) * pulse;
    this.view.alpha = Math.min(1, intensity * MAX_ALPHA + distortionAlpha);
    this.view.tint = distortion > 0 ? EFFECT_PALETTE.distortionTint : ENTITY_PALETTE.normalTint;
    this.view.position.set(screenX, screenY);
  }

  /** Call on every resize, same as the HUD's own `positionHud`. */
  resize(layout: GameLayout): void {
    // Independent width/height rather than a uniform scale: the gradient
    // stretches to the room's aspect ratio, which is what makes it cover a
    // landscape viewport corner to corner instead of leaving the top and
    // bottom unshaded.
    this.view.width = INTERNAL_WIDTH * layout.scale * COVERAGE;
    this.view.height = INTERNAL_HEIGHT * layout.scale * COVERAGE;
  }
}
