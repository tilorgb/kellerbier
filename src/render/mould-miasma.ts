import { NearestFilter } from 'three';
import { Container, Sprite, Texture, textureFromImage } from './gfx/index.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from './resolution.js';
import type { GameSim } from '../sim/game/sim.js';

/**
 * The Schimmelfleck's air (`GameSim.mouldPatchPresent`): while a patch lives
 * in the room the whole frame is washed a faint, swaying green — a mould
 * haze, not a fog, so the fight stays readable. Two soft blotchy layers,
 * each drifting on its own slow sine, breathe in and out of phase; the whole
 * veil fades in when the room turns mouldy and out once the last patch dies.
 * Render-only, like the Nebel veil: the sim never reads it. `reducedMotion`
 * holds the layers still and keeps only a steady tint.
 */

/** Texture size; drawn at 2x, so each haze pixel is a 2x2 block on screen. */
const TEX_W = 320;
const TEX_H = 180;
/** The haze's colour: Der Wald's sickly fungus green, darkened toward the cellar. */
const HAZE_RGB = [0x6a, 0xa8, 0x3a] as const;
/** How strong the veil gets, fully in. Kept low: "ganz leicht". */
const MAX_ALPHA = 0.22;
/** Seconds to fade fully in or out. */
const FADE_SECONDS = 1.5;
/** Each layer's sway: period in seconds, reach in internal pixels, and its phase. */
const LAYERS: readonly {
  readonly period: number;
  readonly reach: number;
  readonly phase: number;
}[] = [
  { period: 5.3, reach: 10, phase: 0 },
  { period: 7.1, reach: 14, phase: 2.1 },
];

/** Lattice value noise, periodic in both axes. */
function noise2(seed: number): (x: number, y: number, px: number, py: number) => number {
  const hash = (ix: number, iy: number): number => {
    let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  return (x, y, px, py) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const wx = (i: number): number => ((i % px) + px) % px;
    const wy = (i: number): number => ((i % py) + py) % py;
    const a = hash(wx(x0), wy(y0));
    const b = hash(wx(x0 + 1), wy(y0));
    const c = hash(wx(x0), wy(y0 + 1));
    const d = hash(wx(x0 + 1), wy(y0 + 1));
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** A soft green blotch field, seamless both ways so it can be tiled under a sway. */
function hazeTexture(seed: number): Texture {
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
  const noise = noise2(seed);
  for (let y = 0; y < TEX_H; y++) {
    for (let x = 0; x < TEX_W; x++) {
      let value = 0;
      let amplitude = 0.6;
      let cells = 4;
      for (let octave = 0; octave < 3; octave++) {
        value += amplitude * noise((x / TEX_W) * cells * 2, (y / TEX_H) * cells, cells * 2, cells);
        amplitude *= 0.5;
        cells *= 2;
      }
      // A floor of tint everywhere, thicker in the blotches; stepped, to read as pixel art.
      const density = 0.45 + 0.55 * Math.min(1, Math.max(0, (value - 0.35) / 0.4));
      const stepped = Math.round(density * 5) / 5;
      const i = (y * TEX_W + x) * 4;
      pixels.data[i] = HAZE_RGB[0];
      pixels.data[i + 1] = HAZE_RGB[1];
      pixels.data[i + 2] = HAZE_RGB[2];
      pixels.data[i + 3] = Math.round(stepped * 255);
    }
  }
  context.putImageData(pixels, 0, 0);
  const texture = textureFromImage(canvas);
  texture.source.texture.magFilter = NearestFilter;
  texture.source.texture.minFilter = NearestFilter;
  return texture;
}

export class MouldMiasma {
  readonly view = new Container();
  private readonly layers: {
    readonly view: Container;
    readonly period: number;
    readonly reach: number;
    readonly phase: number;
  }[] = [];
  /** 0 (clear) to 1 (fully in), eased toward the sim's state each frame. */
  private strength = 0;
  private lastMs: number | null = null;

  constructor() {
    for (const [index, layer] of LAYERS.entries()) {
      const texture = hazeTexture(index + 11);
      const view = new Container();
      // 3x3 tiles, so a sway of up to a tile's width in any direction never shows an edge.
      for (let row = -1; row <= 1; row++) {
        for (let column = -1; column <= 1; column++) {
          const sprite = new Sprite(texture);
          sprite.width = INTERNAL_WIDTH;
          sprite.height = INTERNAL_HEIGHT;
          sprite.x = column * INTERNAL_WIDTH;
          sprite.y = row * INTERNAL_HEIGHT;
          view.addChild(sprite);
        }
      }
      this.layers.push({ view, ...layer });
      this.view.addChild(view);
    }
    this.view.visible = false;
  }

  /** `nowMs` is a free-running clock (`performance.now()`); the sway is a function of it. */
  sync(sim: GameSim, nowMs: number, reducedMotion: boolean): void {
    const dt = this.lastMs === null ? 0 : Math.min(0.1, (nowMs - this.lastMs) / 1000);
    this.lastMs = nowMs;
    const target = sim.mouldPatchPresent ? 1 : 0;
    const step = dt / FADE_SECONDS;
    this.strength =
      target > this.strength
        ? Math.min(target, this.strength + step)
        : Math.max(target, this.strength - step);
    this.view.visible = this.strength > 0;
    if (!this.view.visible) {
      return;
    }
    const seconds = nowMs / 1000;
    for (const layer of this.layers) {
      const angle = (seconds / layer.period) * Math.PI * 2 + layer.phase;
      if (reducedMotion) {
        layer.view.x = 0;
        layer.view.y = 0;
        layer.view.alpha = (MAX_ALPHA / this.layers.length) * this.strength;
        continue;
      }
      layer.view.x = Math.round(Math.sin(angle) * layer.reach);
      layer.view.y = Math.round(Math.cos(angle * 0.7) * layer.reach * 0.5);
      // Each layer breathes, so the green swells and ebbs rather than sitting flat.
      const breath = 0.7 + 0.3 * Math.sin(angle * 1.3);
      layer.view.alpha = (MAX_ALPHA / this.layers.length) * breath * this.strength;
    }
  }
}
