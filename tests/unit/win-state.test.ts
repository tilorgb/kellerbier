import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { buildRunDetailsText, runDetailsFrom } from '../../src/app/run-summary.js';
import {
  ENDLESS_FLOORS_KEY,
  readEndlessFloors,
  writeEndlessFloors,
} from '../../src/app/endless-floor-debug.js';
import { installFakeLocalStorage } from '../helpers/fake-local-storage.js';

/**
 * The win state (#155): clearing the last floor's boss ends the run rather
 * than looping back to floor 1. `GameSim.markWon` is the sim-level half —
 * a flag mirroring `playerDeadFlag`, set from outside the sim (the app
 * layer owns "which floor is last") but replaying identically because it
 * is called from the same deterministic, `advanceOneTick`-driven path a
 * room transition already is.
 */

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

describe('GameSim.markWon (#155)', () => {
  it('is false until marked, then true, with the tick it happened on', () => {
    const sim = new GameSim({ room: bareRoom() });
    expect(sim.playerWon).toBe(false);
    expect(sim.playerWonTick).toBe(-1);

    sim.step();
    sim.step();
    sim.markWon();

    expect(sim.playerWon).toBe(true);
    expect(sim.playerWonTick).toBe(2);
  });

  it('is idempotent — a second call does not move the recorded tick', () => {
    const sim = new GameSim({ room: bareRoom() });
    sim.step();
    sim.markWon();
    const tick = sim.playerWonTick;
    sim.step();
    sim.step();
    sim.markWon();
    expect(sim.playerWonTick).toBe(tick);
  });

  it('never fires once the player is already dead — a run does not end both ways', () => {
    const sim = new GameSim({ room: bareRoom() });
    sim.applyPlayerDamage(1000);
    expect(sim.playerDead).toBe(true);
    sim.markWon();
    expect(sim.playerWon).toBe(false);
    expect(sim.playerWonTick).toBe(-1);
  });

  it('a run marked won never also reports dead', () => {
    const sim = new GameSim({ room: bareRoom() });
    sim.markWon();
    expect(sim.playerDead).toBe(false);
  });
});

describe('run-summary reflects a win (#155, #48)', () => {
  it('runDetailsFrom reports won, no death word, and the tick markWon fired on', () => {
    const sim = new GameSim({ room: bareRoom() });
    sim.step();
    sim.step();
    sim.step();
    sim.markWon();
    // The clock keeps advancing after the outcome, same as it does after a
    // death — `ticksSurvived` has to freeze at the win, not read `sim.tick`.
    sim.step();
    sim.step();

    const details = runDetailsFrom(sim, 'Dorf & Acker', 'boss', 12);
    expect(details.won).toBe(true);
    expect(details.alive).toBe(true);
    expect(details.deathWord).toBeNull();
    expect(details.ticksSurvived).toBe(sim.playerWonTick);
    expect(details.ticksSurvived).toBeLessThan(sim.tick);
  });

  it('buildRunDetailsText phrases a win distinctly from "still going" or a death', () => {
    const text = buildRunDetailsText({
      seed: 7,
      character: 'Alois',
      floorName: 'Dorf & Acker',
      roomRole: 'boss',
      ticksSurvived: 1200,
      kills: 80,
      deathWord: null,
      items: [],
      alive: true,
      won: true,
    });
    expect(text).toContain('won on Dorf & Acker (boss)');
    expect(text).not.toContain('still going');
    expect(text).not.toContain('died');
  });

  it('omitting `won` still reads exactly as it did before #155 (defaults falsy)', () => {
    const text = buildRunDetailsText({
      seed: 7,
      character: 'Alois',
      floorName: 'Der Keller',
      roomRole: 'start',
      ticksSurvived: 60,
      kills: 0,
      deathWord: null,
      items: [],
      alive: true,
    });
    expect(text).toContain('still going, Der Keller (start)');
  });
});

describe('the endless-floor debug override (#155)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to off, and persists a toggle', () => {
    installFakeLocalStorage();
    expect(readEndlessFloors()).toBe(false);
    writeEndlessFloors(true);
    expect(readEndlessFloors()).toBe(true);
    writeEndlessFloors(false);
    expect(readEndlessFloors()).toBe(false);
  });

  it('clears its own key rather than writing a literal "false"', () => {
    const storage = installFakeLocalStorage();
    writeEndlessFloors(true);
    writeEndlessFloors(false);
    expect(storage.getItem(ENDLESS_FLOORS_KEY)).toBeNull();
  });

  it('never throws even without localStorage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => readEndlessFloors()).not.toThrow();
    expect(readEndlessFloors()).toBe(false);
    expect(() => {
      writeEndlessFloors(true);
    }).not.toThrow();
  });
});
