import { Rectangle, Sprite, Texture, textureFromImage } from './gfx/index.js';
import type { GameSim } from '../sim/game/sim.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from './resolution.js';
import { EFFECT_PALETTE, PROMILLE_KATER_TINT, PROMILLE_VIGNETTE_TINT } from './palette.js';

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
 * The generated gradient's own resolution. Its outer stop lands exactly on
 * the half-size, so *every texel of the texture's border ring is fully
 * opaque* — which is what lets `apertureFrame` below shrink the tunnel by
 * reading a frame **larger** than the texture: the sampler clamps to that
 * opaque edge, so the extra area outside the gradient draws as solid
 * darkness rather than as nothing.
 */
const VIGNETTE_TEXTURE_SIZE = 512;

/**
 * A radial gradient, transparent centre to opaque edge, generated once via
 * `<canvas>` rather than `Graphics` — a soft radial fade is a Canvas 2D
 * gradient, not a shape, and there is no reason to reach for a shader for it.
 *
 * Uploaded linear (`textureFromImage(canvas, true)`): the pixels are an alpha
 * mask the sprite's tint colours, not colour data, so they must not be
 * sRGB-decoded on the way in.
 */
function createVignetteTexture(): Texture {
  if (typeof document === 'undefined') {
    // No DOM is a headless/test environment, not a real failure — the caller
    // just gets an unused blank texture.
    return Texture.EMPTY;
  }
  const size = VIGNETTE_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    // No 2D context is a headless/test environment, not a real failure —
    // the caller just gets an unused blank texture.
    return Texture.EMPTY;
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
  return textureFromImage(canvas, true);
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
 * How much of the sober sight radius is left when `sim.promilleTunnelVision`
 * reads `1` — the pre-#92 ceiling, which at baseline Trinkfest is a Promille
 * past Umgfalln, so a real run tops out a little above this.
 *
 * The ramp is left uncapped in `sim/game/promille.ts`; this and
 * `DEEPEST_APERTURE` are the renderer deciding how far it is willing to close
 * the tunnel, exactly as `MAX_DISTORTION_ALPHA` does for #92's pulse. Chosen
 * against the frame rather than by feel alone: at `1` the clear radius runs
 * about 86x48 internal pixels — roughly three body-lengths of room in every
 * direction, so a shot already on its way to the player is still visible
 * before it arrives. That is the floor the "the player must always believe a
 * death was theirs" guardrail (`docs/GAME_DESIGN.md` §5) puts under this, and
 * it is the reason it did not go further when the first playtest asked for a
 * tighter tunnel than 0.49.
 */
const CLOSED_APERTURE = 0.34;
/** The floor the Trinkfest stages close to. Past this the tunnel stops tightening and only the murk keeps rising. */
const DEEPEST_APERTURE = 0.26;
/**
 * How far past `1` the ramp keeps closing before it lands on
 * `DEEPEST_APERTURE`. Sized to the deepest the *game* can go rather than to
 * a round number: at `TRINKFEST_MAX` the meter caps at 7.0 Promille
 * (`promilleCapFor`), which is a tunnel-vision ramp of 1.4 — so 0.4 puts the
 * floor exactly at the tightest a run can actually be driven, and nothing is
 * left unspent below a value no player will ever see.
 */
const DEEP_TUNNEL_SPAN = 0.4;
/**
 * How much of the closing a `reducedMotion` run actually takes.
 *
 * Softened rather than switched off, for the same reason shake is damped
 * rather than removed (`app/settings.ts`): the tunnel is *information* — it
 * is one of the two things left telling a player how drunk they are now that
 * sway is a whisper — and an accessibility toggle that removes information
 * is not an accessibility toggle. Same call `BlaueStundeOverlay` already
 * makes for its own vision radius.
 */
const REDUCED_MOTION_TUNNEL = 0.5;

/**
 * Bends the ramp toward its top end before it is spent.
 *
 * The first playtest asked for a *tighter* tunnel without a heavier
 * Angeheitert — "more with higher Promille values" — and those two pull
 * against each other on a straight line: raising the ceiling on a linear ramp
 * raises the first sip by the same proportion. This is the shape that lets
 * both be true, weighting the back half of the ramp about 1.7x the front, so
 * `CLOSED_APERTURE` could drop from 0.49 to 0.34 while Angeheitert stayed
 * within a pixel or two of where it already was.
 *
 * Deliberately not the obvious `t * t`, which would make the first Maß cost
 * almost nothing — the whole reason this ramp starts at the first sip rather
 * than at a tier boundary (see `promilleTunnelVision`) is that a drink the
 * player cannot feel is a drink that did not happen. `render/gloom.ts` bends
 * its own ramp with the same shape, for the same reason; the two are
 * independent numbers that happen to want the same curve, not one constant
 * split in half.
 */
function lateBias(t: number): number {
  return t * (0.6 + 0.4 * t);
}

/** Below this much tunnel vision the screen does not breathe — a sober run has no reason to. */
const BREATH_FROM = 0.25;
/** Ticks per breath. Slow enough to read as unsteadiness rather than as a flicker. */
const BREATH_PERIOD_TICKS = 150;
/** How much alpha one breath is worth, at full intensity. */
const BREATH_ALPHA = 0.05;

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

  /** The gradient, read through `aperture` rather than through its own bounds. */
  private readonly texture: Texture;

  constructor() {
    const gradient = createVignetteTexture();
    this.texture = new Texture(gradient.source, this.aperture);
    this.view = new Sprite(this.texture);
    this.view.anchor.set(0.5);
    this.view.alpha = 0;
  }

  /**
   * `screenX`/`screenY` are where the player actually renders this frame —
   * `GameView.playerScreenPosition()`, in internal pixels — so the clear
   * centre of the tunnel tracks the player exactly, camera shake/sway and all.
   */
  /**
   * Whether the vignette breathes (#153).
   *
   * The tier *tint* and the tier *darkness* are the information — how drunk
   * you are — and always apply. The slow pulse laid over them from Vollrausch
   * up is emphasis, and `reduceFlashes` removes it. #92's own fast distortion
   * pulse goes with it, for the same reason and more so: it is the fastest
   * flicker in the game.
   */
  setPulses(pulses: boolean): void {
    this.pulses = pulses;
  }

  /**
   * Whether this is a `reducedMotion` run — see `REDUCED_MOTION_TUNNEL`. A
   * setter rather than a `sync` argument, matching `setPulses`: it changes
   * from the settings screen, not per frame.
   */
  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
  }

  private pulses = true;
  private reducedMotion = false;
  /**
   * The frame the sprite reads, widened past the texture's own bounds to
   * close the tunnel — see `applyAperture`. Mutated in place and re-read
   * every frame rather than reallocated: this runs in the frame loop.
   */
  private readonly aperture = new Rectangle(0, 0, VIGNETTE_TEXTURE_SIZE, VIGNETTE_TEXTURE_SIZE);
  private apertureScale = 0;

  sync(sim: GameSim, screenX: number, screenY: number): void {
    const intensity = Math.min(1, sim.promille / 5);
    this.applyAperture(sim.promilleTunnelVision);
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
    const pulse =
      distortion > 0 && this.pulses ? (Math.sin((sim.tick / period) * Math.PI * 2) + 1) / 2 : 0;
    const distortionAlpha =
      Math.min(MAX_DISTORTION_ALPHA, distortion * MAX_DISTORTION_ALPHA) * pulse;
    // A slow breath from Vollrausch up (#153), under #92's fast one: the
    // meter's own tiers stop being visually distinguishable somewhere in the
    // middle otherwise, because "the vignette gets darker" is one axis and
    // seven tiers do not fit on it.
    const breath =
      this.pulses && intensity > BREATH_FROM
        ? Math.sin((sim.tick / BREATH_PERIOD_TICKS) * Math.PI * 2) * BREATH_ALPHA * intensity
        : 0;
    this.view.alpha = Math.min(1, Math.max(0, intensity * MAX_ALPHA + distortionAlpha + breath));
    // Kater overrides the tier entirely — the hangover outlasts the tier that
    // caused it, and a cold grey where every tier is warm is the whole read.
    // #92's own red distortion tint stays on top of both: it means something
    // narrower (Trinkfest is actively over-driving the screen) and it should
    // still win when it is running.
    this.view.tint =
      distortion > 0
        ? EFFECT_PALETTE.distortionTint
        : sim.hasKater
          ? PROMILLE_KATER_TINT
          : PROMILLE_VIGNETTE_TINT[sim.promilleTier];
    this.view.position.set(screenX, screenY);
  }

  /**
   * Call on every resize, same as the HUD's own `positionHud`. Takes nothing:
   * the game renders at a fixed internal frame (`INTERNAL_WIDTH` x
   * `INTERNAL_HEIGHT`) and the UI layer is scaled up as a whole, so the
   * overlay covers the same internal pixels whatever the window is.
   */
  resize(): void {
    this.sizeToFrame();
  }

  /**
   * Closes the tunnel to `tunnel` (`sim.promilleTunnelVision`).
   *
   * The sprite keeps covering the same generous `COVERAGE` of the frame at
   * every Promille — it has to, or a player pushed off screen centre by
   * camera-follow would find an unshaded corner. What shrinks instead is the
   * *gradient inside it*: the sprite reads a frame larger than the texture,
   * so the same 512 pixels of fade are squeezed into a smaller part of the
   * quad and everything outside them samples the texture's fully opaque
   * border ring (`VIGNETTE_TEXTURE_SIZE`). One sprite, one draw call, and no
   * seam where the gradient ends — the clamped edge is the same alpha the
   * gradient reaches, because it *is* the pixel the gradient reaches it at.
   *
   * Skipped entirely when the aperture has not moved, which is most frames:
   * changing the frame invalidates the texture's UV cache and relays the
   * quad out, and Promille moves at ~0.006 a second.
   */
  private applyAperture(tunnel: number): void {
    const softened = tunnel * (this.reducedMotion ? REDUCED_MOTION_TUNNEL : 1);
    const closed = lateBias(Math.min(1, Math.max(0, softened))) * (1 - CLOSED_APERTURE);
    // Past the pre-#92 ceiling the Trinkfest stages keep closing, but on a
    // second, shallower slope and onto a hard floor — the ramp itself is
    // unbounded and a tunnel that keeps shrinking with it would eventually
    // be a black screen.
    const deep =
      Math.min(1, Math.max(0, softened - 1) / DEEP_TUNNEL_SPAN) *
      (CLOSED_APERTURE - DEEPEST_APERTURE);
    const scale = 1 - closed - deep;
    if (scale === this.apertureScale) {
      return;
    }
    this.apertureScale = scale;
    const size = VIGNETTE_TEXTURE_SIZE / scale;
    const inset = (VIGNETTE_TEXTURE_SIZE - size) / 2;
    this.aperture.x = inset;
    this.aperture.y = inset;
    this.aperture.width = size;
    this.aperture.height = size;
    this.texture.invalidateUvs();
    // Re-assigning the same texture is what re-lays the quad's UVs out; the
    // sprite short-circuits the material update because the source is
    // unchanged, so this costs a geometry rewrite and nothing else.
    this.view.texture = this.texture;
    this.sizeToFrame();
  }

  /**
   * Independent width/height rather than a uniform scale: the gradient
   * stretches to the room's aspect ratio, which is what makes it cover a
   * landscape viewport corner to corner instead of leaving the top and
   * bottom unshaded. Re-applied after every aperture change too, since
   * `Sprite.width` is a scale derived from the frame's own size.
   */
  private sizeToFrame(): void {
    this.view.width = INTERNAL_WIDTH * COVERAGE;
    this.view.height = INTERNAL_HEIGHT * COVERAGE;
  }
}
