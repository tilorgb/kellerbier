import {
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import type { GameSim } from '../sim/game/sim.js';
import { WeatherPhase } from '../sim/hazard/weather.js';
import { ACTOR_LAYER } from './world/layers.js';
import type { LightingRig } from './world/lighting.js';

/**
 * Snow falling through every room of Die Alpen (#40): the floor's ambient
 * weather, as distinct from the avalanche and the gust `WeatherView` draws
 * off `sim.weather`, which are hazards with a clock.
 *
 * Render-only, like `CloudView`: nothing here reads a random stream or writes
 * the sim. Every flake's position is a pure function of its index and
 * `sim.tick` (plus the frame's interpolation alpha), so a replay snows the
 * same, a paused game holds its flakes still, and two clients at the same
 * tick show the same sky. The one piece of sim state it *reads* is the wind
 * gust: while a lane is blowing, the flakes lean with it, which is the
 * atmospheric half of a warning the hatched band and the sim's streaking
 * snow dust already give.
 *
 * Off under reduced motion — a screen full of drifting points is exactly what
 * that setting is for — and off on every floor whose light rig is not
 * `'alpine'`, read at the same moment `Lighting.onRoomChanged` reads it.
 */

/** Flakes in the air at once. A light fall, not a whiteout — the room has to stay readable. */
const FLAKES = 110;
/** Room units above the floor a flake starts its fall. */
const FALL_HEIGHT = 46;
/** Ticks a flake takes to fall `FALL_HEIGHT`, at the slowest and the fastest. */
const FALL_TICKS_MIN = 330;
const FALL_TICKS_MAX = 540;
/** Room units of sideways drift a gust adds at full strength. */
const GUST_DRIFT = 9;
/** Room units a flake is drawn across. */
const FLAKE_SIZE = 0.8;
const SNOW_COLOUR = 0xeef2f5;

/** A deterministic 0..1 hash of two integers — same as `CloudView`'s. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export class SnowfallView {
  readonly group = new Group();
  private readonly mesh: InstancedMesh;
  private readonly geometry = new PlaneGeometry(FLAKE_SIZE, FLAKE_SIZE);
  private readonly material = new MeshBasicMaterial({
    color: SNOW_COLOUR,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    side: DoubleSide,
  });
  private alpine = false;
  private reducedMotion = false;
  private lean = 0;
  /** Scratch for `sync` — reused every frame (`no-hot-allocation`). */
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly up = new Vector3(1, 0, 0);

  constructor() {
    this.mesh = new InstancedMesh(this.geometry, this.material, FLAKES);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.layers.set(ACTOR_LAYER);
    this.group.add(this.mesh);
  }

  /** Snow only falls on the floor whose light is `'alpine'`. Read on every room change. */
  setRig(rig: LightingRig): void {
    this.alpine = rig === 'alpine';
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
  }

  /** The camera's lean (`CloudView.setLean`): flakes are turned to face it. */
  setLean(lean: number): void {
    this.lean = lean;
  }

  sync(sim: GameSim, alpha: number): void {
    const visible = this.alpine && !this.reducedMotion;
    this.mesh.visible = visible;
    if (!visible) {
      return;
    }
    const room = sim.room;
    const width = room.maxX - room.minX;
    const depth = room.maxY - room.minY;
    const time = sim.tick + alpha;
    // A gust leans every flake downwind for as long as a lane is blowing.
    const wind = sim.weather.wind;
    const gust =
      wind.count > 0 && wind.phase === WeatherPhase.Active
        ? sim.weather.windDirection * GUST_DRIFT
        : 0;
    this.rotation.setFromAxisAngle(this.up, this.lean);
    for (let i = 0; i < FLAKES; i++) {
      const seedX = hash(i, 1);
      const seedZ = hash(i, 2);
      const seedT = hash(i, 3);
      const seedS = hash(i, 4);
      const fallTicks = FALL_TICKS_MIN + (FALL_TICKS_MAX - FALL_TICKS_MIN) * seedS;
      const fall = (time / fallTicks + seedT) % 1;
      const sway = Math.sin(time * 0.015 + i * 1.7) * 1.5;
      const x = room.minX + ((seedX * width + sway + gust * fall + width) % width);
      const z = room.minY + seedZ * depth;
      const y = FALL_HEIGHT * (1 - fall);
      this.position.set(x, y, z);
      // Small far off, a touch bigger low down, so the fall reads as depth too.
      const size = 0.7 + 0.5 * fall;
      this.scale.set(size, size, 1);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  destroy(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
