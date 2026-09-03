import { Container, Graphics } from 'pixi.js';
import { World } from '../sim/ecs/world.js';
import type { GameSim } from '../sim/game/sim.js';
import { lerp } from '../sim/math.js';
import { lobbedBombFlight, type LobbedBombFlight } from '../sim/systems/enemy.js';

/**
 * A Böllerschmeißer's lobbed bomb, in flight (#243).
 *
 * Before this, the throw itself was invisible: `wind`'s telegraph draws a
 * ring on the *thrower's* own body (`entities.ts`'s ring pool), and — once
 * `detonateLobbedBomb` fixed its own gap — a burst draws at the landing spot
 * the instant it goes off. Nothing drew anything in between, so a hit read
 * as the bomb spawning directly on the player rather than something thrown
 * across the room at them. This closes that gap: a small keg, arcing from
 * the thrower to `lobTarget`'s captured spot over the same wind-up
 * `lobbedBombFlight` (`sim/systems/enemy.ts`) already tracks.
 *
 * Drawn procedurally with `Graphics`, the same choice `MaibaumView` makes
 * for the same reason (`docs/DECISIONS.md` #43) — a keg with a spark is a
 * shape a pure function draws cleanly, and this engine has no height axis a
 * real "thrown" sprite could hang a z-offset on anyway (confirmed: nothing
 * in `sim/`/`render/` tracks one), so the arc is faked with a sine bump on Y
 * instead. Pooled rather than `MaibaumView`'s one static instance: more than
 * one Böllerschmeißer can be mid-throw at once, where there is only ever one
 * Maibaum in the arena.
 */

const BOMB_BODY = 0x1c1a20;
const BOMB_RIM = 0x3a3540;
const FUSE_SPARK = 0xffb347;

/** Radius the keg's own body is drawn at, in world units — a hair bigger than a shot (`tuning.shooting.shotRadius`), since this is a thrown object, not a bullet. */
const BOMB_RADIUS = 4;

/** How high the faked arc rises at its peak, in world units — a keg lobbed across a room, not a grenade over a wall. */
const ARC_HEIGHT = 14;

function drawBomb(g: Graphics): void {
  g.circle(0, 0, BOMB_RADIUS).fill(BOMB_BODY);
  g.circle(0, 0, BOMB_RADIUS).stroke({ width: 1, color: BOMB_RIM });
  // A lit fuse spark, off-centre and above the body — the same visual cue
  // `deathEffect: 'ember'`'s doc comment calls out for this enemy: it goes
  // off rather than dying, and the spark is the first hint why.
  g.circle(1.5, -BOMB_RADIUS + 0.5, 1).fill(FUSE_SPARK);
}

export class BombFlightView {
  readonly container = new Container();

  private readonly bombs: Graphics[] = [];
  /** Reused across every call so the per-frame scan never allocates (`lobbedBombFlight`'s own `@hot` contract). */
  private readonly scratch: LobbedBombFlight = {
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    progress: 0,
  };

  sync(sim: GameSim): void {
    const world = sim.world;
    const states = world.states;
    const masks = world.masks;
    const required = sim.enemyMask;
    const highWater = world.highWater;
    const scratch = this.scratch;

    let used = 0;
    for (let index = 0; index < highWater; index++) {
      if (states[index] !== World.ALIVE) {
        continue;
      }
      if (((masks[index] ?? 0) & required) !== required) {
        continue;
      }
      if (!lobbedBombFlight(sim, index, scratch)) {
        continue;
      }
      const bomb = this.bombAt(used);
      used += 1;
      bomb.visible = true;
      const t = scratch.progress;
      bomb.position.set(
        lerp(scratch.startX, scratch.endX, t),
        // The straight-line lerp is where the keg would sit if it slid along
        // the ground; subtracting a sine bump (zero at both ends, tallest at
        // the midpoint) is the whole of the fake — no real height axis to
        // hook a proper arc onto (see this file's own doc comment).
        lerp(scratch.startY, scratch.endY, t) - Math.sin(Math.PI * t) * ARC_HEIGHT,
      );
    }

    for (let slot = used; slot < this.bombs.length; slot++) {
      const bomb = this.bombs[slot];
      if (bomb !== undefined) {
        bomb.visible = false;
      }
    }
  }

  private bombAt(slot: number): Graphics {
    const existing = this.bombs[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Graphics();
    drawBomb(created);
    this.bombs[slot] = created;
    this.container.addChild(created);
    return created;
  }
}
