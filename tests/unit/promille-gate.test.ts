import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PROMILLE_OVERRIDE_KEY,
  nextPromilleOverride,
  promilleUnlockFloor,
  promilleUnlockedIn,
  readPromilleOverride,
  resolvePromilleUnlocked,
  resolvePromilleUnlockFloor,
  writePromilleOverride,
} from '../../src/app/promille-gate.js';
import { UNLOCK_PROMILLE } from '../../src/app/meta/index.js';
import { createDefaultSave, type SaveData } from '../../src/app/save/schema.js';
import { GameSim, PROMILLE_UNLOCK_ANNOUNCE_TICKS } from '../../src/sim/game/sim.js';
import { PromilleTier } from '../../src/sim/game/promille.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import type { SingleCellRoomTemplate } from '../../src/content/rooms/definition.js';
import { StatId } from '../../src/sim/stats/definition.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { installFakeLocalStorage } from '../helpers/fake-local-storage.js';

/**
 * The Promille gate (#85): a run is sober or promilled, decided once at run
 * start, and a sober run has no meter to speak of at all.
 *
 * Two halves, and they are deliberately tested apart. The *decision* is a
 * pure function of a save and a dev override, so it needs no simulation; the
 * *consequence* is a `GameSim` built with `promilleUnlocked: false`, and what
 * matters there is that every observable the mechanic has — the meter, the
 * tier, the drift, the wobble, the sway, the distortion, the stat bonuses —
 * is gone rather than merely sitting at its resting value for now.
 */

const IDLE = createInputFrame();

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

function saveWith(unlocks: readonly string[]): SaveData {
  return { ...createDefaultSave(), unlocks: [...unlocks] };
}

/** A `1x1` boss room with one live enemy — the shape #236's mid-run unlock keys off. */
function bossRoom(id = 'test-promille-gate-boss-room'): SingleCellRoomTemplate {
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

/** Kills the room's one enemy and runs the tick its clear-out actually resolves on. */
function killBoss(sim: GameSim): void {
  let enemyIndex = -1;
  sim.world.forEach(sim.enemyMask, (index) => {
    enemyIndex = index;
  });
  sim.kill(enemyIndex);
  sim.world.flush();
  sim.step(IDLE);
  while (sim.frozen) {
    sim.step(IDLE);
  }
}

/** Every pickup id currently on the floor. */
function livePickupIds(sim: GameSim): string[] {
  const ids: string[] = [];
  sim.world.forEach(sim.world.maskOf(sim.pickupKind), (index) => {
    ids.push(sim.pickups.at(sim.pickupKind.data[index] ?? -1).id);
  });
  return ids;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('who gets Promille (#85)', () => {
  it('is off until the unlock is earned, and on from then', () => {
    expect(promilleUnlockedIn(saveWith([]))).toBe(false);
    expect(promilleUnlockedIn(saveWith(['lore-opas-zettl']))).toBe(false);
    expect(promilleUnlockedIn(saveWith(['lore-opas-zettl', UNLOCK_PROMILLE]))).toBe(true);
  });

  it('follows the save under the default override', () => {
    expect(resolvePromilleUnlocked(saveWith([]), 'auto')).toBe(false);
    expect(resolvePromilleUnlocked(saveWith([UNLOCK_PROMILLE]), 'auto')).toBe(true);
  });

  it('forces either state regardless of the save, in both directions', () => {
    // The direction that is easy to forget is the second one: a developer
    // whose own save has long since beaten Der Stier needs to be able to
    // reach the sober run without wiping their progress to get there.
    expect(resolvePromilleUnlocked(saveWith([]), 'promilled')).toBe(true);
    expect(resolvePromilleUnlocked(saveWith([UNLOCK_PROMILLE]), 'sober')).toBe(false);
  });

  it('cycles auto -> sober -> promilled -> auto, so one key reaches every state', () => {
    expect(nextPromilleOverride('auto')).toBe('sober');
    expect(nextPromilleOverride('sober')).toBe('promilled');
    expect(nextPromilleOverride('promilled')).toBe('auto');
  });
});

describe('the override survives a reload without becoming save data (#85)', () => {
  it('round-trips through storage, and clears its key entirely for auto', () => {
    const storage = installFakeLocalStorage();
    writePromilleOverride('sober');
    expect(readPromilleOverride()).toBe('sober');

    writePromilleOverride('auto');
    // Removed, not stored as the string "auto": the absence of the key is
    // what "no override" means, so a build that stopped writing it still
    // reads correctly.
    expect(storage.getItem(PROMILLE_OVERRIDE_KEY)).toBeNull();
    expect(readPromilleOverride()).toBe('auto');
  });

  it('reads auto when storage is missing or holds something nobody wrote', () => {
    // No `localStorage` at all — this project's vitest runs in `node`, which
    // is the same absence a private window produces.
    expect(readPromilleOverride()).toBe('auto');

    installFakeLocalStorage().setItem(PROMILLE_OVERRIDE_KEY, 'tipsy');
    expect(readPromilleOverride()).toBe('auto');
  });
});

describe('a sober run has no Promille at all (#85)', () => {
  function soberSim(): GameSim {
    return new GameSim({ room: bareRoom(), promilleUnlocked: false });
  }

  it('cannot be raised — by beer, by an item, or by anything else', () => {
    const sim = soberSim();
    sim.addPromille(3);
    expect(sim.promille).toBe(0);
    expect(sim.tuning.promille.current).toBe(0);
  });

  it('reads Nüchtern forever, so no tier bonus is ever registered', () => {
    const sim = soberSim();
    const base = sim.stats.value(StatId.Damage);
    sim.addPromille(4);
    sim.step(IDLE);
    expect(sim.promilleTier).toBe(PromilleTier.Nuchtern);
    expect(sim.stats.value(StatId.Damage)).toBeCloseTo(base, 5);
  });

  it('leaves no drift, wobble, sway or distortion behind', () => {
    const sim = soberSim();
    // Written straight into tuning rather than through `addPromille`: this
    // is the debug tuning window's own path, the one way a sober run can
    // have a non-zero number in `tuning.promille.current` at all, and #85's
    // "the override switches the whole mechanic cleanly, leaving no HUD or
    // drift behind" has to hold for it too.
    sim.tuning.promille.current = 5;
    sim.step(IDLE);
    expect(sim.promille).toBe(0);
    expect(sim.promilleDriftScale).toBe(0);
    expect(sim.promilleWobbleAmplitude).toBe(0);
    expect(sim.promilleScreenDistortion).toBe(0);
    expect(sim.swayX).toBe(0);
    expect(sim.swayY).toBe(0);
    expect(sim.hasKater).toBe(false);
    expect(sim.umgfallnTicks).toBe(0);
  });

  it('still heals from food, which simply has nothing left to lower', () => {
    const sim = soberSim();
    sim.applyPlayerDamage(2);
    const hurt = sim.playerHealth;
    sim.lowerPromille(0.5);
    sim.addPlayerHealth(1);
    expect(sim.playerHealth).toBe(hurt + 1);
    expect(sim.promille).toBe(0);
  });

  it('is fixed for the whole run — a promilled run is unaffected by any of this', () => {
    const sim = new GameSim({ room: bareRoom(), promilleUnlocked: true });
    sim.addPromille(2);
    expect(sim.promille).toBeCloseTo(2, 5);
    expect(sim.promilleTier).toBe(PromilleTier.Beduselt);
  });
});

/**
 * The gate moved inside the run (#236). The floor it moved to is read out of
 * the unlock's own condition rather than written down twice, and the flip
 * itself is a `GameSim` event on the tick a boss room becomes clear — which
 * is what keeps a resumed or replayed run reaching it at the same tick from
 * the seed and the input log alone.
 */
describe('where an unearned run meets the meter (#236)', () => {
  it('reads the floor out of the unlock data, not a second constant', () => {
    expect(promilleUnlockFloor()).toBe(1);
  });

  it('gives a sober run the mid-run gate and a promilled one nothing to unlock', () => {
    expect(resolvePromilleUnlockFloor(false)).toBe(promilleUnlockFloor());
    expect(resolvePromilleUnlockFloor(true)).toBeNull();
  });

  it("switches the mechanic on when the gate floor's boss room clears", () => {
    const sim = new GameSim({
      seed: 7,
      roomTemplate: bossRoom(),
      floor: 1,
      population: 'empty',
      promilleUnlocked: false,
      promilleUnlockFloor: 1,
    });
    expect(sim.promilleUnlocked).toBe(false);
    // Sober right up to the tick the room clears: the boss's own drops still
    // roll the `sober` half of their tables.
    sim.addPromille(1);
    expect(sim.promille).toBe(0);

    killBoss(sim);

    expect(sim.promilleUnlocked).toBe(true);
    expect(sim.promilleUnlockAnnounced).toBe(true);
    // And the first Maß is on the floor, so the meter has something to do
    // before the floor is over rather than an empty bar and a ~2% drop roll.
    expect(livePickupIds(sim)).toContain('mass-full');
    sim.addPromille(1);
    expect(sim.promille).toBeCloseTo(1, 5);
    expect(sim.promilleTier).toBe(PromilleTier.Angeheitert);
  });

  it('does nothing on a boss room below the gate floor, and nothing twice', () => {
    const belowGate = new GameSim({
      seed: 7,
      roomTemplate: bossRoom(),
      floor: 1,
      population: 'empty',
      promilleUnlocked: false,
      promilleUnlockFloor: 2,
    });
    killBoss(belowGate);
    expect(belowGate.promilleUnlocked).toBe(false);
    expect(belowGate.promilleUnlockAnnounced).toBe(false);
    expect(livePickupIds(belowGate)).not.toContain('mass-full');

    // A run that already had the meter never announces an arrival, and never
    // gets a second free Maß for clearing the same kind of room.
    const alreadyOn = new GameSim({
      seed: 7,
      roomTemplate: bossRoom(),
      floor: 1,
      population: 'empty',
      promilleUnlocked: true,
      promilleUnlockFloor: 1,
    });
    killBoss(alreadyOn);
    expect(alreadyOn.promilleUnlockAnnounced).toBe(false);
  });

  it('leaves a run with no gate exactly as it was before the gate moved', () => {
    const sim = new GameSim({
      seed: 7,
      roomTemplate: bossRoom(),
      floor: 1,
      population: 'empty',
      promilleUnlocked: false,
    });
    killBoss(sim);
    expect(sim.promilleUnlocked).toBe(false);
  });

  it('ages the banner out on its own clock', () => {
    const sim = new GameSim({
      seed: 7,
      roomTemplate: bossRoom(),
      floor: 1,
      population: 'empty',
      promilleUnlocked: false,
      promilleUnlockFloor: 1,
    });
    killBoss(sim);
    for (let tick = 0; tick < PROMILLE_UNLOCK_ANNOUNCE_TICKS; tick++) {
      sim.step(IDLE);
    }
    expect(sim.promilleUnlockAnnounced).toBe(false);
    // The mechanic itself does not age out with the banner.
    expect(sim.promilleUnlocked).toBe(true);
  });
});
