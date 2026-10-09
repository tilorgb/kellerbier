import { CollisionLayer } from '../collision/layers.js';
import { World } from '../ecs/world.js';
import type { GameSim } from '../game/sim.js';
import { ParticleKind } from '../particle/store.js';
import { BLOCK_STRIDE } from '../room/geometry.js';
import { ENEMY_STRIDE } from '../systems/enemy.js';
import { applyDamageAt } from '../systems/impact.js';
import { addPush } from '../systems/movement.js';
import { ProjectileTeam } from '../projectile/store.js';
import type { WeatherTuning } from '../tuning.js';

/**
 * Floor 4's weather (#40): the two room-wide hazards the Alps throw at a
 * whole room on a clock, rather than at the one body that walked onto them.
 *
 * - **An avalanche** sweeps a lane — usually the whole room — from its north
 *   edge to its south edge. It is on a cycle: quiet, then a long rumble
 *   (`avalancheTelegraphTicks`, sized so a player can cross a full room
 *   before it comes down — #40's acceptance criterion), then the slide. The
 *   front is a band moving south; the tick it crosses a body's centre that
 *   body is hit once and shoved south — unless it is **sheltered**: directly
 *   downhill of a solid block, within `avalancheShelterDepth` of its foot,
 *   where the snow parts around the rock. Flying bodies are above it. Both
 *   the player and every walking enemy are in it: a room is one mountain.
 * - **A wind gust** blows across a lane east or west, alternating, after a
 *   shorter warning. While it blows it leans on every walking body
 *   (`addPush`, so a rooted body ignores it and `maxPush` caps it) and on the
 *   player's own shots, the way the Föhn curse bends them; enemy shots fly
 *   true, for the reason `systems/curse.ts` gives.
 *
 * Both are pure functions of the room's own tick since it loaded and the
 * tuning: the same room telegraphs and sweeps at the same moments in a
 * replay. Lanes come from a room template's `hazards` (`type: 'avalanche'` /
 * `'wind'`), loaded by `GameSim.applyCompiledRoom`; a room with no lane of a
 * kind never ticks that kind. Several lanes of one kind share one clock, so
 * a multi-cell room's cells slide together.
 *
 * Nothing here is the only copy of anything: the slide's hatched floor band
 * (`render/weather-view.ts`) is the telegraph that survives reduced motion;
 * the snow it throws (`ParticleKind.Snow`) is decoration.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** Lanes of one kind a room may hold — one per sub-cell of the widest shape, with one to spare. */
export const WEATHER_MAX_LANES = 6;

export const WeatherPhase = {
  /** Nothing happening; the clock runs toward the warning. */
  Quiet: 0,
  /** The warning: a rumble, a rising wind. */
  Telegraph: 1,
  /** The slide, or the gust. */
  Active: 2,
} as const;

export type WeatherPhaseId = (typeof WeatherPhase)[keyof typeof WeatherPhase];

/** Which hazard type strings load as weather lanes. */
export const AVALANCHE_HAZARD = 'avalanche';
export const WIND_HAZARD = 'wind';

/**
 * One kind of weather's lanes and clock. Plain fields and typed arrays, reset
 * per room, so a tick reads numbers and allocates nothing.
 */
export class WeatherLanes {
  /** Flat `[minX, minY, maxX, maxY]` runs, `count * BLOCK_STRIDE` deep. */
  readonly rects = new Float32Array(WEATHER_MAX_LANES * BLOCK_STRIDE);
  count = 0;
  phase: WeatherPhaseId = WeatherPhase.Quiet;
  /** Ticks spent in the current phase. */
  ticks = 0;
  /** How many times the active phase has begun in this room — the gust reads its direction off it. */
  rounds = 0;

  clear(): void {
    this.count = 0;
    this.phase = WeatherPhase.Quiet;
    this.ticks = 0;
    this.rounds = 0;
  }

  add(minX: number, minY: number, maxX: number, maxY: number): void {
    if (this.count >= WEATHER_MAX_LANES) {
      // A content gap, not a bug (`docs/DECISIONS.md` #19): the first lanes
      // still work and the room keeps playing; the test suite holds authored
      // rooms under the cap.
      return;
    }
    const base = this.count * BLOCK_STRIDE;
    this.rects[base] = minX;
    this.rects[base + 1] = minY;
    this.rects[base + 2] = maxX;
    this.rects[base + 3] = maxY;
    this.count += 1;
  }

  /** True when `(x, y)` lies inside lane `lane`. */
  contains(lane: number, x: number, y: number): boolean {
    const base = lane * BLOCK_STRIDE;
    return (
      x >= (this.rects[base] ?? 0) &&
      x <= (this.rects[base + 2] ?? 0) &&
      y >= (this.rects[base + 1] ?? 0) &&
      y <= (this.rects[base + 3] ?? 0)
    );
  }
}

export class WeatherStore {
  readonly avalanche = new WeatherLanes();
  readonly wind = new WeatherLanes();
  /**
   * Per entity slot, the avalanche round (`avalanche.rounds`) that last hit
   * it, so a slide hits a body once however the shove and the front's own
   * speed reorder them afterwards. Sized to the world once; `0` is "never".
   */
  readonly sweptRound: Int32Array;

  constructor(capacity: number) {
    this.sweptRound = new Int32Array(capacity);
  }

  clear(): void {
    this.avalanche.clear();
    this.wind.clear();
    this.sweptRound.fill(0);
  }

  /** Loads a compiled room's lanes. Anything that is not weather is left to whoever owns it. */
  load(
    hazards: readonly {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly type: string;
    }[],
  ): void {
    this.clear();
    for (const hazard of hazards) {
      if (hazard.type === AVALANCHE_HAZARD) {
        this.avalanche.add(hazard.x, hazard.y, hazard.x + hazard.width, hazard.y + hazard.height);
      } else if (hazard.type === WIND_HAZARD) {
        this.wind.add(hazard.x, hazard.y, hazard.x + hazard.width, hazard.y + hazard.height);
      }
    }
  }

  /** `true` when the room has weather of any kind — what the renderer and the debug overlay ask first. */
  get active(): boolean {
    return this.avalanche.count > 0 || this.wind.count > 0;
  }

  /** Where the slide's front stands in lane `lane`, 0 at its north edge to 1 at its south, or -1 outside a slide. */
  avalancheProgress(tuning: Readonly<WeatherTuning>): number {
    if (this.avalanche.phase !== WeatherPhase.Active) {
      return -1;
    }
    return Math.min(1, this.avalanche.ticks / Math.max(1, tuning.avalancheSweepTicks));
  }

  /** How far through the warning the avalanche is, 0..1, or -1 outside it. */
  avalancheWarning(tuning: Readonly<WeatherTuning>): number {
    if (this.avalanche.phase !== WeatherPhase.Telegraph) {
      return -1;
    }
    return Math.min(1, this.avalanche.ticks / Math.max(1, tuning.avalancheTelegraphTicks));
  }

  /** `1` for a gust blowing east, `-1` west — this gust's, or the next one's while quiet. */
  get windDirection(): 1 | -1 {
    const upcoming =
      this.wind.phase === WeatherPhase.Quiet ? this.wind.rounds : this.wind.rounds - 1;
    return upcoming % 2 === 0 ? 1 : -1;
  }
}

/** Advances a kind's clock one tick and returns `true` on the tick its active phase begins. */
function advance(
  lanes: WeatherLanes,
  quietTicks: number,
  telegraphTicks: number,
  activeTicks: number,
): boolean {
  lanes.ticks += 1;
  switch (lanes.phase) {
    case WeatherPhase.Quiet:
      if (lanes.ticks >= Math.max(1, Math.round(quietTicks))) {
        lanes.phase = WeatherPhase.Telegraph;
        lanes.ticks = 0;
      }
      return false;
    case WeatherPhase.Telegraph:
      if (lanes.ticks >= Math.max(1, Math.round(telegraphTicks))) {
        lanes.phase = WeatherPhase.Active;
        lanes.ticks = 0;
        lanes.rounds += 1;
        return true;
      }
      return false;
    default:
      if (lanes.ticks >= Math.max(1, Math.round(activeTicks))) {
        lanes.phase = WeatherPhase.Quiet;
        lanes.ticks = 0;
      }
      return false;
  }
}

/** Ticks between snow puffs thrown off the north wall during the rumble. */
const RUMBLE_PUFF_EVERY_TICKS = 5;
/** Ticks between tremors of the camera during the rumble and the slide. */
const RUMBLE_SHAKE_EVERY_TICKS = 9;
const RUMBLE_SHAKE = 0.22;
const SLIDE_SHAKE = 0.45;
/** Ticks between streaks of snow blown along a gust. */
const GUST_STREAK_EVERY_TICKS = 3;
/** Snow particles per streak / puff, and their life. */
const SNOW_PER_BURST = 2;
const SNOW_LIFE_TICKS = 28;
const SNOW_SIZE = 2.2;
/** How much faster than the gust's push a streak of snow flies: it is what makes the wind visible. */
const GUST_STREAK_SPEED = 2.4;

export function stepWeather(sim: GameSim): void {
  const weather = sim.weather;
  if (!weather.active || sim.roomWarmupTicks > 0 || sim.playerDead) {
    return;
  }
  const tuning = sim.tuning.weather;
  if (weather.avalanche.count > 0) {
    stepAvalanche(sim, weather.avalanche, tuning);
  }
  if (weather.wind.count > 0) {
    stepWind(sim, weather, tuning);
  }
}

function stepAvalanche(sim: GameSim, lanes: WeatherLanes, tuning: Readonly<WeatherTuning>): void {
  const previous = lanes.phase === WeatherPhase.Active ? lanes.ticks : -1;
  advance(
    lanes,
    tuning.avalancheQuietTicks,
    tuning.avalancheTelegraphTicks,
    tuning.avalancheSweepTicks,
  );
  const sweepTicks = Math.max(1, Math.round(tuning.avalancheSweepTicks));
  const random = sim.random.cosmetic;
  if (lanes.phase === WeatherPhase.Telegraph) {
    // The rumble: snow dust off the top of every lane, and a tremor.
    if (lanes.ticks % RUMBLE_PUFF_EVERY_TICKS === 0) {
      for (let lane = 0; lane < lanes.count; lane++) {
        const base = lane * BLOCK_STRIDE;
        const minX = lanes.rects[base] ?? 0;
        const maxX = lanes.rects[base + 2] ?? 0;
        const top = lanes.rects[base + 1] ?? 0;
        for (let n = 0; n < SNOW_PER_BURST; n++) {
          const x = minX + random.nextFloat() * (maxX - minX);
          sim.particles.spawn(
            x,
            top + 2,
            (random.nextFloat() - 0.5) * 0.4,
            0.3 + random.nextFloat() * 0.5,
            SNOW_LIFE_TICKS,
            SNOW_SIZE,
            ParticleKind.Snow,
          );
        }
      }
    }
    if (lanes.ticks % RUMBLE_SHAKE_EVERY_TICKS === 0) {
      sim.addShake(0, 1, RUMBLE_SHAKE);
    }
    return;
  }
  if (lanes.phase !== WeatherPhase.Active) {
    return;
  }
  // The slide. `previous` is the front's tick before this one (-1 on the
  // tick it begins, so a body on the very north edge is still crossed).
  const progressBefore = previous < 0 ? -0.001 : previous / sweepTicks;
  const progressNow = Math.min(1, lanes.ticks / sweepTicks);
  if (lanes.ticks % RUMBLE_SHAKE_EVERY_TICKS === 0) {
    sim.addShake(0, 1, SLIDE_SHAKE);
  }
  for (let lane = 0; lane < lanes.count; lane++) {
    const base = lane * BLOCK_STRIDE;
    const minX = lanes.rects[base] ?? 0;
    const minY = lanes.rects[base + 1] ?? 0;
    const maxX = lanes.rects[base + 2] ?? 0;
    const maxY = lanes.rects[base + 3] ?? 0;
    const frontBefore = minY + progressBefore * (maxY - minY);
    const frontNow = minY + progressNow * (maxY - minY);
    // Snow thrown off the front as it comes down.
    for (let n = 0; n < SNOW_PER_BURST; n++) {
      const x = minX + random.nextFloat() * (maxX - minX);
      sim.particles.spawn(
        x,
        frontNow,
        (random.nextFloat() - 0.5) * 1.2,
        0.6 + random.nextFloat() * 0.8,
        SNOW_LIFE_TICKS,
        SNOW_SIZE * 1.4,
        ParticleKind.Snow,
      );
    }
    sweepBodies(sim, tuning, minX, maxX, frontBefore, frontNow);
  }
}

/** Every body in the lane whose centre the front crossed this tick is hit, unless sheltered or flying. */
function sweepBodies(
  sim: GameSim,
  tuning: Readonly<WeatherTuning>,
  minX: number,
  maxX: number,
  frontBefore: number,
  frontNow: number,
): void {
  const world = sim.world;
  const states = world.states;
  const masks = world.masks;
  const collision = sim.collision.data;
  const enemyMask = sim.enemyMask;
  const enemy = sim.enemy.data;
  const highWater = world.highWater;
  const hitMask = CollisionLayer.Enemy | CollisionLayer.Player;
  for (let index = 0; index < highWater; index++) {
    if (states[index] !== World.ALIVE) {
      continue;
    }
    const layer = collision[index * 2] ?? 0;
    if ((layer & hitMask) === 0) {
      continue;
    }
    const x = sim.positionX(index);
    const y = sim.positionY(index);
    if (x < minX || x > maxX || y <= frontBefore || y > frontNow) {
      continue;
    }
    const isEnemy = ((masks[index] ?? 0) & enemyMask) === enemyMask;
    if (isEnemy && sim.enemies.at(enemy[index * ENEMY_STRIDE] ?? 0).flying) {
      continue;
    }
    if (index === sim.playerIndex) {
      if (sim.playerInvulnerableTicks > 0 || sim.playerFlies) {
        continue;
      }
    }
    if ((sim.health.data[index * 2] ?? 0) <= 0) {
      continue;
    }
    if (sheltered(sim, x, y, tuning.avalancheShelterDepth)) {
      continue;
    }
    // Once per slide: the shove throws a body ahead of the front, and the
    // front catching it up again is the same snow, not a second slide.
    const round = sim.weather.avalanche.rounds;
    if (sim.weather.sweptRound[index] === round) {
      continue;
    }
    sim.weather.sweptRound[index] = round;
    if (index === sim.playerIndex) {
      sim.notePlayerAttackerEntity(-1);
    }
    // The normal faces back up the slope, toward where the snow came from
    // (`applyDamageAt`'s convention: a hit's own knockback runs *against*
    // its normal), so the hit itself already throws the body south; the
    // slide's own weight goes on top of that.
    applyDamageAt(sim, index, tuning.avalancheDamage, x, y, 0, -1, -1, ParticleKind.Snow);
    addPush(sim, index, 0, tuning.avalancheKnockback);
  }
}

/**
 * True when a solid block stands directly uphill of `(x, y)`: the body's x
 * inside the block's run, the block's foot at or above the body, and no more
 * than `depth` room units above it. Where the snow parts around the rock.
 */
function sheltered(sim: GameSim, x: number, y: number, depth: number): boolean {
  const room = sim.room;
  const blocks = room.blocks;
  for (let block = 0; block < room.blockCount; block++) {
    const base = block * BLOCK_STRIDE;
    const minX = blocks[base] ?? 0;
    const maxX = blocks[base + 2] ?? 0;
    const foot = blocks[base + 3] ?? 0;
    if (x >= minX && x <= maxX && foot <= y && y - foot <= depth) {
      return true;
    }
  }
  return false;
}

let gustSim: GameSim | null = null;
const gustScratch = new Float64Array(1);

/** Leans on one player shot — `forEachLive`'s callback, bound once (`no-hot-allocation`). */
function pushShot(slot: number): void {
  const sim = gustSim;
  if (sim === null) {
    return;
  }
  const projectiles = sim.projectiles;
  if (projectiles.team[slot] !== ProjectileTeam.Player) {
    return;
  }
  projectiles.velocityX[slot] = (projectiles.velocityX[slot] ?? 0) + (gustScratch[0] ?? 0);
}

function stepWind(sim: GameSim, weather: WeatherStore, tuning: Readonly<WeatherTuning>): void {
  const lanes = weather.wind;
  advance(lanes, tuning.windQuietTicks, tuning.windTelegraphTicks, tuning.windGustTicks);
  if (lanes.phase === WeatherPhase.Quiet) {
    return;
  }
  const direction = weather.windDirection;
  const random = sim.random.cosmetic;
  // The warning is the wind itself picking up: streaks of snow blow across
  // the lane for the whole telegraph, before anything is pushed.
  const blowing = lanes.phase === WeatherPhase.Active;
  const streakEvery = blowing ? GUST_STREAK_EVERY_TICKS : GUST_STREAK_EVERY_TICKS * 2;
  if (lanes.ticks % streakEvery === 0) {
    for (let lane = 0; lane < lanes.count; lane++) {
      const base = lane * BLOCK_STRIDE;
      const minX = lanes.rects[base] ?? 0;
      const minY = lanes.rects[base + 1] ?? 0;
      const maxX = lanes.rects[base + 2] ?? 0;
      const maxY = lanes.rects[base + 3] ?? 0;
      for (let n = 0; n < SNOW_PER_BURST; n++) {
        const y = minY + random.nextFloat() * (maxY - minY);
        const x = direction > 0 ? minX + random.nextFloat() * 24 : maxX - random.nextFloat() * 24;
        sim.particles.spawn(
          x,
          y,
          direction * GUST_STREAK_SPEED * (0.7 + random.nextFloat() * 0.6),
          (random.nextFloat() - 0.5) * 0.3,
          SNOW_LIFE_TICKS * 2,
          SNOW_SIZE,
          ParticleKind.Snow,
        );
      }
    }
  }
  if (!blowing) {
    return;
  }
  const push = direction * tuning.windStrength;
  const world = sim.world;
  const states = world.states;
  const collision = sim.collision.data;
  const highWater = world.highWater;
  const pushMask = CollisionLayer.Enemy | CollisionLayer.Player;
  for (let index = 0; index < highWater; index++) {
    if (states[index] !== World.ALIVE) {
      continue;
    }
    if (((collision[index * 2] ?? 0) & pushMask) === 0) {
      continue;
    }
    const x = sim.positionX(index);
    const y = sim.positionY(index);
    let inLane = false;
    for (let lane = 0; lane < lanes.count && !inLane; lane++) {
      inLane = lanes.contains(lane, x, y);
    }
    if (!inLane) {
      continue;
    }
    // A flyer is in the wind too — if anything more so — and a walker the
    // same: the gust leans on every body in the lane alike. `addPush` is what
    // keeps a rooted body (a Fliegenpilz, a boulder-like boss) where it is.
    addPush(sim, index, push, 0);
  }
  gustSim = sim;
  gustScratch[0] = direction * tuning.windShotStrength;
  sim.projectiles.forEachLive(pushShot);
  gustSim = null;
}
