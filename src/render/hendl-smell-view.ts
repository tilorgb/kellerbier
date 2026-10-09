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
import { DAZE_RADIUS, PULSE_TICKS } from '../content/items/hendlgeruch.js';
import type { GameSim } from '../sim/game/sim.js';
import { lerp } from '../sim/math.js';
import { World } from '../sim/ecs/world.js';
import { STATUS_DAZE, STATUS_EFFECT_STRIDE } from '../sim/systems/status-effects.js';
import { alphaTexture, noise, softPuff } from './cloud-view.js';
import { ACTOR_LAYER } from './world/layers.js';

/**
 * The Hendlgeruch made visible: what the item does, drawn so it can be seen.
 *
 * - **The taste** — a soft brown-yellow disc on the floor out to the daze radius, breathing
 *   slowly, with a few smell wisps rising out of it. Always there while the item is held: it
 *   is where enemies get dazed.
 * - **The wind** — while a pulse runs, streaks sweep in from the pull edge toward that disc,
 *   curling as they go. They stop at the disc's rim, because that is where the pull stops.
 * - **The daze** — a few bubbles rising off every dazed enemy (their tint is
 *   `EntityView`'s). Dazed bodies can linger outside the disc for a second after leaving it.
 *
 * Reads only the sim (the item's own pulse clock in `ItemRuntimeState.timer`, the status
 * array), so it is render-only: a replay plays the same with or without it.
 */

const ITEM_ID = 'hendlgeruch';
/** The far edge of the pull — streaks start here. */
const PULL_EDGE = 100;
const STREAKS = 18;
const WISPS = 6;
const BUBBLE_BODIES = 12;
const BUBBLES_PER_BODY = 3;
const GOLDEN_ANGLE = 2.399963229728653;
/** How many times round the player a streak's spiral turns on its way in, in radians. */
const SWIRL = 1.3;
const STREAK_LENGTH = 15;
const STREAK_WIDTH = 2.2;
/** Room units a bubble climbs before it pops. */
const BUBBLE_RISE = 9;
const DISC_COLOUR = 0xc8902a;
const STREAK_COLOUR = 0xf0d28a;
const WISP_COLOUR = 0xf4dca0;
const BUBBLE_COLOUR = 0xd8e26a;

/** The soft disc: faint in the middle, a defined rim, a noisy edge. */
function smellDisc(): DataTexture {
  const size = 96;
  return alphaTexture(size, (x, y) => {
    const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
    if (d > 1) {
      return 0;
    }
    const rim = Math.max(0, 1 - Math.abs(d - 0.93) * 18);
    const body = 0.5 + 0.5 * noise(x + 20, y + 20, 12);
    return Math.min(1, 0.38 * body * (1 - d * 0.35) + rim * 0.55);
  });
}

/** A streak: bright at the head, a long thinning tail behind it. */
function streakTexture(): DataTexture {
  const w = 32;
  const h = 4;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (y * w + x) * 4;
      const along = x / (w - 1);
      const across = 1 - Math.abs((y + 0.5) / h - 0.5) * 2;
      data[at] = 255;
      data[at + 1] = 255;
      data[at + 2] = 255;
      data[at + 3] = Math.round(Math.pow(along, 1.6) * Math.pow(across, 0.7) * 255);
    }
  }
  const texture = new DataTexture(data, w, h, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** A bubble: a thin bright ring with a little glint. */
function bubbleTexture(): DataTexture {
  const size = 24;
  return alphaTexture(size, (x, y) => {
    const dx = (x + 0.5) / size - 0.5;
    const dy = (y + 0.5) / size - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const ring = Math.max(0, 1 - Math.abs(d - 0.8) * 7);
    const glint = Math.max(0, 1 - Math.hypot(dx + 0.18, dy + 0.18) * 9) * 0.9;
    const fill = d < 0.8 ? 0.18 : 0;
    return Math.min(1, ring + glint + fill);
  });
}

function material(map: DataTexture, color: number, side?: typeof DoubleSide): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map,
    color,
    transparent: true,
    depthWrite: false,
    ...(side === undefined ? {} : { side, forceSinglePass: true }),
  });
}

export class HendlSmellView {
  readonly group = new Group();
  private readonly disc: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly streaks: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly wisps: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly bubbles: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly discTexture = smellDisc();
  private readonly streakTex = streakTexture();
  private readonly puffTexture = softPuff();
  private readonly bubbleTex = bubbleTexture();
  private readonly flat = new PlaneGeometry(1, 1);
  private readonly standing = new PlaneGeometry(1, 1);
  private lean = 0;
  private bubblesUsed = 0;
  private clock = 0;

  constructor() {
    this.standing.translate(0, 0.5, 0);
    this.disc = new Mesh(this.flat, material(this.discTexture, DISC_COLOUR));
    this.disc.rotation.x = -Math.PI / 2;
    this.add(this.disc);
    for (let i = 0; i < STREAKS; i++) {
      const streak = new Mesh(this.flat, material(this.streakTex, STREAK_COLOUR, DoubleSide));
      streak.scale.set(STREAK_LENGTH, STREAK_WIDTH, 1);
      this.add(streak);
      this.streaks.push(streak);
    }
    for (let i = 0; i < WISPS; i++) {
      const wisp = new Mesh(this.standing, material(this.puffTexture, WISP_COLOUR, DoubleSide));
      this.add(wisp);
      this.wisps.push(wisp);
    }
    for (let i = 0; i < BUBBLE_BODIES * BUBBLES_PER_BODY; i++) {
      const bubble = new Mesh(this.standing, material(this.bubbleTex, BUBBLE_COLOUR, DoubleSide));
      this.add(bubble);
      this.bubbles.push(bubble);
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
    this.clock = nowMs;
    const held = sim.hasItem(ITEM_ID);
    this.syncSmell(sim, alpha, held);
    this.syncBubbles(sim, alpha);
  }

  private syncSmell(sim: GameSim, alpha: number, held: boolean): void {
    this.disc.visible = held;
    if (!held) {
      for (const streak of this.streaks) {
        streak.visible = false;
      }
      for (const wisp of this.wisps) {
        wisp.visible = false;
      }
      return;
    }
    const player = sim.playerIndex;
    const x = lerp(sim.previousX(player), sim.positionX(player), alpha);
    const y = lerp(sim.previousY(player), sim.positionY(player), alpha);
    const ticksLeft = sim.itemState(ITEM_ID).timer;
    const pulsing = ticksLeft > 0;
    const progress = pulsing ? Math.min(1, (PULSE_TICKS - ticksLeft + alpha) / PULSE_TICKS) : 0;
    // Swells in over the first fifth of the pulse and out over the last third.
    const envelope = pulsing ? Math.min(progress / 0.2, (1 - progress) / 0.33, 1) : 0;

    const seconds = this.clock / 1000;
    const breath = 1 + 0.035 * Math.sin(seconds * 2.1);
    const diameter = DAZE_RADIUS * 2 * breath;
    this.disc.scale.set(diameter, diameter, 1);
    this.disc.position.set(x, 0.35, y);
    this.disc.material.opacity = 0.5 + 0.14 * Math.sin(seconds * 2.1) + 0.2 * envelope;

    for (let i = 0; i < this.streaks.length; i++) {
      const streak = this.streaks[i];
      if (streak === undefined) {
        continue;
      }
      if (envelope <= 0.01) {
        streak.visible = false;
        continue;
      }
      // Each streak travels the pull's whole span once or twice, staggered round the ring.
      const u = (i / STREAKS + progress * 1.4) % 1;
      const angle = i * GOLDEN_ANGLE;
      const here = this.streakPoint(angle, u);
      const ahead = this.streakPoint(angle, Math.min(1, u + 0.04));
      const dx = ahead.x - here.x;
      const dz = ahead.z - here.z;
      streak.position.set(x + here.x, 0.45, y + here.z);
      streak.rotation.set(-Math.PI / 2, 0, Math.atan2(-dz, dx));
      streak.material.opacity = 0.8 * envelope * Math.sin(Math.PI * u);
      streak.visible = true;
    }

    for (let i = 0; i < this.wisps.length; i++) {
      const wisp = this.wisps[i];
      if (wisp === undefined) {
        continue;
      }
      const angle = i * GOLDEN_ANGLE + seconds * 0.15;
      const reach = DAZE_RADIUS * (0.45 + 0.35 * ((i * 0.37) % 1));
      const rise = (seconds * 4.5 + i * 3.1) % 10;
      const size = 8 + 3 * envelope;
      wisp.scale.set(size, size * 0.8, 1);
      wisp.position.set(
        x + Math.cos(angle) * reach + Math.sin(seconds + i) * 0.8,
        rise,
        y + Math.sin(angle) * reach * 0.8,
      );
      wisp.rotation.x = this.lean;
      const fade = 1 - rise / 10;
      wisp.material.opacity = (0.28 + 0.3 * envelope) * fade;
      wisp.visible = fade > 0.03;
    }
  }

  /** Where on the way in a streak is, relative to the player: radius eases in, the angle winds on as it goes. */
  private streakPoint(angle: number, u: number): { x: number; z: number } {
    const ease = 1 - Math.pow(1 - u, 1.6);
    const radius = lerp(PULL_EDGE, DAZE_RADIUS * 1.05, ease);
    const swirled = angle + (1 - u) * -SWIRL + SWIRL;
    this.point.x = Math.cos(swirled) * radius;
    this.point.z = Math.sin(swirled) * radius * 0.82;
    return this.point;
  }

  private readonly point = { x: 0, z: 0 };

  private syncBubbles(sim: GameSim, alpha: number): void {
    this.bubblesUsed = 0;
    const status = sim.statusEffect.data;
    const states = sim.world.states;
    const highWater = sim.world.highWater;
    let bodies = 0;
    const seconds = this.clock / 1000;
    for (let index = 0; index < highWater && bodies < BUBBLE_BODIES; index++) {
      if (states[index] !== World.ALIVE || index === sim.playerIndex) {
        continue;
      }
      if ((status[index * STATUS_EFFECT_STRIDE + STATUS_DAZE] ?? 0) <= 0) {
        continue;
      }
      bodies += 1;
      const x = lerp(sim.previousX(index), sim.positionX(index), alpha);
      const y = lerp(sim.previousY(index), sim.positionY(index), alpha);
      for (let j = 0; j < BUBBLES_PER_BODY; j++) {
        const bubble = this.bubbles[this.bubblesUsed];
        this.bubblesUsed += 1;
        if (bubble === undefined) {
          return;
        }
        const seed = index * 5 + j;
        const rise = (seconds * 7 + j * 3.1 + seed * 0.7) % BUBBLE_RISE;
        const wobble = Math.sin(seconds * 3 + seed) * 2;
        const size = 2.4 + 1.6 * ((seed * 0.43) % 1);
        bubble.scale.set(size, size, 1);
        bubble.position.set(x + (j - 1) * 3.2 + wobble, 3 + rise, y);
        bubble.rotation.x = this.lean;
        bubble.material.opacity = 0.9 * (1 - rise / BUBBLE_RISE);
        bubble.visible = true;
      }
    }
    for (let i = this.bubblesUsed; i < this.bubbles.length; i++) {
      const bubble = this.bubbles[i];
      if (bubble !== undefined) {
        bubble.visible = false;
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
    this.discTexture.dispose();
    this.streakTex.dispose();
    this.puffTexture.dispose();
    this.bubbleTex.dispose();
    this.group.removeFromParent();
  }
}
