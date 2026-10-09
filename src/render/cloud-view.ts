import {
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
} from 'three';
import type { GameSim } from '../sim/game/sim.js';
import { CLOUD_CAPACITY } from '../sim/hazard/cloud-store.js';
import { ACTOR_LAYER } from './world/layers.js';

/**
 * Poison clouds (#401, the Fliegenpilz's burst) drawn as a cloud: a low,
 * noisy haze lying on the floor out to the cloud's true radius, with a few
 * small puffs rising out of it and thinning as they go.
 *
 * It replaced a ring of motes dropped round the rim on the golden angle,
 * which read as a spell turning rather than gas. Ground fog was picked out of
 * three looks tried in the room (soft billows, hard pixel puffs, this): its
 * ragged rim says where the poison ends as plainly as the ring did, and
 * whatever stands inside — the mushroom, Alois — stays visible through it.
 *
 * Reads only the sim's cloud store, so it is render-only: a replay plays the
 * same with or without it. The wind-up's thin edge ring (`TelegraphShape.Cloud`)
 * sits on the same radius, so the warning and the haze line up.
 */

/** Small puffs rising out of each cloud. */
const PUFFS = 3;
const GOLDEN_ANGLE = 2.399963229728653;
/** Ticks a cloud takes to fade out at the end of its life. */
const FADE_OUT_TICKS = 24;
/** Room units a rising puff climbs before it has thinned away. */
const PUFF_RISE = 10;
/** The sickly luminous green of Floor 3, and its shade for every third puff. */
const POISON_LIGHT = 0xa8e06a;
const POISON_SHADE = 0x6a9a3a;

/** A deterministic 0..1 hash of two integers, for texture noise. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smoothed value noise at (x, y), cell size `cell`. */
export function noise(x: number, y: number, cell: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(gx, gy);
  const b = hash(gx + 1, gy);
  const c = hash(gx, gy + 1);
  const d = hash(gx + 1, gy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** A white texture whose alpha is `alpha(x, y)`, so a material colour tints it. */
export function alphaTexture(size: number, alpha: (x: number, y: number) => number): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const at = (y * size + x) * 4;
      data[at] = 255;
      data[at + 1] = 255;
      data[at + 2] = 255;
      data[at + 3] = Math.round(Math.max(0, Math.min(1, alpha(x, y))) * 255);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** The haze: dense and mottled in the middle, a ragged noisy rim at the edge. */
function fogDisc(): DataTexture {
  const size = 96;
  return alphaTexture(size, (x, y) => {
    const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
    const rim = 0.86 + 0.14 * noise(x, y, 7);
    const body = 0.55 + 0.45 * noise(x + 50, y + 50, 14);
    return d > rim ? 0 : Math.min(1, (rim - d) * 6) * 0.6 * body;
  });
}

/** A soft round puff with a lumpy edge. */
export function softPuff(): DataTexture {
  const size = 64;
  return alphaTexture(size, (x, y) => {
    const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
    const lump = 0.82 + 0.3 * noise(x, y, 9);
    return Math.pow(Math.max(0, 1 - d / lump), 1.4) * 0.9;
  });
}

export class CloudView {
  readonly group = new Group();
  private readonly discs: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly puffs: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly discTexture = fogDisc();
  private readonly puffTexture = softPuff();
  private lean = 0;
  /** Per-`sync` state for `drawCloud`, so `forEachLive` can take a bound method (`no-hot-allocation`). */
  private sim: GameSim | null = null;
  private alpha = 0;
  private discsUsed = 0;
  private puffsUsed = 0;
  private readonly visit = (index: number): void => {
    this.drawCloud(index);
  };

  constructor() {
    const disc = new PlaneGeometry(1, 1);
    const puff = new PlaneGeometry(1, 1);
    puff.translate(0, 0.5, 0);
    for (let i = 0; i < CLOUD_CAPACITY; i++) {
      const mesh = new Mesh(
        disc,
        new MeshBasicMaterial({
          map: this.discTexture,
          color: POISON_LIGHT,
          transparent: true,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      this.add(mesh);
      this.discs.push(mesh);
      for (let j = 0; j < PUFFS; j++) {
        const rising = new Mesh(
          puff,
          new MeshBasicMaterial({
            map: this.puffTexture,
            color: j === 0 ? POISON_SHADE : POISON_LIGHT,
            transparent: true,
            depthWrite: false,
            side: DoubleSide,
          }),
        );
        this.add(rising);
        this.puffs.push(rising);
      }
    }
  }

  private add(mesh: Mesh): void {
    mesh.visible = false;
    mesh.frustumCulled = false;
    // Drawn with the actors, over the room, like every other standing thing.
    mesh.layers.set(ACTOR_LAYER);
    this.group.add(mesh);
  }

  setLean(lean: number): void {
    this.lean = lean;
  }

  sync(sim: GameSim, alpha: number): void {
    this.sim = sim;
    this.alpha = alpha;
    this.discsUsed = 0;
    this.puffsUsed = 0;
    sim.clouds.forEachLive(this.visit);
    for (let i = this.discsUsed; i < this.discs.length; i++) {
      const disc = this.discs[i];
      if (disc !== undefined) {
        disc.visible = false;
      }
    }
    for (let i = this.puffsUsed; i < this.puffs.length; i++) {
      const puff = this.puffs[i];
      if (puff !== undefined) {
        puff.visible = false;
      }
    }
  }

  private drawCloud(index: number): void {
    const sim = this.sim;
    if (sim === null) {
      return;
    }
    const clouds = sim.clouds;
    const age = (clouds.age[index] ?? 0) + this.alpha;
    const life = clouds.lifetimeTicks[index] ?? 1;
    const full = clouds.radius[index] ?? 0;
    const grow = full > 0 ? clouds.currentRadius(index) / full : 0;
    const fade = Math.max(0, Math.min(1, (life - age) / FADE_OUT_TICKS));
    const x = clouds.x[index] ?? 0;
    const y = clouds.y[index] ?? 0;
    // Bursts out fast and settles: an ease-out on the sim's own growth.
    const burst = 1 - Math.pow(1 - grow, 3);

    const disc = this.discs[this.discsUsed];
    this.discsUsed += 1;
    if (disc !== undefined) {
      // A slow breath, not a turn — nothing here rotates.
      const size = full * 2 * burst * (1 + 0.04 * Math.sin(age * 0.12 + index));
      disc.scale.set(size, size, 1);
      disc.position.set(x, 0.35, y);
      disc.material.opacity = fade;
      disc.visible = size > 0;
    }

    for (let j = 0; j < PUFFS; j++) {
      const puff = this.puffs[this.puffsUsed];
      this.puffsUsed += 1;
      if (puff === undefined) {
        return;
      }
      const seed = index * 7 + j;
      const angle = seed * GOLDEN_ANGLE;
      const reach = full * 0.5 * burst;
      // Each climbs and thins, then starts again low: a steady seep upward.
      const rise = (age * 0.12 + j * 3) % PUFF_RISE;
      const wobble = Math.sin(age * 0.07 + seed * 1.3) * 0.8;
      const size = full * 0.35 * burst;
      puff.scale.set(size, size * 0.8, 1);
      puff.position.set(
        x + Math.cos(angle) * reach + wobble,
        rise,
        y + Math.sin(angle) * reach * 0.8,
      );
      puff.rotation.x = this.lean;
      const puffFade = fade * (1 - rise / PUFF_RISE);
      puff.material.opacity = 0.55 * puffFade;
      puff.visible = size > 0.5 && puffFade > 0.02;
    }
  }

  destroy(): void {
    this.group.traverse((object) => {
      if (object instanceof Mesh) {
        (object.material as MeshBasicMaterial).dispose();
      }
    });
    this.discs[0]?.geometry.dispose();
    this.puffs[0]?.geometry.dispose();
    this.discTexture.dispose();
    this.puffTexture.dispose();
    this.group.removeFromParent();
  }
}
