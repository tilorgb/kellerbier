import { describe, expect, it } from 'vitest';
import type { SingleCellRoomTemplate } from '../../src/content/rooms/definition.js';
import { DIFFICULTY_TIERS, HIGHEST_TIER } from '../../src/content/progression/tiers.js';
import {
  NO_DIFFICULTY,
  resolveDifficulty,
  scaledPrice,
  type DifficultyModifiers,
} from '../../src/sim/game/difficulty.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';

/**
 * Difficulty tiers (#505), sim side: the ladder resolves into stacking
 * modifiers, each modifier changes the one system it names, and tier 0 is
 * exactly the game without tiers.
 */

function room(
  id: string,
  specialRole: 'treasure' | 'shop' | undefined,
  props: SingleCellRoomTemplate['decorativeProps'] = [],
): SingleCellRoomTemplate {
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
    enemySpawns: [],
    spawnGroups: [],
    pickupSpawns: [],
    hazards: [],
    decorativeProps: props,
    metadata: {
      floorTags: ['test'],
      shape: '1x1',
      doors: { north: false, east: false, south: false, west: false },
      difficultyTier: 1,
      weight: 1,
      ...(specialRole === undefined ? {} : { specialRole }),
    },
  };
}

const TWO_PEDESTALS = [
  { x: 100, y: 80, type: 'pedestal' },
  { x: 200, y: 80, type: 'pedestal' },
] as const;

function sim(difficulty: DifficultyModifiers, template: SingleCellRoomTemplate, seed = 7): GameSim {
  return new GameSim({ seed, roomTemplate: template, floor: 1, population: 'empty', difficulty });
}

describe('the ladder (#505)', () => {
  it('has one rung per tier, 1 to the top, in order', () => {
    expect(DIFFICULTY_TIERS.map((rung) => rung.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(HIGHEST_TIER).toBe(5);
  });

  it('resolves tier 0 to no difficulty at all', () => {
    expect(resolveDifficulty(DIFFICULTY_TIERS, 0)).toEqual(NO_DIFFICULTY);
  });

  it('keeps every rung below the chosen one', () => {
    const tier3 = resolveDifficulty(DIFFICULTY_TIERS, 3);
    expect(tier3.enemyShotSpeedScale).toBeGreaterThan(1);
    expect(tier3.forcedCurseFloors).toEqual([1]);
    expect(tier3.shopPriceScale).toBeGreaterThan(1);
    expect(tier3.maxHealthDelta).toBe(0);
    expect(tier3.treasurePedestalsFewer).toBe(0);
    const tier5 = resolveDifficulty(DIFFICULTY_TIERS, 5);
    expect(tier5.maxHealthDelta).toBe(-2);
    expect(tier5.treasurePedestalsFewer).toBe(1);
  });

  it('stacks two rungs of the same kind instead of replacing one with the other', () => {
    const ladder = [
      { tier: 1, modifier: { kind: 'shopPrices', scale: 2 }, description: '' },
      { tier: 2, modifier: { kind: 'shopPrices', scale: 1.5 }, description: '' },
      { tier: 3, modifier: { kind: 'maxHealth', halfHearts: -1 }, description: '' },
      { tier: 4, modifier: { kind: 'maxHealth', halfHearts: -1 }, description: '' },
    ] as const;
    const resolved = resolveDifficulty(ladder, 4);
    expect(resolved.shopPriceScale).toBe(3);
    expect(resolved.maxHealthDelta).toBe(-2);
  });

  it('rounds a scaled price up, and leaves it alone at scale 1', () => {
    expect(scaledPrice(5, { ...NO_DIFFICULTY, shopPriceScale: 1.5 })).toBe(8);
    expect(scaledPrice(5, NO_DIFFICULTY)).toBe(5);
  });
});

describe('each modifier changes its own system (#505)', () => {
  it('enemy shots: scales the run’s own projectile speed, not the shared default', () => {
    const plain = sim(NO_DIFFICULTY, room('t-plain', undefined));
    const faster = sim({ ...NO_DIFFICULTY, enemyShotSpeedScale: 1.25 }, room('t-fast', undefined));
    expect(faster.tuning.enemy.projectileSpeedScale).toBeCloseTo(
      plain.tuning.enemy.projectileSpeedScale * 1.25,
      6,
    );
    expect(sim(NO_DIFFICULTY, room('t-plain-2', undefined)).tuning.enemy.projectileSpeedScale).toBe(
      plain.tuning.enemy.projectileSpeedScale,
    );
  });

  it('forced curse: the first floor is cursed on every seed', () => {
    let uncursedWithout = 0;
    for (let seed = 0; seed < 40; seed++) {
      const forced = sim(
        { ...NO_DIFFICULTY, forcedCurseFloors: [1] },
        room('t-c', undefined),
        seed,
      );
      expect(forced.curse, `seed ${String(seed)}`).not.toBeNull();
      if (sim(NO_DIFFICULTY, room('t-c', undefined), seed).curse === null) {
        uncursedWithout += 1;
      }
    }
    // Without the tier the roll does miss — otherwise this proves nothing.
    expect(uncursedWithout).toBeGreaterThan(0);
  });

  it('shop prices: a shop pedestal costs more', () => {
    let checked = 0;
    for (let seed = 0; seed < 40; seed++) {
      const plain = sim(NO_DIFFICULTY, room('t-shop', 'shop', [...TWO_PEDESTALS]), seed);
      const dear = sim(
        { ...NO_DIFFICULTY, shopPriceScale: 1.5 },
        room('t-shop', 'shop', [...TWO_PEDESTALS]),
        seed,
      );
      plain.activePedestals.forEach((pedestal, index) => {
        const scaled = dear.activePedestals[index];
        if (pedestal.itemIndex >= 0 && scaled !== undefined) {
          expect(scaled.price).toBe(Math.ceil(pedestal.price * 1.5));
          checked += 1;
        }
      });
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('max health: one heart fewer, never below one', () => {
    const plain = sim(NO_DIFFICULTY, room('t-h', undefined));
    const fewer = sim({ ...NO_DIFFICULTY, maxHealthDelta: -2 }, room('t-h', undefined));
    expect(fewer.playerMaxHealth).toBe(plain.playerMaxHealth - 2);
    expect(fewer.playerHealth).toBe(fewer.playerMaxHealth);
    const floored = sim({ ...NO_DIFFICULTY, maxHealthDelta: -100 }, room('t-h', undefined));
    expect(floored.playerMaxHealth).toBe(2);
  });

  it('treasure pedestals: the treasure room holds one back, other rooms none', () => {
    const plain = sim(NO_DIFFICULTY, room('t-tr', 'treasure', [...TWO_PEDESTALS]));
    const fewer = sim(
      { ...NO_DIFFICULTY, treasurePedestalsFewer: 1 },
      room('t-tr', 'treasure', [...TWO_PEDESTALS]),
    );
    expect(plain.activePedestals).toHaveLength(2);
    expect(fewer.activePedestals).toHaveLength(1);
    const normal = sim(
      { ...NO_DIFFICULTY, treasurePedestalsFewer: 1 },
      room('t-normal', undefined, [...TWO_PEDESTALS]),
    );
    expect(normal.activePedestals).toHaveLength(2);
  });
});

describe('tier 0 is exactly the game without tiers (#505)', () => {
  it('steps identically with NO_DIFFICULTY and with no difficulty at all', () => {
    const template = room('t-same', 'treasure', [...TWO_PEDESTALS]);
    const a = new GameSim({ seed: 3, roomTemplate: template, floor: 1, population: 'enemies' });
    const b = new GameSim({
      seed: 3,
      roomTemplate: template,
      floor: 1,
      population: 'enemies',
      difficulty: NO_DIFFICULTY,
    });
    const frame = createInputFrame();
    for (let tick = 0; tick < 600; tick++) {
      frame.moveX = Math.sin(tick / 30);
      frame.aimX = 1;
      a.step(frame);
      b.step(frame);
    }
    const snapshot = (s: GameSim): unknown => ({
      health: s.playerHealth,
      max: s.playerMaxHealth,
      curse: s.curse,
      pedestals: s.activePedestals,
      feats: s.feats.bests,
      tick: s.tick,
    });
    expect(snapshot(b)).toEqual(snapshot(a));
  });
});
