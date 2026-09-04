import { describe, expect, it } from 'vitest';
import { GameSim, PLAYER_RADIUS } from '../../src/sim/game/sim.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import cellarRoom from '../../src/content/rooms/cellar.json';
import { ProjectileTag, hasTag } from '../../src/sim/projectile/tags.js';
import { StatId } from '../../src/sim/stats/definition.js';
import { DEFAULT_CHARACTER_TUNING } from '../../src/sim/tuning.js';
import type { CharacterTraits } from '../../src/sim/character/definition.js';
import { alois } from '../../src/content/characters/alois.js';
import { derWolpertinger } from '../../src/content/characters/der-wolpertinger.js';
import { koenigLudwig } from '../../src/content/characters/koenig-ludwig.js';
import { resi } from '../../src/content/characters/resi.js';
import { sennerin } from '../../src/content/characters/sennerin.js';

const IDLE = createInputFrame();

function openRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 640, 360);
}

/** A sim holding the player and nothing else, so a pickup or a wall is the only thing in the room. */
function simFor(traits: CharacterTraits, room: RoomGeometry = openRoom()): GameSim {
  return new GameSim({ seed: 11, room, population: 'empty', character: traits });
}

function aiming(aimX: number, aimY: number): InputFrame {
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(aimX);
  frame.aimY = quantiseAxis(aimY);
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

function held(moveX: number, moveY: number): InputFrame {
  const frame = createInputFrame();
  frame.moveX = quantiseAxis(moveX);
  frame.moveY = quantiseAxis(moveY);
  return frame;
}

function placePlayer(sim: GameSim, x: number, y: number): void {
  const base = sim.playerIndex * 4;
  sim.transform.data[base] = x;
  sim.transform.data[base + 1] = y;
  sim.transform.data[base + 2] = x;
  sim.transform.data[base + 3] = y;
}

function playerX(sim: GameSim): number {
  return sim.positionX(sim.playerIndex);
}

/** The tag mask of the first live projectile. */
function firstShotTags(sim: GameSim): number {
  let mask = 0;
  let found = false;
  sim.projectiles.forEachLive((slot) => {
    if (!found) {
      mask = sim.projectiles.tags[slot] ?? 0;
      found = true;
    }
  });
  return mask;
}

describe('characters (#47)', () => {
  it('runs as Alois when nobody said otherwise, with no character modifiers at all', () => {
    const bare = new GameSim({ room: openRoom() });
    const chosen = simFor(alois.traits);
    expect(bare.character.id).toBe('alois');
    expect(chosen.stats.value(StatId.Gschwindigkeit)).toBe(bare.stats.value(StatId.Gschwindigkeit));
    for (const stat of [StatId.Stammwuerze, StatId.Schluckfrequenz, StatId.Reichweite]) {
      expect(chosen.stats.trace(stat).steps).toHaveLength(1);
    }
  });

  it('starts the run on the character’s own health, items and purse', () => {
    const ludwig = simFor(koenigLudwig.traits);
    expect(ludwig.playerMaxHealth).toBe(4);
    expect(ludwig.playerHealth).toBe(4);
    expect(ludwig.biermarken).toBe(40);
    expect(ludwig.hasItem('ludwigs-schwan')).toBe(true);
  });

  it('folds a character’s stat block into the pipeline as its own named source', () => {
    const fast = simFor(resi.traits);
    const plain = simFor(alois.traits);
    expect(fast.stats.value(StatId.Gschwindigkeit)).toBeGreaterThan(
      plain.stats.value(StatId.Gschwindigkeit),
    );
    // A delay, so faster firing is a smaller number — see `tuning.ts`.
    expect(fast.stats.value(StatId.Schluckfrequenz)).toBeLessThan(
      plain.stats.value(StatId.Schluckfrequenz),
    );
    const trace = fast.stats.trace(StatId.Gschwindigkeit);
    expect(trace.steps.some((step) => step.stage === 'multiply' && step.source.id === 'resi')).toBe(
      true,
    );
  });

  it('puts a character’s innate tags on every shot they fire', () => {
    const thrown = simFor(resi.traits);
    thrown.step(aiming(1, 0));
    const brezn = firstShotTags(thrown);
    expect(hasTag(brezn, ProjectileTag.Arcing)).toBe(true);
    expect(hasTag(brezn, ProjectileTag.Returning)).toBe(true);

    const rung = simFor(sennerin.traits);
    rung.step(aiming(1, 0));
    expect(hasTag(firstShotTags(rung), ProjectileTag.Bouncing)).toBe(true);

    const plain = simFor(alois.traits);
    plain.step(aiming(1, 0));
    expect(firstShotTags(plain)).toBe(0);
  });
});

describe('König Ludwig — flight and the purse (#47)', () => {
  /** A room with one crate in the middle of it, at the height the player stands. */
  function roomWithCrate(): RoomGeometry {
    const room = openRoom();
    room.addBlock(300, 150, 340, 210, true);
    return room;
  }

  it('crosses a room’s furniture, where anybody else is stopped by it', () => {
    const walker = simFor(alois.traits, roomWithCrate());
    const flier = simFor(koenigLudwig.traits, roomWithCrate());
    for (const sim of [walker, flier]) {
      placePlayer(sim, 260, 180);
      for (let tick = 0; tick < 120; tick++) {
        sim.step(held(1, 0));
      }
    }
    // The walker is held up at the crate's near face; the flier is past it.
    expect(playerX(walker)).toBeLessThan(300);
    expect(playerX(flier)).toBeGreaterThan(340);
  });

  it('is still stopped by the room’s own wall — flight is not a way out of the map', () => {
    const room = openRoom();
    const sim = simFor(koenigLudwig.traits, room);
    placePlayer(sim, 600, 180);
    for (let tick = 0; tick < 120; tick++) {
      sim.step(held(1, 0));
    }
    expect(playerX(sim)).toBeLessThanOrEqual(room.maxX - PLAYER_RADIUS + 0.001);
  });

  it('spends a Biermarke on the drum, and loses the crown’s damage when the purse empties', () => {
    const sim = simFor(koenigLudwig.traits);
    const interval = Math.round(DEFAULT_CHARACTER_TUNING.purseDrainTicks);
    const rich = sim.stats.value(StatId.Stammwuerze);
    expect(sim.pursePowered).toBe(true);

    for (let tick = 0; tick < interval; tick++) {
      sim.step(IDLE);
    }
    expect(sim.biermarken).toBe(39);

    for (let tick = 0; tick < interval * 40; tick++) {
      sim.step(IDLE);
    }
    expect(sim.biermarken).toBe(0);
    expect(sim.pursePowered).toBe(false);
    expect(sim.stats.value(StatId.Stammwuerze)).toBeLessThan(rich);

    // And a coin puts him straight back in the air.
    sim.addBiermarken(5);
    sim.step(IDLE);
    expect(sim.pursePowered).toBe(true);
    expect(sim.stats.value(StatId.Stammwuerze)).toBe(rich);
  });
});

describe('Der Wolpertinger — the reroll (#47)', () => {
  it('rolls a stat block at run start and a different one on the next floor', () => {
    const sim = simFor(derWolpertinger.traits);
    const first = sim.stats.value(StatId.Stammwuerze);
    expect(sim.chaosFloor).toBe(1);
    expect(first).not.toBe(sim.tuning.shooting.shotDamage);

    sim.loadRoom(cellarRoom, 2);
    expect(sim.chaosFloor).toBe(2);
    expect(sim.stats.value(StatId.Stammwuerze)).not.toBe(first);
  });

  it('is still the same monster on the same seed — chaos, not noise', () => {
    const a = simFor(derWolpertinger.traits);
    const b = simFor(derWolpertinger.traits);
    for (const stat of [StatId.Stammwuerze, StatId.Gschwindigkeit, StatId.Reichweite]) {
      expect(b.stats.value(stat)).toBe(a.stats.value(stat));
    }
  });

  /**
   * `CONTRIBUTING.md`'s gameplay row: same seed, same input log, same run.
   * The chaos character is the one whose rules could quietly break that —
   * it is the only one that draws from an RNG stream mid-run — so it is the
   * one the claim is checked on, across a floor change and everything the
   * roll then feeds (shot damage, shot speed, movement).
   */
  it('replays identically from the same seed and the same input log', () => {
    const script = (tick: number): InputFrame =>
      tick % 3 === 0 ? aiming(1, 0) : held(tick % 2 === 0 ? 1 : -1, 1);
    const play = (): string => {
      const sim = simFor(derWolpertinger.traits);
      for (let tick = 0; tick < 200; tick++) {
        sim.step(script(tick));
      }
      sim.loadRoom(cellarRoom, 2);
      for (let tick = 0; tick < 200; tick++) {
        sim.step(script(tick));
      }
      return [
        playerX(sim),
        sim.positionY(sim.playerIndex),
        sim.playerHealth,
        sim.projectiles.liveCount,
        sim.stats.value(StatId.Stammwuerze),
        sim.stats.value(StatId.Gschwindigkeit),
      ].join(':');
    };
    expect(play()).toBe(play());
  });

  it('leaves everybody else’s stats exactly where they were', () => {
    const sim = simFor(resi.traits);
    const before = sim.stats.value(StatId.Stammwuerze);
    sim.loadRoom(cellarRoom, 2);
    expect(sim.stats.value(StatId.Stammwuerze)).toBe(before);
    expect(sim.chaosFloor).toBe(-1);
  });
});

describe("D'Sennerin — her own ricochets (#47)", () => {
  it('cannot be hit by a shot that has not come off anything yet', () => {
    const sim = simFor(sennerin.traits);
    placePlayer(sim, 320, 180);
    const health = sim.playerHealth;
    for (let tick = 0; tick < 20; tick++) {
      sim.step(aiming(1, 0));
    }
    expect(sim.playerHealth).toBe(health);
  });

  it('is hit by her own Kuhglocke once it has come back off a wall', () => {
    // A corridor barely wider than the shot's own flight: it leaves her, hits
    // the far wall, bounces, and comes straight back through where she stands.
    const room = new RoomGeometry(0, 0, 80, 360);
    const sim = simFor(sennerin.traits, room);
    placePlayer(sim, 40, 180);
    const health = sim.playerHealth;
    for (let tick = 0; tick < 60; tick++) {
      sim.step(aiming(1, 0));
      if (sim.playerHealth < health) {
        break;
      }
    }
    expect(sim.playerHealth).toBeLessThan(health);
  });

  it('never turns a bounced shot on a character without the rule', () => {
    const room = new RoomGeometry(0, 0, 80, 360);
    const sim = simFor(alois.traits, room);
    sim.tuning.shooting.forcedTags |= ProjectileTag.Bouncing;
    placePlayer(sim, 40, 180);
    const health = sim.playerHealth;
    for (let tick = 0; tick < 60; tick++) {
      sim.step(aiming(1, 0));
    }
    expect(sim.playerHealth).toBe(health);
  });
});
