import { MAX_WALL_LANTERNS } from './wall-lanterns.js';
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
 * Floor 3's lantern rooms (#404, reworked by #424): the room is in deep dusk,
 * and the only light in it is the lanterns on its walls. Tense, never unfair —
 * so the dusk is drawn *under* everything that warns the player about
 * something: `GameView.render` draws the world, then this pass, then the
 * see-through layer (`SEE_THROUGH_LAYER`) a second time on top — every
 * telegraph shape, every projectile, every particle (a poison cloud is
 * particles), and the bodies of enemies that are winding up right now. An
 * enemy that is merely standing in the dusk is a dim shape; one that is about
 * to hit you is not.
 *
 * #404 cut a clear circle around the player out of a near-black room. #424
 * took the circle away: the dusk is even across the room, light enough that
 * every shape in it still reads, and the pass instead leaves a soft-edged
 * hole over each lantern's pool (`world/wall-lanterns.ts`) so the real point
 * light there shows at full strength.
 *
 * A screen-space pass, like the Promille vignette — but in the world's own
 * frame rather than the UI layer's, because the UI layer is drawn over
 * everything and the dusk must not be.
 */

/** The accessibility setting (#404): how dark a lantern room is, if at all. */
export type DarknessLevel = 'full' | 'reduced' | 'off';

/** Every `DarknessLevel`, in the order the settings screen offers them. */
export const DARKNESS_LEVELS: readonly DarknessLevel[] = ['full', 'reduced', 'off'];

/**
 * How deep the dusk is per setting, as the pass's alpha. `Reduced` is a
 * clearly lighter dusk; `Off` is none — the room draws as an ordinary shaded
 * one. The lanterns hang and burn at every level: the setting is about how
 * much the player can see, not about whether the room has its character.
 */
export const DUSK: Readonly<Record<DarknessLevel, number | null>> = {
  full: 0.6,
  reduced: 0.35,
  off: null,
};

/** How many lantern pools the pass can leave clear — `MAX_WALL_LANTERNS`. */
export const MAX_DUSK_POOLS = MAX_WALL_LANTERNS;

/**
 * How much of a pool's radius is fully clear before the dusk starts to come
 * back. The rest is a smooth ramp, so a pool has no edge to step across.
 */
const CLEAR_FRACTION = 0.3;

/** The dusk itself — not pure black, a night-forest blue-green so the room still reads as a place. */
const DARK_COLOUR = new Vector3(0.02, 0.035, 0.04);

/**
 * What a lantern room and the Promille tunnel draw when both are on screen.
 *
 * Both darken the room, and laying one over the other multiplies them toward
 * black — the one combination #404 rules out. The dusk is the room and keeps
 * its strength; the tunnel is thinned by what the dusk already covers, so its
 * tint still reads at the edge of the screen and the two together are never
 * much darker than the darker of them alone.
 *
 * Returns the alpha to draw the dusk at and the scale to multiply the
 * vignette's own alpha by.
 */
export function stackWithTunnel(dusk: number | null): {
  readonly darknessAlpha: number;
  readonly vignetteScale: number;
} {
  if (dusk === null || dusk <= 0) {
    return { darknessAlpha: 0, vignetteScale: 1 };
  }
  return { darknessAlpha: dusk, vignetteScale: 1 - dusk };
}

const VERTEX_SHADER = /* glsl */ `
void main() {
  // Authored in clip space, like the gloom pass — no camera involved.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uPools[${String(MAX_DUSK_POOLS)}];
uniform float uClear;
uniform float uAlpha;
uniform float uPixelScale;
uniform float uFrameHeight;
uniform vec3 uColour;

void main() {
  // gl_FragCoord is in drawing-buffer pixels, origin bottom-left; a pool's
  // centre (xy) and radius (z) are in internal pixels, origin top-left.
  vec2 at = vec2(gl_FragCoord.x, uFrameHeight - gl_FragCoord.y) / uPixelScale;
  float dark = 1.0;
  for (int i = 0; i < ${String(MAX_DUSK_POOLS)}; i++) {
    // A pool nobody claimed has radius 0 and clears nothing.
    float radius = uPools[i].z;
    float d = distance(at, uPools[i].xy);
    dark *= radius > 0.0 ? smoothstep(radius * uClear, radius, d) : 1.0;
  }
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
  private readonly uPools = {
    value: Array.from({ length: MAX_DUSK_POOLS }, () => new Vector3()),
  };
  private readonly uAlpha = { value: 0 };
  private readonly uPixelScale = { value: 1 };
  private readonly uFrameHeight = { value: INTERNAL_HEIGHT };

  constructor() {
    this.material = new ShaderMaterial({
      uniforms: {
        uPools: this.uPools,
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

  /** How deep the dusk is this frame; 0 switches the pass off. */
  setAlpha(alpha: number): void {
    this.uAlpha.value = alpha;
  }

  /** Leaves pool `index` clear around `(x, y)` in internal pixels; `radius` 0 gives the slot back. */
  setPool(index: number, x: number, y: number, radius: number): void {
    this.uPools.value[index]?.set(x, y, radius);
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
