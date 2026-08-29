import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { AnimationState } from '../../src/render/animation/definition.js';
import {
  PlayerFacing,
  resolvePlayerAnimationState,
  resolvePlayerHeading,
  type PlayerHeading,
  schlauchOctant,
} from '../../src/render/animation/state.js';
import { PlayerView } from '../../src/render/player-view.js';
import { SCHLAUCH_OCTANTS } from '../../src/render/player-art.js';
import { stubPlayerArt } from '../helpers/player-art.js';
import { bytesPerPass } from '../helpers/allocation.js';

/**
 * Alois's animation, headlessly (#151).
 *
 * Two halves, and the split is the same one #150 drew for enemies. Which
 * *state* he is in is a pure function of simulation state, so it is testable
 * against a sim with no clock and no renderer. Which *frame* that state is on
 * is a function of the render clock, so it is testable by driving `sync` with
 * an explicit `nowMs` — which is also what makes it a real test rather than a
 * restatement of the code: a view that advanced one frame per rendered frame
 * would pass a test that only ever called `sync` once.
 */

function sim(): GameSim {
  return new GameSim({ seed: 3, population: 'empty', room: new RoomGeometry(0, 0, 320, 180) });
}

/**
 * Puts the player at `(x, y)`, having come from `(previousX, previousY)`.
 *
 * Written straight into the transform rather than driven through movement
 * input: what is under test is the derivation from "the tick moved him this
 * far", and steering him there with a `stepPlayerMovement` would make every
 * assertion here depend on acceleration tuning as well.
 *
 * Also writes `velocity` to match the same delta. `resolveAnimationState`
 * still reads the position delta directly, but `resolvePlayerHeading` reads
 * `velocity` — the input-driven channel — precisely so a recoil impulse on
 * the separate `push` channel cannot masquerade as walking (see that
 * function's own doc comment). A `place` call is meant to simulate "the tick
 * actually walked him this far," so its velocity is this delta, not zero.
 */
function place(game: GameSim, x: number, y: number, previousX = x, previousY = y): void {
  const base = game.playerIndex * 4;
  game.transform.data[base] = x;
  game.transform.data[base + 1] = y;
  game.transform.data[base + 2] = previousX;
  game.transform.data[base + 3] = previousY;
  const velocityBase = game.playerIndex * 2;
  game.velocity.data[velocityBase] = x - previousX;
  game.velocity.data[velocityBase + 1] = y - previousY;
}

describe('resolvePlayerAnimationState', () => {
  it('is idle when he is standing still', () => {
    const game = sim();
    place(game, 100, 100);
    expect(resolvePlayerAnimationState(game)).toBe(AnimationState.Idle);
  });

  it('is move when the tick actually moved him', () => {
    const game = sim();
    place(game, 100, 100, 98, 100);
    expect(resolvePlayerAnimationState(game)).toBe(AnimationState.Move);
  });

  it('ignores sub-pixel drift, which separation push-apart produces constantly', () => {
    const game = sim();
    place(game, 100, 100, 100.005, 100.005);
    expect(resolvePlayerAnimationState(game)).toBe(AnimationState.Idle);
  });

  it('flinches for the length of the hurt clip and then stops', () => {
    const game = sim();
    place(game, 100, 100, 98, 100);
    game.applyPlayerDamage(1);
    expect(resolvePlayerAnimationState(game)).toBe(AnimationState.Hurt);
    // The flinch outranks the walk — a hit has to read even mid-stride.
    for (let tick = 0; tick < 9; tick++) {
      game.step();
    }
    place(game, 100, 100, 98, 100);
    expect(resolvePlayerAnimationState(game)).toBe(AnimationState.Move);
  });

  it('flinches while knocked down, which damaged nothing', () => {
    const game = sim();
    place(game, 100, 100);
    // The only way in: drink past the Umgfalln threshold.
    game.addPromille(20);
    expect(game.umgfallnTicks).toBeGreaterThan(0);
    expect(resolvePlayerAnimationState(game)).toBe(AnimationState.Hurt);
  });

  it('is death once the run is over, and stays there', () => {
    const game = sim();
    place(game, 100, 100, 98, 100);
    game.applyPlayerDamage(999);
    expect(game.playerDead).toBe(true);
    // Unlike an enemy — whose slot is freed the tick it dies, which is why
    // `resolveAnimationState` cannot answer this at all — the player's entity
    // outlives him on purpose, so the death clip plays on the body itself.
    expect(resolvePlayerAnimationState(game)).toBe(AnimationState.Death);
  });
});

describe('resolvePlayerHeading', () => {
  /** The out-parameter, fresh per assertion so a stale field cannot pass one. */
  const heading = (): PlayerHeading => ({ facing: PlayerFacing.South, mirror: 1 });

  it('faces the way he is walking', () => {
    const game = sim();
    const out = heading();
    place(game, 100, 100, 100, 96);
    expect(resolvePlayerHeading(game, out)).toBe(true);
    expect(out).toEqual({ facing: PlayerFacing.South, mirror: 1 });
    place(game, 100, 100, 100, 104);
    resolvePlayerHeading(game, out);
    expect(out).toEqual({ facing: PlayerFacing.North, mirror: 1 });
  });

  it('mirrors the side strip rather than authoring a fourth direction', () => {
    const game = sim();
    const out = heading();
    place(game, 100, 100, 104, 100);
    // Authored facing left, so walking left draws it as-is.
    resolvePlayerHeading(game, out);
    expect(out).toEqual({ facing: PlayerFacing.Side, mirror: 1 });
    place(game, 100, 100, 96, 100);
    resolvePlayerHeading(game, out);
    expect(out).toEqual({ facing: PlayerFacing.Side, mirror: -1 });
  });

  it('draws a diagonal as the side view, which keeps the face and the tank in frame', () => {
    const game = sim();
    const out = heading();
    place(game, 100, 100, 96, 96);
    resolvePlayerHeading(game, out);
    expect(out.facing).toBe(PlayerFacing.Side);
  });

  it('faces where he is aiming when he is standing still', () => {
    const game = sim();
    const out = heading();
    place(game, 100, 100);
    game.aimDirectionX = 0;
    game.aimDirectionY = -1;
    resolvePlayerHeading(game, out);
    expect(out.facing).toBe(PlayerFacing.North);
  });

  it('lets movement beat aim, because that is the question the player is asking', () => {
    const game = sim();
    const out = heading();
    place(game, 100, 100, 100, 96);
    game.aimDirectionX = 0;
    game.aimDirectionY = -1;
    resolvePlayerHeading(game, out);
    expect(out.facing).toBe(PlayerFacing.South);
  });

  it('keeps facing the aim while standing still and firing, unmoved by recoil push', () => {
    const game = sim();
    const out = heading();
    // Standing still: no input-driven velocity, only the transform sitting
    // in place — the state a held-down idle shot leaves the player in
    // between ticks, `push`'s recoil impulse notwithstanding.
    place(game, 100, 100);
    game.aimDirectionX = -1;
    game.aimDirectionY = 0;
    // Firing kicks the player with a recoil impulse opposite the aim
    // (`sim/systems/shooting.ts`'s `fire()`, via `addPush`) on the `push`
    // channel, not `velocity`. Before this, `resolvePlayerHeading` read the
    // raw position delta, which push contributes to just as much as real
    // movement — so a shot fired stationary flipped the body to face away
    // from the aim for a tick or two until the push decayed, then back,
    // flickering left-right on every shot. `push` alone must not move the
    // needle here.
    const pushBase = game.playerIndex * 2;
    game.push.data[pushBase] = 0.3;
    game.push.data[pushBase + 1] = 0;
    resolvePlayerHeading(game, out);
    expect(out).toEqual({ facing: PlayerFacing.Side, mirror: 1 });
  });
});

describe('schlauchOctant', () => {
  it('maps the eight authored directions onto the frames they were drawn as', () => {
    expect(schlauchOctant(1, 0)).toBe(0);
    expect(schlauchOctant(1, 1)).toBe(1);
    expect(schlauchOctant(0, 1)).toBe(2);
    expect(schlauchOctant(-1, 1)).toBe(3);
    expect(schlauchOctant(-1, 0)).toBe(4);
    expect(schlauchOctant(-1, -1)).toBe(5);
    expect(schlauchOctant(0, -1)).toBe(6);
    expect(schlauchOctant(1, -1)).toBe(7);
  });

  it('never returns an index the strip does not have, at any angle', () => {
    for (let degrees = 0; degrees < 720; degrees += 3) {
      const radians = (degrees / 180) * Math.PI;
      const octant = schlauchOctant(Math.cos(radians), Math.sin(radians));
      expect(octant).toBeGreaterThanOrEqual(0);
      expect(octant).toBeLessThan(SCHLAUCH_OCTANTS);
    }
  });
});

describe('PlayerView', () => {
  function view(): { game: GameSim; player: PlayerView } {
    const game = sim();
    place(game, 100, 100);
    return { game, player: new PlayerView(stubPlayerArt()) };
  }

  it('draws the sober strip until Promille reaches the tier that starts costing him', () => {
    const { game, player } = view();
    player.sync(game, 1, 0);
    expect(player.bodyKey).toBe('south');
    // Angeheitert: sway, but no drift and no wobble yet — and no lean.
    game.addPromille(0.6);
    player.sync(game, 1, 16);
    expect(player.bodyKey).toBe('south');
    // Beduselt: exactly where `promilleDriftScale` starts ramping.
    game.addPromille(1);
    player.sync(game, 1, 32);
    expect(player.bodyKey).toBe('drunk-south');
  });

  it('stays drunk with sway and drift turned all the way down (#33)', () => {
    const { game, player } = view();
    // The accessibility toggles, at their most aggressive.
    game.swayScale = 0;
    game.driftScale = 0;
    game.wobbleScale = 0;
    game.addPromille(2);
    player.sync(game, 1, 0);
    expect(player.bodyKey).toBe('drunk-south');
  });

  it('keeps its place in the walk cycle when he turns a corner', () => {
    const { game, player } = view();
    place(game, 100, 100, 100, 96);
    player.sync(game, 1, 0);
    player.sync(game, 1, 220);
    const midStride = player.frame;
    expect(player.bodyKey).toBe('south');
    // Same state, different strip: a corner should not restart the cycle.
    place(game, 100, 100, 104, 100);
    player.sync(game, 1, 220);
    expect(player.bodyKey).toBe('side');
    expect(player.frame).toBe(midStride);
  });

  it('advances the walk on the render clock, not once per rendered frame', () => {
    const { game, player } = view();
    place(game, 100, 100, 100, 96);
    player.sync(game, 1, 0);
    expect(player.frame).toBe(0);

    // Ten frames of a 144 Hz display is 69 ms, which is less than one 110 ms
    // frame of walk: a view that stepped once per rendered frame would be
    // three-quarters of the way round the cycle by now.
    let now = 0;
    for (let frame = 0; frame < 10; frame++) {
      now += 1000 / 144;
      player.sync(game, 1, now);
    }
    expect(player.frame).toBe(0);

    // Past 110 ms it is on the walk's second pose, on any display.
    player.sync(game, 1, 130);
    expect(player.frame).toBe(2);
  });

  it('lights the nozzle for the shot and puts it out again', () => {
    const { game, player } = view();
    game.aimDirectionX = 1;
    game.aimDirectionY = 0;
    player.sync(game, 1, 0);
    expect(player.schlauchFrame).toBe(0);

    game.lastShotTick = game.tick;
    player.sync(game, 1, 16);
    expect(player.schlauchFrame).toBe(SCHLAUCH_OCTANTS);

    for (let tick = 0; tick < 6; tick++) {
      game.step();
    }
    player.sync(game, 1, 120);
    expect(player.schlauchFrame).toBe(0);
  });

  it('aims the hose independently of the way the body is walking', () => {
    const { game, player } = view();
    // Walking left, aiming right — the case a four-way body cannot express on
    // its own, and the reason the Schlauch is its own layer.
    place(game, 100, 100, 104, 100);
    game.aimDirectionX = 1;
    game.aimDirectionY = 0;
    player.sync(game, 1, 0);
    expect(player.bodyKey).toBe('side');
    expect(player.schlauchFrame).toBe(schlauchOctant(1, 0));
  });
});

/**
 * The `@hot` half of `PlayerView`'s contract.
 *
 * Alois is drawn every frame of every run, so `sync` is as much a frame-loop
 * function as the animator's `track` is, and the same budget applies. The two
 * mistakes it is actually watching for are the ones that were in the first
 * draft: a `{ facing, mirror }` returned fresh from the heading resolver, and
 * a template-literal strip key built per frame.
 */
describe('PlayerView allocation behaviour', () => {
  // Two kilobytes: the loop below measures a little over 0.7 KB, which is the
  // instrument's own floor (`tests/helpers/allocation.ts`) rather than
  // anything this class hands out, and either of the two mistakes above costs
  // a few kilobytes on top of it at this frame count.
  const BUDGET_BYTES = 2 * 1024;

  it('draws a second of walking, turning and firing without allocating', () => {
    const game = sim();
    const player = new PlayerView(stubPlayerArt());
    let nowMs = 0;
    place(game, 100, 100, 98, 100);
    for (let frame = 0; frame < 4; frame++) {
      player.sync(game, 1, nowMs);
      nowMs += 16;
    }

    const bytes = bytesPerPass(() => {
      for (let frame = 0; frame < 60; frame++) {
        // Turn every quarter second and fire every eighth, so the state
        // transition and strip-swap paths are both inside the measurement.
        if (frame % 15 === 0) {
          place(game, 100, 100, 100, 98);
        } else if (frame % 15 === 7) {
          place(game, 100, 100, 98, 100);
        }
        if (frame % 8 === 0) {
          game.lastShotTick = game.tick;
        }
        player.sync(game, 1, nowMs);
        nowMs += 16;
      }
    });

    expect(bytes).toBeLessThan(BUDGET_BYTES);
  });
});
