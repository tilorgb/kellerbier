import { type DataTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { GameSim } from '../sim/game/sim.js';
import { lerp } from '../sim/math.js';
import { World } from '../sim/ecs/world.js';
import { ENEMY_STRIDE } from '../sim/systems/enemy.js';
import { alphaTexture, noise, softPuff } from './cloud-view.js';
import { ACTOR_LAYER } from './world/layers.js';

/**
 * A Schimmelfleck's shimmer: a faint green glow on the floor round every
 * living patch and a column of green haze curling up out of it, tall enough
 * to be seen over a boulder — so in a big room the player can find the mould
 * that is still slowing them (`GameSim.stepMould`) by looking for the green.
 * Same look as the room-wide `MouldMiasma`, only where the mould is.
 *
 * Reads only the sim, so it is render-only: a replay plays the same with or
 * without it.
 */

/** How many patches get a shimmer at once; any more in one room is not a case the roster makes. */
const MAX_PATCHES = 8;
const WISPS_PER_PATCH = 5;
/** The glow on the floor, in room units across. */
const DISC_DIAMETER = 44;
/** Room units a wisp climbs before it has faded out. */
const WISP_RISE = 34;
const GOLDEN_ANGLE = 2.399963229728653;
const DISC_COLOUR = 0x6aa83a;
const WISP_COLOUR = 0x9fe066;

/** The floor glow: soft, densest at the middle, blotchy like the miasma. */
function glowDisc(): DataTexture {
  const size = 64;
  return alphaTexture(size, (x, y) => {
    const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
    if (d > 1) {
      return 0;
    }
    const body = 0.6 + 0.4 * noise(x + 7, y + 3, 10);
    return Math.min(1, body * Math.pow(1 - d, 1.4));
  });
}

function material(map: DataTexture, color: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map,
    color,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    forceSinglePass: true,
  });
}

interface Shimmer {
  readonly disc: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly wisps: Mesh<PlaneGeometry, MeshBasicMaterial>[];
}

export class MouldGlowView {
  readonly group = new Group();
  private readonly shimmers: Shimmer[] = [];
  private readonly discTexture = glowDisc();
  private readonly puffTexture = softPuff();
  private readonly flat = new PlaneGeometry(1, 1);
  private readonly standing = new PlaneGeometry(1, 1);
  private lean = 0;

  constructor() {
    this.standing.translate(0, 0.5, 0);
    for (let i = 0; i < MAX_PATCHES; i++) {
      const disc = new Mesh(this.flat, material(this.discTexture, DISC_COLOUR));
      disc.rotation.x = -Math.PI / 2;
      this.add(disc);
      const wisps: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
      for (let j = 0; j < WISPS_PER_PATCH; j++) {
        const wisp = new Mesh(this.standing, material(this.puffTexture, WISP_COLOUR));
        this.add(wisp);
        wisps.push(wisp);
      }
      this.shimmers.push({ disc, wisps });
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
    const seconds = nowMs / 1000;
    const states = sim.world.states;
    const highWater = sim.world.highWater;
    let used = 0;
    for (let index = 0; index < highWater && used < MAX_PATCHES; index++) {
      if (states[index] !== World.ALIVE || index === sim.playerIndex) {
        continue;
      }
      if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
        continue;
      }
      if (sim.enemies.at(sim.enemy.data[index * ENEMY_STRIDE] ?? 0).mould !== 2) {
        continue;
      }
      const shimmer = this.shimmers[used];
      used += 1;
      if (shimmer === undefined) {
        break;
      }
      const x = lerp(sim.previousX(index), sim.positionX(index), alpha);
      const y = lerp(sim.previousY(index), sim.positionY(index), alpha);
      const phase = index * 1.7;
      const breath = Math.sin(seconds * 1.6 + phase);
      const diameter = DISC_DIAMETER * (1 + 0.06 * breath);
      shimmer.disc.scale.set(diameter, diameter * 0.85, 1);
      shimmer.disc.position.set(x, 0.3, y);
      shimmer.disc.material.opacity = 0.42 + 0.12 * breath;
      shimmer.disc.visible = true;
      for (let j = 0; j < shimmer.wisps.length; j++) {
        const wisp = shimmer.wisps[j];
        if (wisp === undefined) {
          continue;
        }
        const rise = (seconds * 6 + j * (WISP_RISE / WISPS_PER_PATCH) + phase * 3) % WISP_RISE;
        const angle = j * GOLDEN_ANGLE + phase;
        // Curls out a little as it climbs, so the column sways rather than stands.
        const drift = 3 + rise * 0.18;
        const size = 9 + rise * 0.25;
        wisp.scale.set(size, size * 0.8, 1);
        wisp.position.set(
          x + Math.cos(angle + seconds * 0.6) * drift,
          rise,
          y + Math.sin(angle + seconds * 0.6) * drift * 0.5,
        );
        wisp.rotation.x = this.lean;
        // Fades in off the floor and out at the top.
        const life = rise / WISP_RISE;
        wisp.material.opacity = 0.42 * Math.min(1, life * 5) * (1 - life);
        wisp.visible = true;
      }
    }
    for (let i = used; i < this.shimmers.length; i++) {
      const shimmer = this.shimmers[i];
      if (shimmer === undefined) {
        continue;
      }
      shimmer.disc.visible = false;
      for (const wisp of shimmer.wisps) {
        wisp.visible = false;
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
    this.puffTexture.dispose();
    this.group.removeFromParent();
  }
}
