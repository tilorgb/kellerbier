import { describe, expect, it } from 'vitest';
import type { SingleCellRoomTemplate } from '../../src/content/rooms/definition.js';
import { resi } from '../../src/content/characters/resi.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { PromilleTier } from '../../src/sim/game/promille.js';
import { RunFeatTracker, itemTagUniverse } from '../../src/sim/game/feats.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { TICKS_PER_SECOND } from '../../src/sim/time.js';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';

/**
 * The sim's half of run feats (#502): `GameSim.feats` recording how each
 * boss fight went and the run's bests. The app's half — folding these into
 * the save and judging conditions against them — is `run-feats-meta.test.ts`.
 *
 * Every feat kind gets a test that sets the situation up and checks it is
 * reported, and the edges that would hand one out by accident get a test
 * that it is *not*: a hit before the fight, a fight the player died in, a
 * cleared boss room walked back into.
 */

const IDLE = createInputFrame();

/** A `1x1` boss room with one live enemy — same shape as `promille-gate.test.ts`'s. */
function bossRoom(id = 'test-feats-boss-room'): SingleCellRoomTemplate {
  return {
    id,
    tileGrid: [
      '###############',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '###############',
    ],
    obstacles: [],
    enemySpawns: [{ x: 176, y: 64, group: 'boss' }],
    spawnGroups: [
      { id: 'boss', count: 1, choices: [{ enemyId: 'kellerassel', minFloor: 1, maxFloor: 7 }] },
    ],
    pickupSpawns: [],
    hazards: [],
    decorativeProps: [],
    metadata: {
      floorTags: ['test'],
      shape: '1x1',
      doors: { north: false, east: false, south: false, west: false },
      difficultyTier: 1,
      weight: 1,
      specialRole: 'boss',
    },
  };
}

function bossSim(options: Partial<ConstructorParameters<typeof GameSim>[0]> = {}): GameSim {
  return new GameSim({
    seed: 7,
    roomTemplate: bossRoom(),
    floor: 2,
    population: 'empty',
    promilleUnlocked: true,
    ...options,
  });
}

/** Kills every enemy in the room and runs the tick the clear-out resolves on. */
function killBoss(sim: GameSim): void {
  const enemies: number[] = [];
  sim.world.forEach(sim.enemyMask, (index) => {
    enemies.push(index);
  });
  for (const index of enemies) {
    sim.kill(index);
  }
  sim.world.flush();
  sim.step(IDLE);
  while (sim.frozen) {
    sim.step(IDLE);
  }
}

function idle(sim: GameSim, ticks: number): void {
  for (let tick = 0; tick < ticks; tick++) {
    sim.step(IDLE);
  }
}

describe('boss fights (#502)', () => {
  it('records a won fight: floor, character, time, and a clean sheet', () => {
    const sim = bossSim();
    idle(sim, 90);
    killBoss(sim);
    const [fight] = sim.feats.bossFights;
    expect(sim.feats.bossFights).toHaveLength(1);
    expect(fight?.floor).toBe(2);
    expect(fight?.character).toBe('alois');
    expect(fight?.hitsTaken).toBe(0);
    expect(fight?.ticks).toBeGreaterThanOrEqual(90);
    expect(fight?.ticks).toBeLessThan(90 + TICKS_PER_SECOND);
    expect(fight?.healthLeft).toBe(sim.playerHealth + sim.playerSoulHealth);
    expect(fight?.topQuality).toBe(-1);
  });

  it('counts the hits that land during the fight, and only those', () => {
    const sim = new GameSim({ seed: 7, floor: 2, population: 'empty', promilleUnlocked: true });
    sim.applyPlayerDamage(1);
    sim.loadRoom(bossRoom(), 2);
    sim.applyPlayerDamage(1);
    // Inside the room's warmup, so the boss itself cannot land one too.
    idle(sim, 2);
    sim.applyPlayerDamage(1);
    expect(sim.feats.fightInProgress(sim.tick)?.hits).toBe(2);
    killBoss(sim);
    expect(sim.feats.bossFights[0]?.hitsTaken).toBe(2);
  });

  it('records the health left at the kill, in half-Maß', () => {
    const sim = bossSim();
    const full = sim.playerHealth;
    sim.applyPlayerDamage(full - 1);
    killBoss(sim);
    expect(sim.feats.bossFights[0]?.healthLeft).toBe(1);
  });

  it('records who won it', () => {
    const sim = bossSim({ character: resi.traits });
    killBoss(sim);
    expect(sim.feats.bossFights[0]?.character).toBe(resi.id);
  });

  it('records the Promille at the kill, and whether the meter existed', () => {
    const sober = bossSim();
    killBoss(sober);
    expect(sober.feats.bossFights[0]).toMatchObject({
      promilleUnlocked: true,
      promille: 0,
      promilleTier: PromilleTier.Nuchtern,
    });

    const drunk = bossSim();
    drunk.addPromille(2);
    killBoss(drunk);
    expect(drunk.feats.bossFights[0]?.promilleTier).toBe(PromilleTier.Beduselt);

    // A sober *run* reads zero too — the fold has to tell the two apart,
    // which is why the record carries the flag.
    const soberRun = bossSim({ promilleUnlocked: false });
    killBoss(soberRun);
    expect(soberRun.feats.bossFights[0]?.promilleUnlocked).toBe(false);
  });

  it('records the build at the kill: top quality, and which tags nothing held carried', () => {
    const sim = bossSim();
    sim.pickUpItem('rosinenbrot');
    sim.pickUpItem('apfelkuchen');
    killBoss(sim);
    const fight = sim.feats.bossFights[0];
    expect(fight?.topQuality).toBe(1);
    expect(fight?.absentTags).toContain('impure');
    expect(fight?.absentTags).not.toContain('rosinen');
  });

  it('records the lowest tier held on the floor up to the kill', () => {
    const sim = bossSim();
    sim.addPromille(2.2);
    idle(sim, 2);
    killBoss(sim);
    expect(sim.feats.bossFights[0]?.floorLowestTier).toBe(PromilleTier.Beduselt);

    const dipped = bossSim();
    dipped.addPromille(2.2);
    idle(dipped, 2);
    dipped.lowerPromille(2.2);
    idle(dipped, 2);
    dipped.addPromille(2.2);
    killBoss(dipped);
    expect(dipped.feats.bossFights[0]?.floorLowestTier).toBe(PromilleTier.Nuchtern);
  });

  it('records nothing for a boss room the player died in', () => {
    const sim = bossSim();
    sim.applyPlayerDamage(1000);
    expect(sim.playerDead).toBe(true);
    killBoss(sim);
    expect(sim.feats.bossFights).toHaveLength(0);
  });

  it('records a fight once — walking back into the cleared room is not a second one', () => {
    const sim = bossSim();
    killBoss(sim);
    sim.loadRoom(bossRoom(), 2);
    idle(sim, 30);
    expect(sim.feats.fightInProgress(sim.tick)).toBeNull();
    expect(sim.feats.bossFights).toHaveLength(1);
  });

  it('ignores rooms that are not boss rooms', () => {
    const template = bossRoom('test-feats-plain-room');
    const { specialRole: _boss, ...metadata } = template.metadata;
    const plain: SingleCellRoomTemplate = { ...template, metadata };
    const sim = new GameSim({ seed: 7, roomTemplate: plain, floor: 2, population: 'empty' });
    expect(sim.feats.fightInProgress(sim.tick)).toBeNull();
    killBoss(sim);
    expect(sim.feats.bossFights).toHaveLength(0);
  });
});

describe('run bests (#502)', () => {
  it('counts every Maß actually drunk', () => {
    const sim = bossSim();
    sim.drinkBeer(0.1);
    sim.drinkBeer(0.1);
    sim.drinkBeer(0.1);
    expect(sim.feats.bests.beersDrunk).toBe(3);
  });

  it('keeps the deepest tier reached, even after sobering up', () => {
    const sim = bossSim();
    sim.addPromille(3.2);
    idle(sim, 1);
    sim.lowerPromille(3.2);
    idle(sim, 1);
    expect(sim.feats.bests.deepestTier).toBe(PromilleTier.Vollrausch);
  });

  it('keeps the most passives held at once, not counting actives', () => {
    const sim = bossSim();
    const passive = ITEM_DEFINITIONS.filter((item) => item.active === undefined)
      .slice(0, 3)
      .map((item) => item.id);
    const active = ITEM_DEFINITIONS.find((item) => item.active !== undefined)?.id ?? '';
    for (const id of passive) {
      sim.pickUpItem(id);
    }
    sim.pickUpItem(active);
    sim.removeItem(passive[0] ?? '');
    expect(sim.feats.bests.mostPassives).toBe(3);
  });

  it('remembers a set completed, once', () => {
    const sim = bossSim();
    for (const id of ['braumeister-hammer', 'braumeister-schuerze', 'braumeister-visier']) {
      sim.pickUpItem(id);
    }
    sim.removeItem('braumeister-hammer');
    sim.pickUpItem('braumeister-hammer');
    expect(sim.feats.bests.completedSets).toEqual(['braumeister']);
  });

  it('moves `revision` when something new is recorded, and only then', () => {
    const sim = bossSim();
    idle(sim, 1);
    const before = sim.feats.revision;
    idle(sim, 30);
    expect(sim.feats.revision).toBe(before);
    sim.drinkBeer(0.1);
    expect(sim.feats.revision).toBeGreaterThan(before);
  });
});

describe('determinism (#502)', () => {
  /** A seeded stream of frames that moves and shoots — enough to take and land hits. */
  function frames(seed: number, count: number): ReturnType<typeof createInputFrame>[] {
    let state = seed >>> 0;
    const next = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const result: ReturnType<typeof createInputFrame>[] = [];
    for (let i = 0; i < count; i++) {
      const frame = createInputFrame();
      frame.moveX = next() * 2 - 1;
      frame.moveY = next() * 2 - 1;
      frame.aimX = next() * 2 - 1;
      frame.aimY = next() * 2 - 1;
      result.push(frame);
    }
    return result;
  }

  it('records the same feats from the same seed and inputs', () => {
    const input = frames(11, 1200);
    const run = (): unknown => {
      const sim = bossSim();
      for (const frame of input) {
        sim.step(frame);
      }
      return {
        fights: sim.feats.bossFights,
        bests: sim.feats.bests,
        inProgress: sim.feats.fightInProgress(sim.tick),
      };
    };
    expect(run()).toEqual(run());
  });
});

describe('itemTagUniverse', () => {
  it('collects every tag on the roster, sorted', () => {
    expect(itemTagUniverse([{ tags: ['b', 'a'] }, { tags: ['a'] }, { tags: [] }])).toEqual([
      'a',
      'b',
    ]);
    const tracker = new RunFeatTracker(['a']);
    expect(tracker.bossFights).toEqual([]);
  });
});
