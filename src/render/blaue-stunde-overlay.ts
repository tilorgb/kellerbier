import { Sprite, Texture } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import type { GameLayout } from './resolution.js';

/**
 * Blaue Stunde (#49): heavy dusk, limited vision radius — a radial darkening
 * around the player, same shape as `Vignette` (a canvas-generated gradient
 * sprite, screen-space, following the player's own screen position every
 * frame) but driven by whether the curse is active rather than by Promille,
 * and with a *tunable* clear radius (`tuning.curse.blaueStundeVisionRadius`)
 * rather than a fixed cosmetic ratio — the vision limit is the point of this
 * curse, not an incidental fade.
 *
 * Render-only, sim-blind: the simulation never reads this, every entity
 * still exists and acts exactly as it would on an uncursed floor, only what
 * gets drawn past the clear radius is dimmed. That is what "remains playable
 * with accessibility settings applied" (#49's own acceptance criterion)
 * means in practice — `reducedMotion` widens the clear radius and caps the
 * opacity rather than the curse being switched off outright, the same
 * "accessibility suppression is render-side" split `docs/DECISIONS.md` #41
 * already uses for screenshake and camera sway.
 */

/** Fraction of the generated texture's own half-size that stays fully transparent. */
const CLEAR_FRACTION = 0.32;
/** Fraction the texture is fully opaque from outward. Between `CLEAR_FRACTION` and this, it fades. */
const OPAQUE_FRACTION = 0.85;
/** Never fully opaque even at the far edge — a silhouette should still be guessable, not erased. */
const MAX_ALPHA = 0.92;
/** `MAX_ALPHA`, softened when `reducedMotion` is on. */
const REDUCED_MOTION_MAX_ALPHA = 0.65;
/** How much wider the clear radius gets under `reducedMotion`. */
const REDUCED_MOTION_RADIUS_SCALE = 1.5;

function createDarknessTexture(): Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    return Texture.from(canvas);
  }
  const centre = size / 2;
  const gradient = context.createRadialGradient(
    centre,
    centre,
    size * CLEAR_FRACTION,
    centre,
    centre,
    size * OPAQUE_FRACTION,
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

export class BlaueStundeOverlay {
  readonly view: Sprite;

  constructor() {
    this.view = new Sprite(createDarknessTexture());
    this.view.anchor.set(0.5);
    this.view.visible = false;
  }

  /**
   * `screenX`/`screenY` are where the player renders this frame
   * (`GameView.playerScreenPosition()`), same as `Vignette.sync` — the clear
   * centre tracks the player exactly, camera shake/sway included.
   */
  sync(
    sim: GameSim,
    screenX: number,
    screenY: number,
    layout: GameLayout,
    reducedMotion: boolean,
  ): void {
    const active = sim.curse === 'blaue-stunde';
    this.view.visible = active;
    if (!active) {
      return;
    }
    const radius =
      sim.tuning.curse.blaueStundeVisionRadius * (reducedMotion ? REDUCED_MOTION_RADIUS_SCALE : 1);
    // `radius` is world px at the edge of the texture's own clear fraction —
    // sizing the sprite so that fraction lands there, in screen px, is the
    // same "world px times `layout.scale`" conversion `Vignette.resize` uses.
    const diameter = (radius / CLEAR_FRACTION) * 2 * layout.scale;
    this.view.width = diameter;
    this.view.height = diameter;
    this.view.alpha = reducedMotion ? REDUCED_MOTION_MAX_ALPHA : MAX_ALPHA;
    this.view.position.set(screenX, screenY);
  }
}
