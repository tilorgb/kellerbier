import { type DataTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { AURA_RADIUS } from '../content/items/obazda.js';
import type { GameSim } from '../sim/game/sim.js';
import { lerp } from '../sim/math.js';
import { alphaTexture, noise } from './cloud-view.js';
import { ACTOR_LAYER } from './world/layers.js';

/**
 * The Obazda made visible: the cheese it spreads, drawn where it slows.
 *
 * A soft orange-cream pool on the floor out to the aura radius, following Alois, its rim
 * wobbling slowly and a few glossy highlights drifting across it; fat cheese blobs well up
 * out of it and burst. Anything standing in the pool is slowed (`STATUS_SLOW`, which the
 * enemies' own status look shows), so the disc is the exact edge of the effect.
 *
 * Reads only the sim, so it is render-only: a replay plays the same with or without it.
 */

const ITEM_ID = 'obazda';
const BLOBS = 7;
const BLOB_RISE = 7;
const POOL_COLOUR = 0xe9a34a;
const GLOSS_COLOUR = 0xfff0c4;
const BLOB_COLOUR = 0xf2b85c;
const FLOOR_LIFT = 0.3;
const GOLDEN_ANGLE = 2.399963229728653;

/** A pool of spread: opaque-ish in the body, a defined bright rim, a noisy edge. */
function poolTexture(): DataTexture {
  const size = 96;
  return alphaTexture(size, (x, y) => {
    const dx = (x + 0.5) / size - 0.5;
    const dy = (y + 0.5) / size - 0.5;
    const angle = Math.atan2(dy, dx);
    // The edge wanders: a lumpy outline, not a compass-drawn circle.
    const edge = 0.92 + 0.05 * Math.sin(angle * 5) + 0.03 * Math.sin(angle * 9 + 1.3);
    const d = Math.hypot(dx, dy) * 2;
    if (d > edge) {
      return 0;
    }
    const rim = Math.max(0, 1 - (edge - d) * 14);
    const body = 0.5 + 0.5 * noise(x + 40, y + 40, 14);
    return Math.min(1, 0.42 + 0.18 * body + rim * 0.4);
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
    const d = Math.hypot(dx, dy) * 2;
    if (d > 0.9) {
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

export class ObazdaView {
  readonly group = new Group();
  private readonly pool: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly gloss: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly blobs: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly poolTex = poolTexture();
  private readonly glossTex = glossTexture();
  private readonly blobTex = blobTexture();
  private readonly flat = new PlaneGeometry(1, 1);
  private readonly standing = new PlaneGeometry(1, 1);
  private lean = 0;

  constructor() {
    this.standing.translate(0, 0.5, 0);
    this.pool = new Mesh(this.flat, material(this.poolTex, POOL_COLOUR));
    this.pool.rotation.x = -Math.PI / 2;
    this.add(this.pool);
    for (let i = 0; i < 4; i++) {
      const gloss = new Mesh(this.flat, material(this.glossTex, GLOSS_COLOUR));
      gloss.rotation.x = -Math.PI / 2;
      this.add(gloss);
      this.gloss.push(gloss);
    }
    for (let i = 0; i < BLOBS; i++) {
      const blob = new Mesh(this.standing, material(this.blobTex, BLOB_COLOUR));
      this.add(blob);
      this.blobs.push(blob);
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
    const held = sim.hasItem(ITEM_ID);
    this.pool.visible = held;
    for (const gloss of this.gloss) {
      gloss.visible = held;
    }
    if (!held) {
      for (const blob of this.blobs) {
        blob.visible = false;
      }
      return;
    }
    const player = sim.playerIndex;
    const x = lerp(sim.previousX(player), sim.positionX(player), alpha);
    const y = lerp(sim.previousY(player), sim.positionY(player), alpha);
    const seconds = nowMs / 1000;

    const breath = 1 + 0.03 * Math.sin(seconds * 1.7);
    const diameter = AURA_RADIUS * 2 * breath;
    this.pool.position.set(x, FLOOR_LIFT, y);
    this.pool.rotation.z = seconds * 0.08;
    this.pool.scale.set(diameter, diameter, 1);
    this.pool.material.opacity = 0.62 + 0.08 * Math.sin(seconds * 1.7);

    for (let i = 0; i < this.gloss.length; i++) {
      const gloss = this.gloss[i];
      if (gloss === undefined) {
        continue;
      }
      const angle = i * GOLDEN_ANGLE + seconds * 0.22;
      const reach = AURA_RADIUS * (0.35 + 0.35 * ((i * 0.41) % 1));
      gloss.position.set(
        x + Math.cos(angle) * reach,
        FLOOR_LIFT + 0.05,
        y + Math.sin(angle) * reach * 0.85,
      );
      gloss.rotation.z = angle + Math.PI / 2;
      gloss.scale.set(10, 5, 1);
      gloss.material.opacity = 0.35 + 0.25 * Math.sin(seconds * 1.3 + i * 1.7);
    }

    for (let i = 0; i < this.blobs.length; i++) {
      const blob = this.blobs[i];
      if (blob === undefined) {
        continue;
      }
      // Each blob wells up, swells, and bursts; staggered so the pool never goes quiet.
      const cycle = (seconds * 0.55 + i / BLOBS) % 1;
      const angle = i * GOLDEN_ANGLE + Math.floor(seconds * 0.55 + i / BLOBS) * 1.9;
      const reach =
        AURA_RADIUS *
        (0.2 + 0.6 * ((i * 0.37 + Math.floor(seconds * 0.55 + i / BLOBS) * 0.23) % 1));
      const swell = Math.sin(Math.PI * Math.min(1, cycle * 1.15));
      const size = 1.5 + 3.2 * swell;
      blob.scale.set(size, size, 1);
      blob.position.set(
        x + Math.cos(angle) * reach,
        FLOOR_LIFT + cycle * BLOB_RISE * 0.5,
        y + Math.sin(angle) * reach * 0.85,
      );
      blob.rotation.x = this.lean;
      blob.material.opacity = cycle > 0.9 ? (1 - cycle) * 10 * 0.85 : 0.85;
      blob.visible = swell > 0.05;
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
