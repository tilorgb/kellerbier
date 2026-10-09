import { NearestFilter } from 'three';
import { Container, Sprite, Texture, textureFromImage } from './gfx/index.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from './resolution.js';
import type { GameSim } from '../sim/game/sim.js';

/**
 * Nebel (#49), made visible: a white veil of drifting cloud over the world,
 * under the HUD. Until now the curse showed only as a missing minimap.
 *
 * A static edge haze (thick at the frame's border, clear in
 * the middle, so the fight stays readable) under one cloud layer that drifts
 * sideways. The cloud layer is two copies of a
 * horizontally seamless texture side by side, so the drift wraps without a
 * seam. Render-only, like Blaue Stunde's overlay: the sim never reads it.
 * `reducedMotion` stops the drift and thins the clouds.
 */

/** Texture size; drawn at 2x, so each cloud pixel is a 2x2 block on screen. */
const TEX_W = 320;
const TEX_H = 180;
/** The cloud layers: drift speed in internal pixels per second, and opacity. */
const CLOUD_LAYERS: readonly { readonly speed: number; readonly alpha: number }[] = [
  { speed: 6, alpha: 0.3 },
];
const EDGE_ALPHA = 0.55;
const REDUCED_MOTION_ALPHA_SCALE = 0.7;

/** Lattice value noise, periodic in x with period `period` cells. */
function valueNoise(seed: number): (x: number, y: number, period: number) => number {
  const hash = (ix: number, iy: number): number => {
    let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  return (x, y, period) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const wrap = (ix: number): number => ((ix % period) + period) % period;
    const a = hash(wrap(x0), y0);
    const b = hash(wrap(x0 + 1), y0);
    const c = hash(wrap(x0), y0 + 1);
    const d = hash(wrap(x0 + 1), y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

function canvasTexture(draw: (pixels: ImageData) => void): Texture {
  if (typeof document === 'undefined') {
    return Texture.EMPTY;
  }
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const context = canvas.getContext('2d');
  if (context === null) {
    return Texture.EMPTY;
  }
  const pixels = context.createImageData(TEX_W, TEX_H);
  draw(pixels);
  context.putImageData(pixels, 0, 0);
  const texture = textureFromImage(canvas);
  texture.source.texture.magFilter = NearestFilter;
  texture.source.texture.minFilter = NearestFilter;
  return texture;
}

/** Patchy cloud: fractal noise, thresholded so there are gaps between banks. */
function cloudTexture(seed: number): Texture {
  const noise = valueNoise(seed);
  return canvasTexture((pixels) => {
    for (let y = 0; y < TEX_H; y++) {
      for (let x = 0; x < TEX_W; x++) {
        let value = 0;
        let amplitude = 0.55;
        let cells = 6;
        for (let octave = 0; octave < 4; octave++) {
          value += amplitude * noise((x / TEX_W) * cells, (y / TEX_W) * cells + octave * 17, cells);
          amplitude *= 0.5;
          cells *= 2;
        }
        const density = Math.min(1, Math.max(0, (value - 0.47) / 0.3));
        // Four alpha steps rather than a smooth ramp — reads as pixel art.
        const stepped = Math.round(density * 4) / 4;
        const i = (y * TEX_W + x) * 4;
        pixels.data[i] = 255;
        pixels.data[i + 1] = 255;
        pixels.data[i + 2] = 255;
        pixels.data[i + 3] = Math.round(stepped * 255);
      }
    }
  });
}

/** Static haze: alpha grows toward the frame's edges, clear in an oval centre. */
function edgeTexture(): Texture {
  const noise = valueNoise(99);
  return canvasTexture((pixels) => {
    for (let y = 0; y < TEX_H; y++) {
      for (let x = 0; x < TEX_W; x++) {
        const dx = (x + 0.5) / TEX_W - 0.5;
        const dy = (y + 0.5) / TEX_H - 0.5;
        const distance = Math.sqrt(dx * dx * 4 + dy * dy * 4);
        const wobble = (noise(x / 20, y / 20, TEX_W) - 0.5) * 0.25;
        const haze = Math.min(1, Math.max(0, (distance + wobble - 0.45) / 0.5));
        const stepped = Math.round(haze * 5) / 5;
        const i = (y * TEX_W + x) * 4;
        pixels.data[i] = 255;
        pixels.data[i + 1] = 255;
        pixels.data[i + 2] = 255;
        pixels.data[i + 3] = Math.round(stepped * 255);
      }
    }
  });
}

export class NebelVeil {
  readonly view = new Container();
  private readonly edge: Sprite;
  private readonly layers: {
    readonly view: Container;
    readonly speed: number;
    readonly alpha: number;
  }[] = [];
  private frozenAtMs: number | null = null;

  /** `force` shows the veil whatever the floor's curse — the dev `?nebel` preview. */
  constructor(private readonly force = false) {
    this.edge = new Sprite(edgeTexture());
    this.edge.width = INTERNAL_WIDTH;
    this.edge.height = INTERNAL_HEIGHT;
    this.view.addChild(this.edge);
    for (const [index, { speed, alpha }] of CLOUD_LAYERS.entries()) {
      const texture = cloudTexture(index + 1);
      const layer = new Container();
      for (let copy = 0; copy < 2; copy++) {
        const sprite = new Sprite(texture);
        sprite.width = INTERNAL_WIDTH;
        sprite.height = INTERNAL_HEIGHT;
        sprite.x = copy * INTERNAL_WIDTH;
        layer.addChild(sprite);
      }
      this.layers.push({ view: layer, speed, alpha });
      this.view.addChild(layer);
    }
    this.view.visible = false;
  }

  /** `nowMs` is a free-running clock (`performance.now()`); the drift is a function of it. */
  sync(sim: GameSim, nowMs: number, reducedMotion: boolean): void {
    const active = this.force || sim.curse === 'nebel';
    this.view.visible = active;
    if (!active) {
      return;
    }
    // Reduced motion holds the clouds where they are rather than snapping them back.
    if (reducedMotion) {
      this.frozenAtMs ??= nowMs;
    } else {
      this.frozenAtMs = null;
    }
    const clock = this.frozenAtMs ?? nowMs;
    const alphaScale = reducedMotion ? REDUCED_MOTION_ALPHA_SCALE : 1;
    this.edge.alpha = EDGE_ALPHA * alphaScale;
    for (const layer of this.layers) {
      const travelled = (layer.speed * clock) / 1000;
      const offset = ((travelled % INTERNAL_WIDTH) + INTERNAL_WIDTH) % INTERNAL_WIDTH;
      layer.view.x = Math.round(-offset);
      layer.view.alpha = layer.alpha * alphaScale;
    }
  }
}
