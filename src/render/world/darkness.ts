import {
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
import { INTERNAL_HEIGHT } from '../resolution.js';

/**
 * Floor 3's lantern-darkness rooms (#404): outside a radius around the player
 * the room goes dark. Tense, never unfair — so the darkness is drawn *under*
 * everything that warns the player about something: `GameView.render` draws
 * the world, then this pass, then the see-through layer (`SEE_THROUGH_LAYER`)
 * a second time on top — every telegraph shape, every projectile, every
 * particle (a poison cloud is particles), and the bodies of enemies that are
 * winding up right now. An enemy that is merely standing in the dark is a
 * silhouette; one that is about to hit you is not.
 *
 * A screen-space pass, like the Promille vignette, centred on the player's
 * screen position — but in the world's own frame rather than the UI layer's,
 * because the UI layer is drawn over everything and darkness must not be.
 */

/** The accessibility setting (#404): how dark a dark room is, if at all. */
export type DarknessLevel = 'full' | 'reduced' | 'off';

/** Every `DarknessLevel`, in the order the settings screen offers them. */
export const DARKNESS_LEVELS: readonly DarknessLevel[] = ['full', 'reduced', 'off'];

/** A lantern: the clear radius around the player (internal pixels) and how dark it is past it. */
export interface Lantern {
  readonly radius: number;
  readonly alpha: number;
}

/**
 * The lantern per setting. `Reduced` sees further and leaves the dark a
 * lighter grey you can still read a room through; `Off` is no darkness at
 * all — a dark room draws exactly like any other.
 */
export const LANTERNS: Readonly<Record<DarknessLevel, Lantern | null>> = {
  full: { radius: 72, alpha: 0.9 },
  reduced: { radius: 120, alpha: 0.6 },
  off: null,
};

/**
 * How much of the lantern radius is fully clear before the falloff starts.
 * The rest of it is a smooth ramp to full darkness, so the edge of what the
 * player can see is soft rather than a hard circle cut into the room.
 */
const CLEAR_FRACTION = 0.55;

/** The dark itself — not pure black, a night-forest blue-green so the room still reads as a place. */
const DARK_COLOUR = new Vector3(0.02, 0.035, 0.04);

/**
 * What a dark room and the Promille tunnel draw when both are on screen.
 *
 * Both darken everything past a radius around the player, and laying one over
 * the other multiplies them toward black — the one combination #404 rules
 * out. So the tighter of the two wins: it keeps its full strength, and the
 * looser one is thinned by what the tighter already covers, so the far dark
 * comes out about as dark as the tighter one alone and never darker than
 * either could plausibly be together.
 *
 * `tunnel` is the vignette's 50%-alpha radius and its current alpha (0 when
 * sober). Returns the alpha to draw the darkness at and the scale to multiply
 * the vignette's own alpha by.
 */
export function stackWithTunnel(
  lantern: Lantern | null,
  tunnel: { readonly radius: number; readonly alpha: number },
): { readonly darknessAlpha: number; readonly vignetteScale: number } {
  if (lantern === null || lantern.alpha <= 0) {
    return { darknessAlpha: 0, vignetteScale: 1 };
  }
  if (tunnel.alpha <= 0 || lantern.radius <= tunnel.radius) {
    // The lantern is the tighter: the vignette only shows through what the
    // dark leaves — its tint still reads, its darkness does not stack.
    return { darknessAlpha: lantern.alpha, vignetteScale: 1 - lantern.alpha };
  }
  // The tunnel is the tighter: it does the darkening, and the room's own
  // dark only adds what the tunnel leaves uncovered.
  return { darknessAlpha: lantern.alpha * (1 - tunnel.alpha), vignetteScale: 1 };
}

const VERTEX_SHADER = /* glsl */ `
void main() {
  // Authored in clip space, like the gloom pass — no camera involved.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform vec2 uCentre;
uniform float uRadius;
uniform float uClear;
uniform float uAlpha;
uniform float uPixelScale;
uniform float uFrameHeight;
uniform vec3 uColour;

void main() {
  // gl_FragCoord is in drawing-buffer pixels, origin bottom-left; the
  // lantern's centre and radius are in internal pixels, origin top-left.
  vec2 at = vec2(gl_FragCoord.x, uFrameHeight - gl_FragCoord.y) / uPixelScale;
  float d = distance(at, uCentre);
  float dark = smoothstep(uRadius * uClear, uRadius, d);
  gl_FragColor = vec4(uColour, dark * uAlpha);
}
`;

/** The darkness quad, drawn between the world passes and the see-through pass. */
export class DarknessPass {
  private readonly scene = new Scene();
  /** Unused by the shader — the quad is already in clip space — but `render` needs *a* camera. */
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly material: ShaderMaterial;
  private readonly bufferSize = new Vector2();
  private readonly uCentre = { value: new Vector2() };
  private readonly uRadius = { value: 0 };
  private readonly uAlpha = { value: 0 };
  private readonly uPixelScale = { value: 1 };
  private readonly uFrameHeight = { value: INTERNAL_HEIGHT };

  constructor() {
    this.material = new ShaderMaterial({
      uniforms: {
        uCentre: this.uCentre,
        uRadius: this.uRadius,
        uClear: { value: CLEAR_FRACTION },
        uAlpha: this.uAlpha,
        uPixelScale: this.uPixelScale,
        uFrameHeight: this.uFrameHeight,
        uColour: { value: DARK_COLOUR },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      blending: NormalBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const quad = new Mesh(this.geometry, this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  /** Centres the lantern on `(x, y)` in internal pixels; `alpha` 0 switches the pass off. */
  set(x: number, y: number, radius: number, alpha: number): void {
    this.uCentre.value.set(x, y);
    this.uRadius.value = radius;
    this.uAlpha.value = alpha;
  }

  /** Whether this frame has any darkness to draw. */
  get active(): boolean {
    return this.uAlpha.value > 0;
  }

  /** Links the quad's program with everything else on the view's first frame, never mid-run. */
  compile(renderer: WebGLRenderer): void {
    renderer.compile(this.scene, this.camera);
  }

  /** Draws the darkness over whatever has been drawn so far. Caller has `autoClear` off. */
  render(renderer: WebGLRenderer): void {
    if (!this.active) {
      return;
    }
    renderer.getDrawingBufferSize(this.bufferSize);
    this.uFrameHeight.value = this.bufferSize.y;
    this.uPixelScale.value = this.bufferSize.y / INTERNAL_HEIGHT;
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
