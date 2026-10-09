import {
  AdditiveBlending,
  CircleGeometry,
  DataTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  RingGeometry,
} from 'three';
import { WALLER_HALF_ANGLE, WALLER_RANGE } from '../content/items/waller-kopf.js';
import { PLAYER_FOOTPRINT, type GameSim } from '../sim/game/sim.js';
import { lerp } from '../sim/math.js';
import { LASER_BEAM_TICKS, LASER_ITEM_ID, laserWindupTicks } from '../sim/systems/laser-shot.js';
import {
  LOB_ARC_HEIGHT,
  LOB_CAPACITY,
  LOB_DIAGONAL_OFFSET,
  LOB_DIAGONAL_RADIUS,
  LOB_DIRECT_RADIUS,
  lobProgress,
} from '../sim/systems/lobs.js';
import { softPuff } from './cloud-view.js';
import { ACTOR_LAYER } from './world/layers.js';

/**
 * What a handful of held items look like in the room, drawn procedurally —
 * placeholder-tier art until the pixel-art sign-off round (`CLAUDE.md`):
 *
 * - **Roter Stier** — a pair of white wings on Alois's back, flapping, faster
 *   while he is moving.
 * - **Waller-Kopf** — the cone on the floor out to the scare range, pointing
 *   the way he last walked: whatever stands in it is about to be scared.
 * - **Leberkas** — each lobbed Semmel in its arc, its shadow, and a marker
 *   where it will land and where the four diagonal blasts will go off.
 * - **Pfeitinger Ultrabräu** — the charge building at the nozzle, and the
 *   beam that leaves it.
 *
 * Reads only the sim, so it is render-only: a replay plays the same with or
 * without it.
 */

const ITEM_ROTER_STIER = 'roter-stier';
const ITEM_WALLER_KOPF = 'waller-kopf';

/** The player's ground y: a sprite's feet sit this far above the floor plane. */
const FEET_HEIGHT = 0.2;
const WING_BASE_UP = 5;
const WING_OFFSET_X = 6.5;
const WING_UNITS_PER_PIXEL = 0.5;
const WING_FLAP_IDLE = 0.007;
const WING_FLAP_MOVING = 0.026;
const WING_FLAP_REACH = 0.5;
const BEAM_HEIGHT = 6.5;
const BEAM_GLOW_WIDTH = 8;
const BEAM_CORE_WIDTH = 2.4;
const BEAM_GLOW = 0xffc65a;
const BEAM_CORE = 0xfffbe8;
const ORB_COLOUR = 0xffd27a;
const ORB_HEIGHT = 8;
const CONE_COLOUR = 0x7fd8c8;
const CONE_SEGMENTS = 24;
const SEMMEL_UNITS_PER_PIXEL = 0.5;

function pixelTexture(rows: readonly string[], key: Readonly<Record<string, number>>): DataTexture {
  const height = rows.length;
  const width = rows[0]?.length ?? 1;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colour = key[rows[y]?.[x] ?? '.'];
      if (colour === undefined) {
        continue;
      }
      const at = (y * width + x) * 4;
      data[at] = (colour >> 16) & 0xff;
      data[at + 1] = (colour >> 8) & 0xff;
      data[at + 2] = colour & 0xff;
      data[at + 3] = 255;
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  // Rows above run top to bottom; a texture's first row is its bottom.
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A right wing: three big white feathers, attached bottom-left and swept up and out. Drawn mirrored
 * for the left. The design Tilo picked (option 3 of the programmatic wings); the left edge is left
 * un-inked on purpose — it sits against the body.
 */
const WING_ROWS = [
  '..kk............',
  '.kWgk.kkk.......',
  'kWWgkkggak......',
  'kWgggggaak......',
  'WWggggaaak......',
  'WWgggaaaak......',
  'WggggaaaWWk.....',
  'ggggWWWWWWgk....',
  'gWWWWWWggggk....',
  'WWWWWgggggk.....',
  'WWWggggggk......',
  'ggggggggk.......',
  'kgggggkk........',
  '.kgggk..........',
];

/** A Leberkassemmel: a tan roll with a pink slab showing, as it tumbles. */
const SEMMEL_ROWS = [
  '..kkkkkkkk..',
  '.kAAAAAAAAk.',
  'kAAaAAAAaAAk',
  'kbbbbbbbbbbk',
  'kppppppppppk',
  'kbbbbbbbbbbk',
  '.kAAAAAAAAk.',
  '..kkkkkkkk..',
];

function flatMaterial(color: number, opacity: number, additive = false): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
    ...(additive ? { blending: AdditiveBlending } : {}),
  });
}

export class ItemFxView {
  readonly group = new Group();
  private lean = 0;

  private readonly standing = new PlaneGeometry(1, 1);
  private readonly flat = new PlaneGeometry(1, 1);
  private readonly wingTexture = pixelTexture(WING_ROWS, {
    k: 0x000000,
    W: 0xffffff,
    g: 0xe8eef2,
    a: 0xb9c4cc,
  });
  private readonly semmelTexture = pixelTexture(SEMMEL_ROWS, {
    k: 0x2a1c12,
    A: 0xd99a3f,
    a: 0xf4d78a,
    b: 0x8a5a24,
    p: 0xe893a8,
  });
  private readonly puffTexture = softPuff();
  private readonly wings: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly cone: Group;
  private readonly coneFill: Mesh<CircleGeometry, MeshBasicMaterial>;
  private readonly coneRim: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly semmeln: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly lobShadows: Mesh<CircleGeometry, MeshBasicMaterial>[] = [];
  private readonly lobMarks: Mesh<RingGeometry, MeshBasicMaterial>[] = [];
  private readonly beamGlow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly beamCore: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly orb: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly orbRing: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly discGeometry = new CircleGeometry(1, 16);
  private readonly ringGeometry = new RingGeometry(0.82, 1, 24);
  private readonly coneGeometries: [CircleGeometry, RingGeometry];

  constructor() {
    this.standing.translate(0, 0.5, 0);

    for (let side = 0; side < 2; side++) {
      const wing = new Mesh(
        this.standing,
        new MeshBasicMaterial({
          map: this.wingTexture,
          transparent: true,
          alphaTest: 0.5,
          side: DoubleSide,
        }),
      );
      wing.rotation.order = 'YXZ';
      this.add(wing);
      this.wings.push(wing);
    }

    this.coneGeometries = [
      new CircleGeometry(WALLER_RANGE, CONE_SEGMENTS, -WALLER_HALF_ANGLE, WALLER_HALF_ANGLE * 2),
      new RingGeometry(
        WALLER_RANGE - 1.6,
        WALLER_RANGE,
        CONE_SEGMENTS,
        1,
        -WALLER_HALF_ANGLE,
        WALLER_HALF_ANGLE * 2,
      ),
    ];
    this.coneFill = new Mesh(this.coneGeometries[0], flatMaterial(CONE_COLOUR, 0.16));
    this.coneRim = new Mesh(this.coneGeometries[1], flatMaterial(CONE_COLOUR, 0.55));
    this.coneFill.rotation.x = -Math.PI / 2;
    this.coneRim.rotation.x = -Math.PI / 2;
    this.cone = new Group();
    this.cone.add(this.coneFill, this.coneRim);
    this.cone.visible = false;
    this.cone.traverse((object) => {
      object.frustumCulled = false;
      object.layers.set(ACTOR_LAYER);
    });
    this.group.add(this.cone);

    for (let slot = 0; slot < LOB_CAPACITY; slot++) {
      const semmel = new Mesh(
        this.standing,
        new MeshBasicMaterial({
          map: this.semmelTexture,
          transparent: true,
          alphaTest: 0.5,
          side: DoubleSide,
        }),
      );
      semmel.scale.set(
        (SEMMEL_ROWS[0]?.length ?? 12) * SEMMEL_UNITS_PER_PIXEL,
        SEMMEL_ROWS.length * SEMMEL_UNITS_PER_PIXEL,
        1,
      );
      this.add(semmel);
      this.semmeln.push(semmel);

      const shadow = new Mesh(this.discGeometry, flatMaterial(0x000000, 0.35));
      shadow.rotation.x = -Math.PI / 2;
      this.add(shadow);
      this.lobShadows.push(shadow);

      const mark = new Mesh(this.ringGeometry, flatMaterial(0xff6a3a, 0.7));
      mark.rotation.x = -Math.PI / 2;
      this.add(mark);
      this.lobMarks.push(mark);
    }

    this.beamGlow = new Mesh(this.flat, flatMaterial(BEAM_GLOW, 0.85, true));
    this.beamCore = new Mesh(this.flat, flatMaterial(BEAM_CORE, 1, true));
    this.add(this.beamGlow);
    this.add(this.beamCore);
    this.orb = new Mesh(
      this.standing,
      new MeshBasicMaterial({
        map: this.puffTexture,
        color: ORB_COLOUR,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    );
    this.add(this.orb);
    this.orbRing = new Mesh(this.ringGeometry, flatMaterial(BEAM_GLOW, 0.8, true));
    this.orbRing.rotation.x = -Math.PI / 2;
    this.add(this.orbRing);
  }

  private add(mesh: Mesh): void {
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.layers.set(ACTOR_LAYER);
    this.group.add(mesh);
  }

  setLean(lean: number): void {
    this.lean = lean;
  }

  sync(sim: GameSim, alpha: number, nowMs: number): void {
    const player = sim.playerIndex;
    const x = lerp(sim.previousX(player), sim.positionX(player), alpha);
    const y = lerp(sim.previousY(player), sim.positionY(player), alpha);
    const alive = !sim.playerDead;
    this.syncWings(sim, x, y, nowMs, alive && sim.hasItem(ITEM_ROTER_STIER));
    this.syncCone(sim, x, y, alive && sim.hasItem(ITEM_WALLER_KOPF));
    this.syncLobs(sim, alpha);
    this.syncLaser(sim, x, y, alive && sim.hasItem(LASER_ITEM_ID));
  }

  private syncWings(sim: GameSim, x: number, y: number, nowMs: number, shown: boolean): void {
    const speed = Math.hypot(
      sim.velocity.data[sim.playerIndex * 2] ?? 0,
      sim.velocity.data[sim.playerIndex * 2 + 1] ?? 0,
    );
    const moving = Math.min(1, speed / 1.2);
    const rate = lerp(WING_FLAP_IDLE, WING_FLAP_MOVING, moving);
    const flap = Math.sin(nowMs * rate);
    const upY = Math.cos(this.lean);
    const upZ = Math.sin(this.lean);
    const normalY = -Math.sin(this.lean);
    const normalZ = Math.cos(this.lean);
    // Hovering: a little bob so he reads as held up rather than standing.
    const bob = shown ? 1.2 + Math.sin(nowMs * 0.004) * 0.6 : 0;
    for (let side = 0; side < this.wings.length; side++) {
      const wing = this.wings[side];
      if (wing === undefined) {
        continue;
      }
      wing.visible = shown;
      if (!shown) {
        continue;
      }
      const sign = side === 0 ? -1 : 1;
      const width = (WING_ROWS[0]?.length ?? 14) * WING_UNITS_PER_PIXEL;
      const height = WING_ROWS.length * WING_UNITS_PER_PIXEL;
      // Each wing sweeps down by up to `WING_FLAP_REACH` and back up.
      const spread = 0.35 + (flap * 0.5 + 0.5) * WING_FLAP_REACH;
      wing.scale.set(sign * width * (0.75 + 0.25 * Math.cos(spread)), height, 1);
      wing.rotation.x = this.lean;
      wing.rotation.z = -sign * (spread - 0.6);
      const up = WING_BASE_UP + bob;
      wing.position.set(
        x + sign * WING_OFFSET_X,
        FEET_HEIGHT + up * upY - 0.05 * normalY,
        y + PLAYER_FOOTPRINT + up * upZ - 0.05 * normalZ,
      );
    }
  }

  private syncCone(sim: GameSim, x: number, y: number, shown: boolean): void {
    this.cone.visible = shown;
    if (!shown) {
      return;
    }
    // A flat disc's +x runs along world +x and its +y along world -z after the
    // lay-down, so turning about the vertical by atan2(-dy, dx) points it along (dx, dy).
    this.cone.rotation.y = Math.atan2(-sim.walkDirectionY, sim.walkDirectionX);
    this.cone.position.set(x, 0.45, y);
  }

  private syncLobs(sim: GameSim, alpha: number): void {
    const lobs = sim.lobs;
    for (let slot = 0; slot < LOB_CAPACITY; slot++) {
      const semmel = this.semmeln[slot];
      const shadow = this.lobShadows[slot];
      const mark = this.lobMarks[slot];
      if (semmel === undefined || shadow === undefined || mark === undefined) {
        continue;
      }
      const live = lobs.live[slot] === 1;
      semmel.visible = live;
      shadow.visible = live;
      mark.visible = live;
      if (!live) {
        continue;
      }
      const t = lobProgress(sim, slot, alpha);
      const x = lerp(lobs.startX[slot] ?? 0, lobs.targetX[slot] ?? 0, t);
      const y = lerp(lobs.startY[slot] ?? 0, lobs.targetY[slot] ?? 0, t);
      const height = 3 + 4 * LOB_ARC_HEIGHT * t * (1 - t);
      semmel.position.set(x, height, y);
      semmel.rotation.x = this.lean;
      semmel.rotation.z = t * Math.PI * 6;
      shadow.position.set(x, 0.4, y);
      const shadowSize = 3.2 * (1 - 0.5 * Math.min(1, height / LOB_ARC_HEIGHT));
      shadow.scale.set(shadowSize, shadowSize, 1);
      // Where it will come down, growing in as it nears.
      mark.position.set(lobs.targetX[slot] ?? 0, 0.5, lobs.targetY[slot] ?? 0);
      const reach = LOB_DIRECT_RADIUS + LOB_DIAGONAL_OFFSET * 0.5 + LOB_DIAGONAL_RADIUS * 0.3;
      mark.scale.set(reach * (0.4 + 0.6 * t), reach * (0.4 + 0.6 * t), 1);
      mark.material.opacity = 0.25 + 0.5 * t;
    }
  }

  private syncLaser(sim: GameSim, x: number, y: number, held: boolean): void {
    const age = sim.tick - sim.laserBeamTick;
    const beamShown = held && age >= 0 && age < LASER_BEAM_TICKS;
    this.beamGlow.visible = beamShown;
    this.beamCore.visible = beamShown;
    if (beamShown) {
      const ax = sim.laserBeam[0] ?? 0;
      const ay = sim.laserBeam[1] ?? 0;
      const bx = sim.laserBeam[2] ?? 0;
      const by = sim.laserBeam[3] ?? 0;
      const length = Math.hypot(bx - ax, by - ay);
      const angle = Math.atan2(-(by - ay), bx - ax);
      const fade = 1 - age / LASER_BEAM_TICKS;
      for (const [mesh, width] of [
        [this.beamGlow, BEAM_GLOW_WIDTH * (0.6 + 0.4 * fade)],
        [this.beamCore, BEAM_CORE_WIDTH * (0.5 + 0.5 * fade)],
      ] as const) {
        mesh.position.set((ax + bx) / 2, BEAM_HEIGHT, (ay + by) / 2);
        mesh.rotation.set(-Math.PI / 2, 0, angle);
        mesh.scale.set(length, width, 1);
        mesh.material.opacity = fade;
      }
    }

    const charge = held ? sim.laserCharge : 0;
    this.orb.visible = charge > 0;
    this.orbRing.visible = charge > 0;
    if (charge <= 0) {
      return;
    }
    const windup = laserWindupTicks(sim);
    const progress = Math.min(1, charge / windup);
    const ready = charge >= windup;
    const pulse = ready ? 1 + 0.18 * Math.sin(sim.tick * 0.9) : 1;
    const muzzle = sim.tuning.shooting.muzzleOffset;
    const ox = x + sim.aimDirectionX * muzzle;
    const oy = y + sim.aimDirectionY * muzzle;
    const size = (3 + 11 * progress) * pulse;
    this.orb.scale.set(size, size, 1);
    this.orb.position.set(ox, ORB_HEIGHT - size * 0.5, oy + PLAYER_FOOTPRINT * 0.4);
    this.orb.rotation.x = this.lean;
    this.orb.material.opacity = 0.5 + 0.5 * progress;
    // The ring closes in on the muzzle as the charge fills, and holds there when it is ready.
    const ringSize = lerp(18, 6, progress);
    this.orbRing.scale.set(ringSize, ringSize, 1);
    this.orbRing.position.set(ox, 0.6, oy);
    this.orbRing.material.opacity = ready ? 0.9 : 0.35 + 0.4 * progress;
  }

  destroy(): void {
    this.group.traverse((object) => {
      if (object instanceof Mesh) {
        (object.material as MeshBasicMaterial).dispose();
      }
    });
    this.standing.dispose();
    this.flat.dispose();
    this.discGeometry.dispose();
    this.ringGeometry.dispose();
    for (const geometry of this.coneGeometries) {
      geometry.dispose();
    }
    this.wingTexture.dispose();
    this.semmelTexture.dispose();
    this.puffTexture.dispose();
    this.group.removeFromParent();
  }
}

/** Kept so a test can reach the one authored size the wing art is drawn at. */
export const WING_SIZE_PIXELS = {
  width: WING_ROWS[0]?.length ?? 0,
  height: WING_ROWS.length,
};
