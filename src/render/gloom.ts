import {
  ClampToEdgeWrapping,
  FramebufferTexture,
  LinearFilter,
  Mesh,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from './resolution.js';

/**
 * The murk (`sim/game/promille.ts`'s `promilleGloom`): the world pass, blurred
 * and drained of colour, cross-faded back over itself.
 *
 * ## Why this exists at all
 *
 * Promille's penalties were, until the risk/reward pass, mostly *motion* —
 * camera sway above everything else. Sway is the one drunk effect that makes
 * people put a game down rather than turn a setting off, so most of it went
 * (`PromilleTuning.maxSway`) and two stationary penalties took its job:
 * `Vignette`'s tunnel closing in, which is how far the player can see, and
 * this, which is how clearly. Between them a Vollrausch run is unmistakably
 * impaired without a single pixel of the frame moving.
 *
 * ## Why it copies the framebuffer instead of rendering into a target
 *
 * Because a render target would cost a second copy of every shader in the
 * game. Three keys a material's program on the colour space it is writing
 * into, and a non-XR render target is always the working (linear) space
 * while the canvas is sRGB — the same trap `GameView.warmSceneryGroup`'s own
 * doc comment describes, and the reason that warm draws into a 1x1 corner of
 * the canvas rather than an offscreen target. Routing the world through a
 * target so this pass could sample it would relink the lot the first time a
 * player got drunk, mid-run, which is exactly the hitch
 * `docs/DECISIONS.md` #80 exists to prevent.
 *
 * `copyFramebufferToTexture` sidesteps all of it: the world draws to the
 * canvas exactly as it always has, this copies the finished 640x360 frame
 * into a texture, and one quad draws it back blurred. The copy is a
 * GPU-side `copyTexSubImage2D` of a quarter-megapixel and the quad is
 * thirteen taps of it; nothing is read back to the CPU.
 *
 * ## Where it sits in the frame
 *
 * Last thing in `GameView.render`, so it blurs the room, the bodies, the
 * shots and the particles — and *nothing* the player reads. The HUD, the
 * damage numbers' own layer and the vignette are the UI pass, drawn after
 * this by `app.ts`, so a health bar stays sharp at Filmriss. That split is
 * the whole reason the effect is allowed to be as strong as it is.
 */

/** Luma weights, for draining the colour out of what is left. */
const LUMA = new Vector3(0.299, 0.587, 0.114);

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // The quad is authored in clip space already — no camera transform, no
  // chance of the projection matrix and the viewport disagreeing.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * A 13-tap tent: the centre, its eight neighbours at `uRadius`, and four axis
 * samples at twice that. Not a separable gaussian — that wants two passes and
 * a second target, and at 640x360 with a linear-filtered source this reads as
 * defocus already. `uAmount` is the alpha the whole thing is blended back at,
 * so the sharp frame underneath is always still partly there.
 */
const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uFrame;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uAmount;
uniform float uMurk;
uniform vec3 uMurkColour;
uniform vec3 uLuma;
varying vec2 vUv;

vec3 tap(vec2 offset) {
  return texture2D(uFrame, vUv + offset).rgb;
}

void main() {
  vec2 r = uTexel * uRadius;
  vec2 w = r * 2.0;
  vec3 sum = tap(vec2(0.0)) * 4.0;
  sum += (tap(vec2(r.x, 0.0)) + tap(vec2(-r.x, 0.0))) * 2.0;
  sum += (tap(vec2(0.0, r.y)) + tap(vec2(0.0, -r.y))) * 2.0;
  sum += tap(r) + tap(-r) + tap(vec2(r.x, -r.y)) + tap(vec2(-r.x, r.y));
  sum += (tap(vec2(w.x, 0.0)) + tap(vec2(-w.x, 0.0))) * 0.5;
  sum += (tap(vec2(0.0, w.y)) + tap(vec2(0.0, -w.y))) * 0.5;
  vec3 blurred = sum / 18.0;
  // Gloom, not just blur: the further in, the more the room reads as one
  // murky colour instead of as the lit, coloured thing it is. Darkening is
  // deliberately left to the vignette, which is already doing it.
  vec3 murky = uMurkColour * dot(blurred, uLuma);
  gl_FragColor = vec4(mix(blurred, murky, uMurk), uAmount);
}
`;

/** How much of the frame the blur may replace at full ramp. Never all of it — a totally soft frame reads as broken, not as drunk. */
const MAX_AMOUNT = 0.8;
/** Blur radius in internal pixels at zero gloom and at full ramp. One internal pixel is three screen pixels at the common upscale. */
const MIN_RADIUS = 0.9;
const MAX_RADIUS = 3.2;
/**
 * How far past `1` the ramp keeps biting before it saturates — the Trinkfest
 * stages, sized to the ceiling the meter can actually reach the way
 * `Vignette`'s own deep slope is. At `TRINKFEST_MAX` the meter caps at 7.0
 * Promille, which is a gloom ramp of ~1.57.
 */
const DEEP_SPAN = 0.6;
/** How much of the colour is drained at full ramp. */
const MAX_MURK = 0.55;
/**
 * What the drained colour goes toward: cold, damp cellar, and a shade under
 * the luma it replaces rather than level with it. Level with it was the first
 * try and it reads wrong — a warm brown floor swapped for a neutral grey of
 * the same brightness *lifts* the middle of the frame, so the room got
 * hazier and lighter at once while the vignette was darkening its edges, and
 * the two fought. Multiplying under 1 keeps the murk pulling the same
 * direction as everything else on the screen.
 */
const MURK_COLOUR = new Vector3(0.5, 0.53, 0.62);

export class GloomBlur {
  private readonly scene = new Scene();
  /** Unused by the shader — the quad is already in clip space — but `render` needs *a* camera. */
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly material: ShaderMaterial;
  private readonly texture: FramebufferTexture;
  /** Held rather than looked up by name each frame — `setGloom` runs every frame. */
  private readonly uAmount = { value: 0 };
  private readonly uRadius = { value: MIN_RADIUS };
  private readonly uMurk = { value: 0 };

  constructor() {
    this.texture = new FramebufferTexture(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    // Linear, unlike every other texture in the game: this one is sampled
    // *between* texels on purpose — that interpolation is half of what makes
    // thirteen taps read as a blur rather than as thirteen ghosts.
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.wrapS = ClampToEdgeWrapping;
    this.texture.wrapT = ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    this.material = new ShaderMaterial({
      uniforms: {
        uFrame: { value: this.texture },
        uTexel: { value: new Vector2(1 / INTERNAL_WIDTH, 1 / INTERNAL_HEIGHT) },
        uRadius: this.uRadius,
        uAmount: this.uAmount,
        uMurk: this.uMurk,
        uMurkColour: { value: MURK_COLOUR },
        uLuma: { value: LUMA },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      blending: NormalBlending,
      depthTest: false,
      depthWrite: false,
      // The frame is copied out of the canvas already encoded; sampling it
      // and writing it straight back is an identity round trip, which a
      // `ShaderMaterial` gives for free by not including three's colour-space
      // chunk. Tone mapping is off for the same reason.
      toneMapped: false,
    });
    const quad = new Mesh(this.geometry, this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  /**
   * `gloom` is `sim.promilleGloom`, already softened for accessibility by the
   * caller. Zero switches the pass off entirely — no copy, no draw.
   */
  setGloom(gloom: number): void {
    const clamped = Math.max(0, gloom);
    const ramp = Math.min(1, clamped);
    // Past `1` (the pre-#92 ceiling) the mix is spent, so the Trinkfest
    // stages keep escalating on the radius and the colour drain instead —
    // the same "the alpha is capped, so make the effect itself worse"
    // trick #92's distortion pulse already plays with its period.
    const deep = Math.min(1, Math.max(0, clamped - 1) / DEEP_SPAN);
    // Four fifths of the bite is the ramp itself, so a baseline run reaches
    // most of the effect on its own and Trinkfest only tops it up.
    const bite = Math.min(1, ramp * 0.8 + deep * 0.2);
    this.uAmount.value = ramp * MAX_AMOUNT;
    this.uRadius.value = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * bite;
    this.uMurk.value = MAX_MURK * bite;
  }

  /** Whether this frame has anything to draw — checked by the caller so a sober run pays nothing. */
  get active(): boolean {
    return this.uAmount.value > 0;
  }

  /**
   * Links the quad's program up front, with everything else
   * `GameView.render` compiles on its first frame. Without this the program
   * would link on the frame the player first crosses into Beduselt — a
   * blocking `linkProgram` mid-run, which is the exact failure
   * `tools/perf/room-crossings.mjs` gates against.
   */
  compile(renderer: WebGLRenderer): void {
    renderer.compile(this.scene, this.camera);
  }

  /**
   * Copies the frame drawn so far and draws it back blurred. Call after the
   * world passes and before the UI pass; a no-op while `active` is false.
   */
  render(renderer: WebGLRenderer): void {
    if (!this.active) {
      return;
    }
    renderer.copyFramebufferToTexture(this.texture);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }

  dispose(): void {
    this.texture.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
