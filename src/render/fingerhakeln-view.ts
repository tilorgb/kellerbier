import {
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
} from 'three';
import {
  CONTACT_INTERVAL_TICKS,
  CONTACT_RADIUS,
  PULL_REACH,
} from '../content/items/fingerhakeln.js';
import { CollisionLayer } from '../sim/collision/layers.js';
import { World } from '../sim/ecs/world.js';
import { promilleRequirementMet } from '../sim/game/promille.js';
import type { GameSim } from '../sim/game/sim.js';
import { lerp, vectorLength } from '../sim/math.js';
import { alphaTexture } from './cloud-view.js';
import { ACTOR_LAYER } from './world/layers.js';

/**
 * The Fingerhakeln made visible: the two things it does, drawn on the floor.
 *
 * - **The drag** — a twisted rope from Alois to every enemy inside the pull's reach, its
 *   knots sliding toward him: whoever is on a rope is being hauled in. The rope strains
 *   (thicker, brighter) as the next bite nears.
 * - **The bite** — a ring that contracts from outside the bite radius onto it over the
 *   bite's own countdown, so the rhythm can be read ahead of time; on the bite it snaps, the
 *   ropes flare red for a moment and a ring bursts outward from the bite radius.
 *
 * Reads only the sim (`ItemRuntimeState.timer` is the bite clock), so it is render-only: a
 * replay plays the same with or without it.
 */

const ITEM_ID = 'fingerhakeln';
/** Ropes drawn at once; a room rarely holds more enemies than this inside the reach. */
const MAX_ROPES = 10;
/** Centre-to-centre slack on the reach: the sim pulls on collider overlap, not on centres. */
const REACH_SLACK = 6;
const ROPE_COLOUR = 0xf4dc98;
const BITE_COLOUR = 0xff5a44;
const RING_COLOUR = 0xe0a050;
const ROPE_WIDTH = 2.4;
const ROPE_STRAIN_WIDTH = 1.6;
/** Room units of rope per repeat of the twist pattern. */
const ROPE_REPEAT = 8;
/** Texture scroll per second: knots travel toward Alois. */
const ROPE_SPEED = 1.4;
/** How far outside the bite radius the wind-up ring starts, as a multiple of it. */
const WINDUP_START = 2.2;
const BITE_FLASH_MS = 160;
const BITE_BURST_GROWTH = 0.7;
const FLOOR_LIFT = 0.45;
const MASK = CollisionLayer.Enemy | CollisionLayer.Obstacle;

/** A twisted rope seen from above: slanted dark and light strands along its length. */
function ropeTexture(): DataTexture {
  const w = 16;
  const h = 4;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (y * w + x) * 4;
      const strand = (x + y * 2) % 8 < 4 ? 1 : 0.55;
      const across = 1 - Math.abs((y + 0.5) / h - 0.5) * 2;
      const value = Math.round(255 * strand);
      data[at] = value;
      data[at + 1] = value;
      data[at + 2] = value;
      data[at + 3] = Math.round(Math.pow(across, 0.5) * 255);
    }
  }
  const texture = new DataTexture(data, w, h, RGBAFormat);
  texture.wrapS = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** A thin ring, bright at the rim. */
function ringTexture(): DataTexture {
  const size = 64;
  return alphaTexture(size, (x, y) => {
    const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
    return Math.max(0, 1 - Math.abs(d - 0.92) * 14);
  });
}

export class FingerhakelnView {
  readonly group = new Group();
  private readonly ropes: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly ropeTextures: DataTexture[] = [];
  private readonly windup: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly burst: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly ringTex = ringTexture();
  private readonly flat = new PlaneGeometry(1, 1);
  private lastTimer = 0;
  private biteAtMs = -1e9;

  constructor() {
    const base = ropeTexture();
    for (let i = 0; i < MAX_ROPES; i++) {
      const map = base.clone();
      map.needsUpdate = true;
      const rope = new Mesh(
        this.flat,
        new MeshBasicMaterial({
          map,
          color: ROPE_COLOUR,
          transparent: true,
          depthWrite: false,
          side: DoubleSide,
          forceSinglePass: true,
        }),
      );
      this.add(rope);
      this.ropes.push(rope);
      this.ropeTextures.push(map);
    }
    base.dispose();
    this.windup = this.makeRing();
    this.burst = this.makeRing();
  }

  private makeRing(): Mesh<PlaneGeometry, MeshBasicMaterial> {
    const ring = new Mesh(
      this.flat,
      new MeshBasicMaterial({
        map: this.ringTex,
        color: RING_COLOUR,
        transparent: true,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    this.add(ring);
    return ring;
  }

  private add(mesh: Mesh): void {
    mesh.visible = false;
    mesh.frustumCulled = false;
    // Drawn with the actors, over the room, like every other standing thing.
    mesh.layers.set(ACTOR_LAYER);
    this.group.add(mesh);
  }

  sync(sim: GameSim, alpha: number, nowMs: number): void {
    // Rausch-only (`promilleRequirement`): sober, the item is dormant and nothing is drawn — `ItemGateHud` says why.
    if (!sim.hasItem(ITEM_ID) || !promilleRequirementMet('rausch', sim.promilleTier)) {
      this.hideAll();
      this.lastTimer = 0;
      return;
    }
    const player = sim.playerIndex;
    const x = lerp(sim.previousX(player), sim.positionX(player), alpha);
    const y = lerp(sim.previousY(player), sim.positionY(player), alpha);

    const timer = sim.itemState(ITEM_ID).timer;
    if (timer > this.lastTimer && this.lastTimer > 0) {
      this.biteAtMs = nowMs;
    }
    this.lastTimer = timer;
    // 0 right after a bite, 1 on the tick of the next one.
    const strain = Math.min(1, Math.max(0, 1 - (timer - alpha) / CONTACT_INTERVAL_TICKS));
    const sinceBite = nowMs - this.biteAtMs;
    const flash = sinceBite >= 0 && sinceBite < BITE_FLASH_MS ? 1 - sinceBite / BITE_FLASH_MS : 0;

    this.syncRopes(sim, alpha, nowMs, x, y, strain, flash);
    this.syncRings(x, y, strain, flash, sinceBite);
  }

  private syncRopes(
    sim: GameSim,
    alpha: number,
    nowMs: number,
    x: number,
    y: number,
    strain: number,
    flash: number,
  ): void {
    const states = sim.world.states;
    const highWater = sim.world.highWater;
    let used = 0;
    for (let index = 0; index < highWater && used < MAX_ROPES; index++) {
      if (states[index] !== World.ALIVE || index === sim.playerIndex) {
        continue;
      }
      if (((sim.collision.data[index * 2] ?? 0) & MASK) === 0 || sim.isBomb(index)) {
        continue;
      }
      if ((sim.health.data[index * 2] ?? 0) <= 0) {
        continue;
      }
      const ex = lerp(sim.previousX(index), sim.positionX(index), alpha);
      const ey = lerp(sim.previousY(index), sim.positionY(index), alpha);
      const dx = ex - x;
      const dy = ey - y;
      const length = vectorLength(dx, dy);
      if (length > PULL_REACH + REACH_SLACK || length < 1) {
        continue;
      }
      const rope = this.ropes[used];
      const map = this.ropeTextures[used];
      used += 1;
      if (rope === undefined || map === undefined) {
        continue;
      }
      rope.position.set(x + dx / 2, FLOOR_LIFT, y + dy / 2);
      rope.rotation.set(-Math.PI / 2, 0, Math.atan2(-dy, dx));
      rope.scale.set(length, ROPE_WIDTH + ROPE_STRAIN_WIDTH * strain, 1);
      map.repeat.x = length / ROPE_REPEAT;
      map.offset.x = (nowMs / 1000) * ROPE_SPEED;
      // Fades out toward the edge of the reach: the far end is only just caught.
      const reachFade = 1 - Math.max(0, (length - PULL_REACH * 0.6) / (PULL_REACH * 0.6));
      rope.material.opacity = (0.8 + 0.2 * strain) * Math.max(0.25, reachFade);
      rope.material.color.setHex(flash > 0 ? BITE_COLOUR : ROPE_COLOUR);
      rope.visible = true;
    }
    for (let i = used; i < this.ropes.length; i++) {
      const rope = this.ropes[i];
      if (rope !== undefined) {
        rope.visible = false;
      }
    }
  }

  private syncRings(x: number, y: number, strain: number, flash: number, sinceBite: number): void {
    // The wind-up: closes from outside onto the bite radius as the next bite nears.
    const closing = lerp(WINDUP_START, 1, strain * strain);
    const windupDiameter = CONTACT_RADIUS * 2 * closing;
    this.windup.position.set(x, FLOOR_LIFT, y);
    this.windup.scale.set(windupDiameter, windupDiameter, 1);
    this.windup.material.opacity = 0.15 + 0.6 * strain;
    this.windup.visible = true;

    const bursting = sinceBite >= 0 && sinceBite < BITE_FLASH_MS * 2;
    this.burst.visible = bursting;
    if (bursting) {
      const t = sinceBite / (BITE_FLASH_MS * 2);
      const diameter = CONTACT_RADIUS * 2 * (1 + BITE_BURST_GROWTH * t);
      this.burst.position.set(x, FLOOR_LIFT + 0.05, y);
      this.burst.scale.set(diameter, diameter, 1);
      this.burst.material.color.setHex(BITE_COLOUR);
      this.burst.material.opacity = 0.9 * (1 - t) + 0.1 * flash;
    }
  }

  private hideAll(): void {
    for (const rope of this.ropes) {
      rope.visible = false;
    }
    this.windup.visible = false;
    this.burst.visible = false;
  }

  destroy(): void {
    this.group.traverse((object) => {
      if (object instanceof Mesh) {
        (object.material as MeshBasicMaterial).dispose();
      }
    });
    for (const texture of this.ropeTextures) {
      texture.dispose();
    }
    this.flat.dispose();
    this.ringTex.dispose();
    this.group.removeFromParent();
  }
}
