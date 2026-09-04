import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ENEMY_DROP_TABLES } from '../../src/content/pickups/index.js';
import { createInputFrame, type InputFrame } from '../../src/sim/input/frame.js';

/**
 * A run is its seed **and its parameters** (#85).
 *
 * The determinism guarantee this project leans on everywhere — `GameSim`
 * "reads a single `InputFrame` per tick and nothing else", so a seed plus an
 * input log reconstructs a run exactly — is what `save/active-run.ts` resumes
 * with and what #48's replays will ship. The Promille gate is the first thing
 * to sit *outside* that pair: two runs on the same seed, fed the same inputs,
 * genuinely diverge depending on whether the beer was unlocked, because the
 * drop tables and the item pool are chosen from it.
 *
 * That is not a bug in the guarantee, it is a widening of it — which is
 * exactly why `ActiveRunSave` records the flag beside the log. This file pins
 * both halves: same seed and same flag replays identically, and the flag on
 * its own is enough to make it a different run.
 */

const SEED = 0x5061_5354;
const TICKS = 120;
const ROLLS = 60;

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

/** A short scripted log — moving and firing, so the run is not sitting still. */
function inputLog(): InputFrame[] {
  const frames: InputFrame[] = [];
  for (let tick = 0; tick < TICKS; tick++) {
    const frame = createInputFrame();
    frame.moveX = tick % 40 < 20 ? 100 : -100;
    frame.moveY = tick % 60 < 30 ? -80 : 80;
    frame.aimX = 127;
    frames.push(frame);
  }
  return frames;
}

/**
 * Runs the log and then rolls the real floor-1 drop table a fixed number of
 * times, returning what came out.
 *
 * The rolled ids are the digest deliberately: they depend on the RNG stream's
 * *position* (so any divergence earlier in the run shows up here) as well as
 * on which half of the table the run reads, which makes one array of strings
 * a witness for both halves of the claim.
 */
function runDigest(promilleUnlocked: boolean): string[] {
  const sim = new GameSim({ seed: SEED, room: bareRoom(), promilleUnlocked });
  for (const frame of inputLog()) {
    sim.step(frame);
  }
  const dropped: string[] = [];
  const before = new Set<number>();
  const pickupMask = sim.world.maskOf(sim.pickupKind);
  sim.world.forEach(pickupMask, (index) => before.add(index));
  for (let roll = 0; roll < ROLLS; roll++) {
    sim.dropLoot(ENEMY_DROP_TABLES.normal, 160, 90);
  }
  sim.world.flush();
  sim.world.forEach(pickupMask, (index) => {
    if (!before.has(index)) {
      dropped.push(sim.pickups.at(sim.pickupKind.data[index] ?? -1).id);
    }
  });
  return dropped;
}

describe('a seed reproduces the run it recorded, not the run the player has unlocked (#85)', () => {
  it('replays identically for the same seed and the same run state', () => {
    expect(runDigest(false)).toEqual(runDigest(false));
    expect(runDigest(true)).toEqual(runDigest(true));
  });

  it('is a different run on the same seed once the state differs', () => {
    const sober = runDigest(false);
    const promilled = runDigest(true);
    expect(sober).not.toEqual(promilled);
    // And it differs in the direction the gate promises, not merely somewhere:
    // the sober run rolled real loot, and none of it was a Maß.
    expect(sober.length).toBeGreaterThan(0);
    expect(sober).not.toContain('mass-full');
    expect(sober).not.toContain('mass-half');
    expect(promilled.some((id) => id === 'mass-full' || id === 'mass-half')).toBe(true);
  });
});
