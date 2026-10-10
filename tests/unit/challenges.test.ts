import { describe, expect, it } from 'vitest';
import { challengeById, challengeRules, challengeRunParameters } from '../../src/app/challenges.js';
import {
  type ProgressionContent,
  STAT_WIN_FASTEST_TICKS,
  challengeWonStatKey,
  tierWonStatKey,
} from '../../src/app/meta/definition.js';
import {
  buildChallengeList,
  challengesOpen,
  grantEarnedUnlocks,
  medalMet,
  withRunWon,
} from '../../src/app/meta/progress.js';
import { migrateSave } from '../../src/app/save/migrations.js';
import { createDefaultSave, sanitizeSave, SAVE_SCHEMA_VERSION } from '../../src/app/save/schema.js';
import { alois } from '../../src/content/characters/alois.js';
import { CHALLENGES } from '../../src/content/progression/challenges.js';
import { MEDALS } from '../../src/content/progression/medals.js';
import { NO_CHALLENGE } from '../../src/sim/game/challenge.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { TICKS_PER_SECOND } from '../../src/sim/time.js';

/**
 * Challenge runs (#507): each challenge's rules hold in the sim whatever the
 * run does, its parameters are fixed by the challenge, and winning one is
 * recorded for its medal.
 */

const IDLE = createInputFrame();

function room(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

function trocken(): (typeof CHALLENGES)[number] {
  const found = challengeById('trocken');
  if (found === undefined) {
    throw new Error('trocken');
  }
  return found;
}

describe('Vollrausch: the meter never reads below its floor (#507)', () => {
  const rules = challengeRules(challengeById('vollrausch'));

  it('starts the run at the floor', () => {
    const sim = new GameSim({ room: room(), promilleUnlocked: true, challenge: rules });
    expect(sim.promille).toBeCloseTo(3, 6);
  });

  it('holds against a hit, a direct lowering and the meter’s own drift', () => {
    const sim = new GameSim({ room: room(), promilleUnlocked: true, challenge: rules });
    sim.applyPlayerDamage(1);
    sim.lowerPromille(10);
    expect(sim.promille).toBeGreaterThanOrEqual(3);
    for (let tick = 0; tick < 30 * TICKS_PER_SECOND; tick++) {
      sim.step(IDLE);
      expect(sim.promille).toBeGreaterThanOrEqual(3);
    }
  });

  it('holds across a seed sweep of play that drinks and sobers', () => {
    for (let seed = 0; seed < 20; seed++) {
      const sim = new GameSim({
        seed,
        room: room(),
        population: 'enemies',
        promilleUnlocked: true,
        challenge: rules,
      });
      const frame = createInputFrame();
      for (let tick = 0; tick < 600 && !sim.playerDead; tick++) {
        frame.moveX = Math.sin((tick + seed) / 17);
        frame.aimX = Math.cos(tick / 11);
        if (tick % 97 === 0) {
          sim.drinkBeer(0.5);
        }
        if (tick % 53 === 0) {
          sim.lowerPromille(1);
        }
        sim.step(frame);
        expect(sim.promille, `seed ${String(seed)} tick ${String(tick)}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('is no floor at all without the challenge', () => {
    const sim = new GameSim({ room: room(), promilleUnlocked: true, challenge: NO_CHALLENGE });
    expect(sim.promille).toBe(0);
  });
});

describe('Sperrstunde: the run ends at closing time (#507)', () => {
  const limit = 5 * TICKS_PER_SECOND;

  it('counts down, and ends the run on the last tick — not one sooner', () => {
    const sim = new GameSim({
      room: room(),
      challenge: { ...NO_CHALLENGE, timeLimitTicks: limit },
    });
    expect(sim.timeLeftTicks).toBe(limit);
    for (let tick = 0; tick < limit - 1; tick++) {
      sim.step(IDLE);
    }
    expect(sim.playerDead).toBe(false);
    expect(sim.timeLeftTicks).toBe(1);
    sim.step(IDLE);
    expect(sim.playerDead).toBe(true);
    expect(sim.timeLeftTicks).toBe(0);
  });

  it('does not take a run that was already won', () => {
    const sim = new GameSim({
      room: room(),
      challenge: { ...NO_CHALLENGE, timeLimitTicks: limit },
    });
    sim.markWon();
    for (let tick = 0; tick < limit + 10; tick++) {
      sim.step(IDLE);
    }
    expect(sim.playerWon).toBe(true);
    expect(sim.playerDead).toBe(false);
  });

  it('has no clock without the challenge', () => {
    expect(new GameSim({ room: room() }).timeLeftTicks).toBeNull();
  });
});

describe('Trocken: a sober run with no mid-run unlock (#507)', () => {
  it('fixes a sober run with the cellar boss’s Promille unlock turned off', () => {
    const run = challengeRunParameters(trocken());
    expect(run).toMatchObject({
      challenge: 'trocken',
      character: 'alois',
      tier: 0,
      lockedItems: [],
      promilleUnlocked: false,
      promilleUnlockFloor: null,
    });
  });

  it('every challenge is Alois, tier 0, the full pool — nothing read from the save', () => {
    for (const challenge of CHALLENGES) {
      const run = challengeRunParameters(challenge);
      expect(run.character, challenge.id).toBe('alois');
      expect(run.tier, challenge.id).toBe(0);
      expect(run.lockedItems, challenge.id).toEqual([]);
    }
  });
});

describe('opening and winning challenges (#507)', () => {
  const CONTENT: ProgressionContent = {
    unlocks: [],
    characters: [alois],
    challenges: CHALLENGES,
    medals: MEDALS,
  };

  it('opens on the first win, by either record of it', () => {
    expect(challengesOpen(createDefaultSave(), CONTENT)).toBe(false);
    const viaTier = { ...createDefaultSave(), statistics: { [tierWonStatKey('alois')]: 1 } };
    expect(challengesOpen(viaTier, CONTENT)).toBe(true);
    const viaFastest = { ...createDefaultSave(), statistics: { [STAT_WIN_FASTEST_TICKS]: 9000 } };
    expect(challengesOpen(viaFastest, CONTENT)).toBe(true);
  });

  it('records a won challenge, lists it as won, and earns its medal', () => {
    const save = withRunWon(createDefaultSave(), 'alois', 0, CONTENT, undefined, 'trocken');
    expect(save.statistics[challengeWonStatKey('trocken')]).toBe(1);
    expect(buildChallengeList(save, CONTENT).find((row) => row.id === 'trocken')?.completed).toBe(
      true,
    );
    expect(save.achievements).toContain('challenge-trocken');
    expect(save.achievements).not.toContain('challenges-all');
  });

  it('a won ordinary run is not a won challenge', () => {
    const save = withRunWon(createDefaultSave(), 'alois', 0, CONTENT);
    expect(buildChallengeList(save, CONTENT).some((row) => row.completed)).toBe(false);
  });

  it('every challenge won earns the medal for all of them', () => {
    const statistics: Record<string, number> = {};
    for (const challenge of CHALLENGES) {
      statistics[challengeWonStatKey(challenge.id)] = 1;
    }
    const save = grantEarnedUnlocks({ ...createDefaultSave(), statistics }, CONTENT);
    expect(medalMet(save, CONTENT, { kind: 'allChallenges' })).toBe(true);
    expect(save.achievements).toContain('challenges-all');
  });
});

describe('save v13 (#507)', () => {
  it('back-fills a v12 run in progress as no challenge, and keeps a recorded one', () => {
    const migrated = sanitizeSave(
      migrateSave({
        schemaVersion: 12,
        activeRun: {
          seed: 3,
          frames: [0, 0, 0, 0, 0],
          promilleUnlocked: true,
          character: 'alois',
          lockedItems: [],
          tier: 0,
          dailyDate: null,
        },
      }),
    );
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.activeRun?.challenge).toBeNull();
    const kept = sanitizeSave({
      schemaVersion: SAVE_SCHEMA_VERSION,
      activeRun: { seed: 1, frames: [0, 0, 0, 0, 0], challenge: 'vollrausch' },
    });
    expect(kept.activeRun?.challenge).toBe('vollrausch');
  });
});
