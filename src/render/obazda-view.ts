import { type DataTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { CHEESE_CAPACITY } from '../sim/hazard/cheese-store.js';
import { CHEESE_SPREAD_TICKS } from '../sim/hazard/cheese.js';
import type { GameSim } from '../sim/game/sim.js';
import { alphaTexture, noise } from './cloud-view.js';
import { ACTOR_LAYER } from './world/layers.js';

/**
 * The Obazda made visible: the cheese it drops, drawn where it lies.
 *
 * Every few seconds a dollop falls from Alois and splats; the puddle spreads out to its full
 * size, stays put (that is where enemies are slowed — `sim.cheese`), shows a glossy highlight
 * and a blob that wells up and bursts now and then, and thins and shrinks over its last
 * seconds before it dries up.
 *
 * Reads only the sim, so it is render-only: a replay plays the same with or without it.
 */

const POOL_COLOUR = 0xe9a34a;
const GLOSS_COLOUR = 0xfff0c4;
const BLOB_COLOUR = 0xf2b85c;
const FLOOR_LIFT = 0.3;
/** Ticks the falling dollop takes to land; the puddle only starts spreading as it does. */
const FALL_TICKS = 8;
const FALL_HEIGHT = 14;
/** The last stretch of a puddle's life, in ticks, over which it thins out. */
const FADE_TICKS = 120;

/** A pool of spread: dense in the body, a defined bright rim, a lumpy edge. */
function poolTexture(): DataTexture {
  const size = 64;
  return alphaTexture(size, (x, y) => {
    const dx = (x + 0.5) / size - 0.5;
    const dy = (y + 0.5) / size - 0.5;
    const angle = Math.atan2(dy, dx);
    const edge = 0.92 + 0.05 * Math.sin(angle * 5) + 0.03 * Math.sin(angle * 9 + 1.3);
    const d = Math.hypot(dx, dy) * 2;
    if (d > edge) {
      return 0;
    }
    const rim = Math.max(0, 1 - (edge - d) * 12);
    const body = 0.5 + 0.5 * noise(x + 40, y + 40, 12);
    return Math.min(1, 0.55 + 0.2 * body + rim * 0.35);
  });
}

/** A glossy highlight: a small bright smear. */
function glossTexture(): DataTexture {
  const size = 32;
  return alphaTexture(size, (x, y) => {
    const dx = ((x + 0.5) / size - 0.5) * 2;
    const dy = ((y + 0.5) / size - 0.5) * 3.2;
    return Math.max(0, 1 - Math.hypot(dx, dy)) * 0.85;
  });
}

/** A fat blob with a lit upper edge. */
function blobTexture(): DataTexture {
  const size = 32;
  return alphaTexture(size, (x, y) => {
    const dx = (x + 0.5) / size - 0.5;
    const dy = (y + 0.5) / size - 0.5;
    if (Math.hypot(dx, dy) * 2 > 0.9) {
      return 0;
    }
    const lit = Math.max(0, 1 - Math.hypot(dx + 0.14, dy + 0.16) * 6);
    return Math.min(1, 0.85 + lit * 0.15);
  });
}

function material(map: DataTexture, color: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map,
    color,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

interface PuddleMeshes {
  readonly pool: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly gloss: Mesh<PlaneGeometry, MeshBasicMaterial>;
  /** Both the falling dollop and the blob that wells up out of a settled puddle. */
  readonly blob: Mesh<PlaneGeometry, MeshBasicMaterial>;
}

export class ObazdaView {
  readonly group = new Group();
  private readonly puddles: PuddleMeshes[] = [];
  private readonly poolTex = poolTexture();
  private readonly glossTex = glossTexture();
  private readonly blobTex = blobTexture();
  private readonly flat = new PlaneGeometry(1, 1);
  private readonly standing = new PlaneGeometry(1, 1);
  private lean = 0;

  constructor() {
    this.standing.translate(0, 0.5, 0);
    for (let i = 0; i < CHEESE_CAPACITY; i++) {
      const pool = new Mesh(this.flat, material(this.poolTex, POOL_COLOUR));
      pool.rotation.x = -Math.PI / 2;
      const gloss = new Mesh(this.flat, material(this.glossTex, GLOSS_COLOUR));
      gloss.rotation.x = -Math.PI / 2;
      const blob = new Mesh(this.standing, material(this.blobTex, BLOB_COLOUR));
      this.add(pool);
      this.add(gloss);
      this.add(blob);
      this.puddles.push({ pool, gloss, blob });
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

  sync(sim: GameSim, alpha: number, nowMs: number): void {
    const cheese = sim.cheese;
    let used = 0;
    const seconds = nowMs / 1000;
    cheese.forEachLive((index) => {
      const meshes = this.puddles[used];
      if (meshes === undefined) {
        return;
      }
      used += 1;
      const age = (cheese.age[index] ?? 0) + alpha;
      const life = cheese.lifetimeTicks[index] ?? 1;
      const full = cheese.radius[index] ?? 0;
      const x = cheese.x[index] ?? 0;
      const y = cheese.y[index] ?? 0;
      const { pool, gloss, blob } = meshes;

      // The drop: a dollop falls onto the spot, then the splat spreads.
      const falling = age < FALL_TICKS;
      const spread = Math.min(1, Math.max(0, (age - FALL_TICKS * 0.5) / CHEESE_SPREAD_TICKS));
      const fade = Math.min(1, Math.max(0, (life - age) / FADE_TICKS));
      const radius = full * spread * (0.78 + 0.22 * fade);
      const diameter = radius * 2;

      pool.visible = diameter > 0.5;
      pool.position.set(x, FLOOR_LIFT, y);
      pool.rotation.z = (index * 1.7) % 6.28;
      pool.scale.set(diameter, diameter, 1);
      pool.material.opacity = 0.7 * fade + 0.1;

      gloss.visible = pool.visible && fade > 0.2;
      const glossAngle = index * 2.4 + seconds * 0.2;
      gloss.position.set(
        x + Math.cos(glossAngle) * radius * 0.4,
        FLOOR_LIFT + 0.05,
        y + Math.sin(glossAngle) * radius * 0.34,
      );
      gloss.rotation.z = glossAngle + Math.PI / 2;
      gloss.scale.set(radius * 0.7, radius * 0.35, 1);
      gloss.material.opacity = (0.3 + 0.25 * Math.sin(seconds * 1.3 + index * 1.7)) * fade;

      blob.rotation.x = this.lean;
      if (falling) {
        // The dollop dropping onto the spot.
        const t = age / FALL_TICKS;
        const size = 4 + 2 * t;
        blob.visible = true;
        blob.scale.set(size, size, 1);
        blob.position.set(x, FLOOR_LIFT + (1 - t * t) * FALL_HEIGHT, y);
        blob.material.opacity = 0.95;
        return;
      }
      // A settled puddle: now and then a blob wells up out of it and bursts.
      const phase = seconds * 0.4 + index * 0.37;
      const cycle = phase % 1;
      const swell = Math.sin(Math.PI * Math.min(1, cycle * 1.2));
      const size = 1.2 + 0.28 * radius * swell;
      const spot = index * 3.1 + Math.floor(phase);
      blob.visible = swell > 0.05 && fade > 0.3;
      blob.scale.set(size, size, 1);
      blob.position.set(
        x + Math.cos(spot) * radius * 0.5,
        FLOOR_LIFT + cycle * 3,
        y + Math.sin(spot) * radius * 0.4,
      );
      blob.material.opacity = cycle > 0.9 ? (1 - cycle) * 10 * 0.85 : 0.85;
    });
    for (let i = used; i < this.puddles.length; i++) {
      const meshes = this.puddles[i];
      if (meshes !== undefined) {
        meshes.pool.visible = false;
        meshes.gloss.visible = false;
        meshes.blob.visible = false;
      }
    }
  }

  destroy(): void {
    this.group.traverse((object) => {
      if (object instanceof Mesh) {
        (object.material as MeshBasicMaterial).dispose();
      }
    });
    this.flat.dispose();
    this.standing.dispose();
    this.poolTex.dispose();
    this.glossTex.dispose();
    this.blobTex.dispose();
    this.group.removeFromParent();
  }
}
