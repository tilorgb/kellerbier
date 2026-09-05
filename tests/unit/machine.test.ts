import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import type { ItemDefinition } from '../../src/sim/item/definition.js';
import { StatId } from '../../src/sim/stats/definition.js';
import { InputAction, createInputFrame, setActionDown } from '../../src/sim/input/frame.js';
import type { SingleCellRoomTemplate } from '../../src/content/rooms/definition.js';

const IDLE = createInputFrame();

/**
 * `RngStream.Items`'s first draw (the Losbrunnen spawn roll, `floor !==
 * lastFloorStartDispatched`'s own guard) is `true` at seed 4 and `false` at
 * seed 23 against the default `spawnChance: 0.85` (#238, up from #218's
 * 0.5) — found once by brute force
 * (`createStreamRng(seed, RngStream.Items).chance(0.85)`) since `GameSim`
 * has no way to override `tuning.machine` before its first room loads
 * inside its own constructor. Every other machine tuning field
 * (`breakChance`, roll percents, ...) *can* be mutated after construction,
 * since those are only read when a roll actually happens — this is the one
 * exception.
 */
const SEED_SPAWNS_MACHINE = 4;
const SEED_NO_MACHINE = 23;

/** A minimal, valid item — mirrors `tests/unit/item-pool.test.ts`'s `baseItem`. */
function baseItem(id: string, overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id,
    name: id,
    description: `${id} description`,
    sprite: 'test',
    pools: ['boss'],
    quality: 0,
    promilleRequirement: 'any',
    hooks: { modifyStats: () => [{ stat: 'stammwuerze', op: 'add', value: 1 }] },
    ...overrides,
  };
}

/** A pure active item — no `modifyStats` at all, eligible only through its cooldown (#238). */
function activeItem(id: string, maxCharge: number): ItemDefinition {
  return baseItem(id, { active: { maxCharge }, hooks: {} });
}

const PEDESTAL_X = 160;
const PEDESTAL_Y = 90;

/** A `1x1` boss room, one live enemy, and an authored reward pedestal the Losbrunnen anchors off of. */
function bossRoom(id = 'test-machine-boss-room'): SingleCellRoomTemplate {
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
    decorativeProps: [{ x: PEDESTAL_X, y: PEDESTAL_Y, type: 'pedestal' }],
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

/** A bare, otherwise-empty room to transition through — see `revisits the boss room`. */
function plainRoom(id: string): SingleCellRoomTemplate {
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
    decorativeProps: [],
    metadata: {
      floorTags: ['test'],
      shape: '1x1',
      doors: { north: false, east: false, south: false, west: false },
      difficultyTier: 1,
      weight: 1,
    },
  };
}

const SHOP_LOSBRUNNEN_X = 200;
const SHOP_LOSBRUNNEN_Y = 100;

/** A `1x1` shop room, no enemies, with an authored `losbrunnen` anchor (#238) — the machine's second home. */
function shopRoom(id = 'test-machine-shop-room'): SingleCellRoomTemplate {
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
    decorativeProps: [{ x: SHOP_LOSBRUNNEN_X, y: SHOP_LOSBRUNNEN_Y, type: 'losbrunnen' }],
    metadata: {
      floorTags: ['test'],
      shape: '1x1',
      doors: { north: false, east: false, south: false, west: false },
      difficultyTier: 1,
      weight: 1,
      specialRole: 'shop',
    },
  };
}

function killBoss(sim: GameSim): void {
  let enemyIndex = -1;
  sim.world.forEach(sim.enemyMask, (index) => {
    enemyIndex = index;
  });
  sim.kill(enemyIndex);
  sim.world.flush();
  // The reward flush (`pendingBossLosbrunnen` -> `machineRuntime`) happens
  // inside `step`'s room-clear check, not at `kill` itself.
  sim.step(IDLE);
  // The kill's own hitstop (`pedestal.test.ts`'s `runOutHitstop`, same
  // reason) can still be running — drained here so every test built on this
  // helper starts from a clean, unfrozen tick rather than one whose fuse/
  // cooldown counters are silently not advancing yet.
  while (sim.frozen) {
    sim.step(IDLE);
  }
}

function placePlayer(sim: GameSim, x: number, y: number): void {
  const base = sim.playerIndex * 4;
  sim.transform.data[base] = x;
  sim.transform.data[base + 1] = y;
  sim.transform.data[base + 2] = x;
  sim.transform.data[base + 3] = y;
}

function standAtMachine(sim: GameSim): void {
  const machine = sim.activeMachine;
  if (machine === null) {
    throw new Error('test expected a spawned Losbrunnen');
  }
  placePlayer(sim, machine.x, machine.y);
}

function pressUse(): typeof IDLE {
  const frame = createInputFrame();
  setActionDown(frame, InputAction.Use, true);
  return frame;
}

function tapMove(direction: 1 | -1): typeof IDLE {
  const frame = createInputFrame();
  frame.moveX = direction * 100;
  return frame;
}

function moveRight(): typeof IDLE {
  const frame = createInputFrame();
  frame.moveX = 100;
  return frame;
}

function playerPosition(sim: GameSim): { readonly x: number; readonly y: number } {
  const base = sim.playerIndex * 4;
  return { x: sim.transform.data[base] ?? 0, y: sim.transform.data[base + 1] ?? 0 };
}

/** How many idle ticks `sim`'s own tuning gives the picker's anticipation beat — see `GameSim.startMachineRoll`. */
function machineRollTicks(sim: GameSim): number {
  return Math.max(1, Math.round(sim.tuning.machine.rollAnimationTicks));
}

/** Runs the `'rolling'` anticipation beat to completion. After this, the machine is either broken or sitting in `'choosing'` — see `GameSim.resolveMachineRoll`. */
function runRollAnimation(sim: GameSim): void {
  for (let tick = 0; tick < machineRollTicks(sim); tick++) {
    sim.step(IDLE);
  }
}

/** Confirms whichever result is currently selected on the results board (`GameSim.confirmMachineRollChoice`). */
function confirmRoll(sim: GameSim): void {
  sim.step(pressUse());
  sim.step(IDLE);
}

/**
 * Feeds a fresh machine (open, then lock-and-roll) or starts another reroll
 * on an already-fed one (roll outright), runs the anticipation beat to
 * completion, and confirms the first result offered — a break pre-empts the
 * results board entirely, so this simply stops there instead. The redesigned
 * multi-tick counterpart of the old two/three-press `feed` this file's own
 * describe blocks used to define locally before the picker grew a rolling
 * beat and a results board in between.
 */
function feed(sim: GameSim): void {
  const machine = sim.activeMachine;
  if (machine !== null && machine.itemIndex < 0) {
    sim.step(pressUse()); // opens the picker
    sim.step(IDLE);
  }
  sim.step(pressUse()); // locks the item (if just opened) or starts a reroll
  sim.step(IDLE);
  runRollAnimation(sim);
  if (sim.activeMachine?.broken === true) {
    return;
  }
  confirmRoll(sim);
}

/** Boots a sim on `seed`, in a boss room, with the boss already dead. */
function simWithDeadBoss(items: readonly ItemDefinition[], seed = SEED_SPAWNS_MACHINE): GameSim {
  const sim = new GameSim({ seed, roomTemplate: bossRoom(), floor: 1, population: 'empty', items });
  killBoss(sim);
  return sim;
}

describe('Der Losbrunnen — spawn (#218)', () => {
  it('does not exist while the boss is still alive', () => {
    const sim = new GameSim({
      seed: SEED_SPAWNS_MACHINE,
      roomTemplate: bossRoom(),
      floor: 1,
      population: 'empty',
      items: [baseItem('a')],
    });
    expect(sim.activeMachine).toBeNull();
  });

  it('spawns near the boss room reward pedestal once the boss dies, on a seed that rolls it', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    expect(sim.activeMachine).not.toBeNull();
    expect(sim.activeMachine?.itemIndex).toBe(-1);
    expect(sim.activeMachine?.broken).toBe(false);
    // Anchored off, not on top of, the reward pedestal.
    const machine = sim.activeMachine;
    if (machine === null) throw new Error('unreachable');
    expect(Math.hypot(machine.x - PEDESTAL_X, machine.y - PEDESTAL_Y)).toBeGreaterThan(0);
  });

  it('never spawns on a floor that rolled against it', () => {
    const sim = simWithDeadBoss([baseItem('a')], SEED_NO_MACHINE);
    expect(sim.activeMachine).toBeNull();
  });

  it('is invisible to machinePreview/isNearMachine while out of range', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    placePlayer(sim, 0, 0);
    expect(sim.isNearMachine()).toBe(false);
    expect(sim.machinePreview).toBeNull();
  });
});

describe('Der Losbrunnen — picker and feed, use-button only (#218)', () => {
  it('a fresh machine needs one use to open the picker, a second to feed', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    standAtMachine(sim);

    expect(sim.machinePreview?.state).toBe('unfed');
    expect(sim.machinePreview?.pickerOpen).toBe(false);

    sim.step(pressUse());
    expect(sim.machinePreview?.state).toBe('unfed');
    expect(sim.machinePreview?.pickerOpen).toBe(true);
    expect(sim.machinePreview?.itemName).toBe('a');
    expect(sim.activeMachine?.itemIndex).toBe(-1); // still not fed

    sim.step(IDLE); // release use
    sim.step(pressUse());
    expect(sim.machinePreview?.state).toBe('fed');
    expect(sim.activeMachine?.itemIndex).toBe(sim.items.indexOf('a'));
  });

  it('spends Biermarken exactly on the confirming press, never on opening the picker', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    standAtMachine(sim);

    sim.step(pressUse());
    expect(sim.biermarken).toBe(10);
    sim.step(IDLE);
    sim.step(pressUse());
    expect(sim.biermarken).toBe(9);
  });

  it('refuses to open the picker (and spends nothing) when the player cannot afford it', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    standAtMachine(sim);
    expect(sim.biermarken).toBe(0);

    sim.step(pressUse());
    // `machinePreview` never opens the picker for a press that could not
    // possibly complete a feed.
    expect(sim.activeMachine?.itemIndex).toBe(-1);
  });

  it('does nothing when nothing held is eligible (no modifyStats hook)', () => {
    const sim = simWithDeadBoss([baseItem('a', { hooks: {} })]);
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    standAtMachine(sim);
    expect(sim.machinePreview?.state).toBe('empty');
    sim.step(pressUse());
    expect(sim.activeMachine?.itemIndex).toBe(-1);
  });

  it('cycles the preview on a move-axis tap while the picker is open, not while closed', () => {
    const sim = simWithDeadBoss([baseItem('a'), baseItem('b')]);
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    sim.pickUpItem('b');
    standAtMachine(sim);

    // A tap before the picker is even open does nothing.
    sim.step(tapMove(1));
    expect(sim.machinePreview?.pickerOpen).toBe(false);

    sim.step(pressUse());
    const first = sim.machinePreview?.itemName;
    sim.step(IDLE); // release use, and let the axis return to centre
    sim.step(tapMove(1));
    const second = sim.machinePreview?.itemName;
    expect(second).not.toBe(first);

    // Holding the same direction does not spin past the second item.
    sim.step(tapMove(1));
    expect(sim.machinePreview?.itemName).toBe(second);
  });

  it('feeding closes the picker, and confirms whichever item was last previewed', () => {
    const sim = simWithDeadBoss([baseItem('a'), baseItem('b')]);
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    sim.pickUpItem('b');
    standAtMachine(sim);

    sim.step(pressUse());
    sim.step(IDLE);
    sim.step(tapMove(1));
    const chosen = sim.machinePreview?.itemName;
    sim.step(IDLE);
    sim.step(pressUse());

    expect(sim.machinePreview?.pickerOpen).toBe(false);
    expect(sim.machinePreview?.state).toBe('fed');
    expect(sim.items.at(sim.activeMachine?.itemIndex ?? -1).id).toBe(
      sim.items.at(sim.items.indexOf(chosen === 'a' ? 'a' : 'b')).id,
    );
    expect(sim.machinePreview?.itemName).toBe(chosen);
  });
});

describe('Der Losbrunnen — rolls and cost (#218)', () => {
  it('registers a delta under item-roll:<id>, on top of (not replacing) the item’s own contribution', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.tuning.machine.breakChance = 0;
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    standAtMachine(sim);

    const before = sim.stats.value(StatId.Stammwuerze);
    feed(sim);
    const after = sim.stats.value(StatId.Stammwuerze);
    expect(after).not.toBe(before);
    expect(sim.machinePreview?.lastRollSummary).toBeDefined();
  });

  it('the reroll cost increases each time, by tuning.machine.costIncrement', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.tuning.machine.breakChance = 0;
    sim.tuning.machine.breakChanceIncrement = 0;
    sim.addBiermarken(50);
    sim.pickUpItem('a');
    standAtMachine(sim);

    feed(sim);
    expect(sim.machinePreview?.cost).toBe(
      sim.tuning.machine.baseCost + sim.tuning.machine.costIncrement,
    );
    feed(sim); // second roll
    expect(sim.machinePreview?.cost).toBe(
      sim.tuning.machine.baseCost + 2 * sim.tuning.machine.costIncrement,
    );
  });

  it('a forced break stops any further roll, and is visible through machinePreview', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.tuning.machine.breakChance = 1;
    sim.addBiermarken(50);
    sim.pickUpItem('a');
    standAtMachine(sim);

    feed(sim);
    expect(sim.activeMachine?.broken).toBe(true);
    expect(sim.machinePreview?.state).toBe('broken');

    const spentBefore = sim.biermarken;
    sim.step(IDLE);
    sim.step(pressUse());
    expect(sim.biermarken).toBe(spentBefore); // no-op: nothing spent on a broken machine
  });

  it('is deterministic: the same seed and the same presses land the same roll', () => {
    const run = (): number => {
      const sim = simWithDeadBoss([baseItem('a')]);
      sim.addBiermarken(10);
      sim.pickUpItem('a');
      standAtMachine(sim);
      feed(sim);
      return sim.stats.value(StatId.Stammwuerze);
    };
    expect(run()).toBe(run());
  });

  it('losing the last copy of the fed item clears its roll source', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.tuning.machine.breakChance = 0;
    const withoutItem = sim.stats.value(StatId.Stammwuerze);
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    const withItemNoRoll = sim.stats.value(StatId.Stammwuerze);
    expect(withItemNoRoll).toBe(withoutItem + 1); // sanity: the item's own flat +1

    standAtMachine(sim);
    feed(sim);

    const withRoll = sim.stats.value(StatId.Stammwuerze);
    expect(withRoll).not.toBe(withItemNoRoll); // the roll actually changed something
    sim.removeItem('a');
    expect(sim.stats.value(StatId.Stammwuerze)).toBe(withoutItem); // roll source cleared too, not just the item's own
    // Picking it back up folds only its own honest `modifyStats` source —
    // the roll is gone, not silently reapplied.
    sim.pickUpItem('a');
    expect(sim.stats.value(StatId.Stammwuerze)).toBe(withItemNoRoll);
  });
});

describe('Der Losbrunnen — destruction (#218)', () => {
  it('a Bierfassl detonated nearby breaks it, whether or not it has been fed', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    const machine = sim.activeMachine;
    if (machine === null) throw new Error('unreachable');

    sim.spawnBierfassl(machine.x + 4, machine.y, 0, 0, false);
    sim.world.flush();
    const fuseTicks = Math.round(sim.tuning.pickup.bombFuseTicks);
    for (let tick = 0; tick <= fuseTicks; tick++) {
      sim.step(IDLE);
    }

    expect(sim.activeMachine?.broken).toBe(true);
  });

  it('a Bierfassl detonated far away leaves it untouched', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.spawnBierfassl(0, 0, 0, 0, false);
    sim.world.flush();
    const fuseTicks = Math.round(sim.tuning.pickup.bombFuseTicks);
    for (let tick = 0; tick <= fuseTicks; tick++) {
      sim.step(IDLE);
    }
    expect(sim.activeMachine?.broken).toBe(false);
  });
});

describe('Der Losbrunnen — persists across a room revisit (#218)', () => {
  it('keeps its locked item, roll count and broken flag when the boss room is left and re-entered', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    standAtMachine(sim);
    sim.step(pressUse());
    sim.step(IDLE);
    sim.step(pressUse());
    sim.step(IDLE);
    runRollAnimation(sim);

    const rollsBefore = sim.activeMachine?.rolls;
    const itemBefore = sim.activeMachine?.itemIndex;
    expect(rollsBefore).toBe(1);

    sim.loadRoom(plainRoom('test-machine-elsewhere'), 1);
    expect(sim.activeMachine).toBeNull(); // a different room has no machine of its own

    sim.loadRoom(bossRoom(), 1); // same id as the original boss room -> restores its snapshot
    expect(sim.activeMachine?.itemIndex).toBe(itemBefore);
    expect(sim.activeMachine?.rolls).toBe(rollsBefore);
  });
});

describe('Der Losbrunnen — a shop is the machine’s second home (#238)', () => {
  it('spawns immediately in a shop, with no boss fight to wait for', () => {
    const sim = new GameSim({
      seed: SEED_SPAWNS_MACHINE,
      roomTemplate: shopRoom(),
      floor: 1,
      population: 'empty',
      items: [baseItem('a')],
    });
    expect(sim.activeMachine).not.toBeNull();
    expect(sim.activeMachine?.itemIndex).toBe(-1);
    expect(sim.activeMachine?.broken).toBe(false);
  });

  it('never spawns in a shop on a floor that rolled against it', () => {
    const sim = new GameSim({
      seed: SEED_NO_MACHINE,
      roomTemplate: shopRoom(),
      floor: 1,
      population: 'empty',
      items: [baseItem('a')],
    });
    expect(sim.activeMachine).toBeNull();
  });

  it("a shop visited first claims the floor's one Losbrunnen, so the boss room gets none", () => {
    const sim = new GameSim({
      seed: SEED_SPAWNS_MACHINE,
      roomTemplate: shopRoom(),
      floor: 1,
      population: 'empty',
      items: [baseItem('a')],
    });
    expect(sim.activeMachine).not.toBeNull();

    sim.loadRoom(bossRoom(), 1);
    killBoss(sim);
    expect(sim.activeMachine).toBeNull();
  });

  it('a boss room reached first claims it, so a shop visited afterward gets none', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    expect(sim.activeMachine).not.toBeNull();

    sim.loadRoom(shopRoom(), 1);
    expect(sim.activeMachine).toBeNull();
  });
});

describe('Der Losbrunnen — break risk climbs and is shown before the pull (#238)', () => {
  it('machinePreview.breakChance is the base chance on a fresh machine', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.tuning.machine.breakChance = 0.2;
    sim.addBiermarken(50);
    sim.pickUpItem('a');
    standAtMachine(sim);

    sim.step(pressUse()); // opens the picker, nothing rolled yet
    expect(sim.machinePreview?.breakChance).toBeCloseTo(0.2);
  });

  it('breakChance climbs by breakChanceIncrement for every roll already made', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.tuning.machine.breakChance = 0;
    sim.tuning.machine.breakChanceIncrement = 0.1;
    sim.addBiermarken(50);
    sim.pickUpItem('a');
    standAtMachine(sim);

    // A fresh machine's first roll is guaranteed safe (0 rolls made yet,
    // breakChance still 0), so this stays deterministic without touching RNG.
    sim.step(pressUse());
    sim.step(IDLE);
    sim.step(pressUse());
    sim.step(IDLE);
    runRollAnimation(sim);
    expect(sim.activeMachine?.broken).toBe(false);
    expect(sim.activeMachine?.rolls).toBe(1);
    expect(sim.machinePreview?.breakChance).toBeCloseTo(0.1);
  });

  it('is invisible (0) on a machine with nothing to roll', () => {
    const sim = simWithDeadBoss([baseItem('a', { hooks: {} })]);
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    standAtMachine(sim);
    expect(sim.machinePreview?.breakChance).toBe(0);
  });
});

describe('Der Losbrunnen — active items can reroll too (#238)', () => {
  it('a pure active item (no modifyStats) is eligible and reachable through the picker', () => {
    const sim = simWithDeadBoss([activeItem('boiler', 300)]);
    sim.addBiermarken(10);
    sim.pickUpItem('boiler');
    standAtMachine(sim);

    expect(sim.machinePreview?.state).toBe('unfed');
    sim.step(pressUse());
    expect(sim.machinePreview?.pickerOpen).toBe(true);
    expect(sim.machinePreview?.itemName).toBe('boiler');
  });

  it('feeding a pure active item rolls its cooldown, changing effectiveMaxCharge', () => {
    const sim = simWithDeadBoss([activeItem('boiler', 300)]);
    sim.tuning.machine.breakChance = 0;
    sim.addBiermarken(10);
    sim.pickUpItem('boiler');
    standAtMachine(sim);

    const item = sim.items.get('boiler');
    expect(sim.effectiveMaxCharge(item)).toBe(300);

    feed(sim);

    // Only one target exists for a pure active item (`cooldown`), and every
    // tier's percent is non-zero, so this is deterministic regardless of
    // which tier the roll happened to land on.
    expect(sim.effectiveMaxCharge(item)).not.toBe(300);
    expect(sim.machinePreview?.lastRollSummary).toContain('cooldown');
  });

  it('a rolled cooldown is read by chargeActiveItem/useActiveItem, not just the authored number', () => {
    const sim = simWithDeadBoss([activeItem('boiler', 100)]);
    sim.tuning.machine.breakChance = 0;
    sim.addBiermarken(10);
    sim.pickUpItem('boiler');
    standAtMachine(sim);
    feed(sim);

    const item = sim.items.get('boiler');
    const rolledMax = sim.effectiveMaxCharge(item);
    expect(rolledMax).not.toBe(100);

    // One tick short of the *rolled*, not the authored, max: not ready yet.
    sim.chargeActiveItem('boiler', rolledMax - 1);
    expect(sim.itemState('boiler').charge).toBe(rolledMax - 1);
    expect(sim.useActiveItem('boiler')).toBe(false);

    // The last tick brings it to the rolled max, and only then is it usable.
    sim.chargeActiveItem('boiler', 1);
    expect(sim.itemState('boiler').charge).toBe(rolledMax);
    expect(sim.useActiveItem('boiler')).toBe(true);
  });

  it('losing the last copy of the active item clears its rolled cooldown', () => {
    const sim = simWithDeadBoss([activeItem('boiler', 300)]);
    sim.tuning.machine.breakChance = 0;
    sim.addBiermarken(10);
    sim.pickUpItem('boiler');
    standAtMachine(sim);
    feed(sim);

    const item = sim.items.get('boiler');
    expect(sim.effectiveMaxCharge(item)).not.toBe(300);

    sim.removeItem('boiler');
    expect(sim.effectiveMaxCharge(item)).toBe(300);
  });
});

describe('Der Losbrunnen — machineChoices lists every eligible item for the real picker menu (#238)', () => {
  it('is null before the picker is opened', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    standAtMachine(sim);
    expect(sim.machineChoices).toBeNull();
  });

  it('lists every eligible held item once the picker opens, including a pure active one', () => {
    const sim = simWithDeadBoss([baseItem('a'), activeItem('boiler', 300)]);
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    sim.pickUpItem('boiler');
    standAtMachine(sim);

    sim.step(pressUse());
    const choices = sim.machineChoices;
    expect(choices).not.toBeNull();
    expect(choices?.map((choice) => choice.id).sort()).toEqual(['a', 'boiler']);
    expect(choices?.filter((choice) => choice.selected)).toHaveLength(1);
  });

  it('is null again once the machine is fed — nothing left to choose', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    standAtMachine(sim);
    sim.step(pressUse());
    sim.step(IDLE);
    sim.step(pressUse());
    expect(sim.machineChoices).toBeNull();
  });
});

describe('Der Losbrunnen — the redesigned picker: rolling, results and choosing (#238 UX redesign)', () => {
  it('the anticipation beat holds the outcome back until it finishes', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.tuning.machine.breakChance = 0;
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    standAtMachine(sim);

    sim.step(pressUse());
    sim.step(IDLE);
    sim.step(pressUse()); // locks the item, starts rolling
    expect(sim.machineRollDisplay?.phase).toBe('rolling');
    expect(sim.activeMachine?.rolls).toBe(0);

    // One tick short of the full beat: still rolling, nothing decided yet.
    // The press's own tick already ran `advanceMachineRoll` once (`stepMachine`
    // runs every tick regardless of `use`), so only `machineRollTicks - 2`
    // more idle ticks are needed to land exactly one short of resolving.
    for (let tick = 0; tick < machineRollTicks(sim) - 2; tick++) {
      sim.step(IDLE);
    }
    expect(sim.machineRollDisplay?.phase).toBe('rolling');
    expect(sim.activeMachine?.rolls).toBe(0);

    sim.step(IDLE); // the tick the beat actually resolves on
    expect(sim.machineRollDisplay?.phase).toBe('choosing');
    expect(sim.activeMachine?.rolls).toBe(1);
  });

  it('an unlucky pull shows exactly one candidate, tagged unlucky', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.tuning.machine.breakChance = 0;
    sim.tuning.machine.commonWeight = 0;
    sim.tuning.machine.uncommonWeight = 0;
    sim.tuning.machine.rareWeight = 0;
    sim.tuning.machine.legendaryWeight = 0;
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    standAtMachine(sim);

    sim.step(pressUse());
    sim.step(IDLE);
    sim.step(pressUse());
    sim.step(IDLE);
    runRollAnimation(sim);

    const display = sim.machineRollDisplay;
    if (display?.phase !== 'choosing') throw new Error('expected a choosing phase');
    expect(display.candidates).toHaveLength(1);
    expect(display.candidates[0]?.tier).toBe('unlucky');
  });

  it('a favourable pull shows three candidates, none of them unlucky', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.tuning.machine.breakChance = 0;
    sim.tuning.machine.unluckyWeight = 0;
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    standAtMachine(sim);

    sim.step(pressUse());
    sim.step(IDLE);
    sim.step(pressUse());
    sim.step(IDLE);
    runRollAnimation(sim);

    const display = sim.machineRollDisplay;
    if (display?.phase !== 'choosing') throw new Error('expected a choosing phase');
    expect(display.candidates).toHaveLength(3);
    expect(display.candidates.some((candidate) => candidate.tier === 'unlucky')).toBe(false);
    expect(display.candidates.filter((candidate) => candidate.selected)).toHaveLength(1);
  });

  it('a machine break pre-empts the results board entirely — no candidate is ever generated', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.tuning.machine.breakChance = 1;
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    standAtMachine(sim);

    const before = sim.stats.value(StatId.Stammwuerze);
    sim.step(pressUse());
    sim.step(IDLE);
    sim.step(pressUse());
    sim.step(IDLE);
    runRollAnimation(sim);

    expect(sim.activeMachine?.broken).toBe(true);
    expect(sim.machineRollDisplay).toBeNull();
    expect(sim.stats.value(StatId.Stammwuerze)).toBe(before); // nothing was ever applied
  });

  it('move cycles the current selection among three candidates, and use confirms whichever is selected', () => {
    const sim = simWithDeadBoss([baseItem('a')]);
    sim.tuning.machine.breakChance = 0;
    sim.tuning.machine.unluckyWeight = 0;
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    standAtMachine(sim);

    sim.step(pressUse());
    sim.step(IDLE);
    sim.step(pressUse());
    sim.step(IDLE);
    runRollAnimation(sim);

    const initial = sim.machineRollDisplay;
    if (initial?.phase !== 'choosing') throw new Error('expected a choosing phase');
    expect(initial.candidates.findIndex((candidate) => candidate.selected)).toBe(0);

    sim.step(tapMove(1));
    sim.step(IDLE);
    const afterTap = sim.machineRollDisplay;
    if (afterTap?.phase !== 'choosing') throw new Error('expected a choosing phase');
    expect(afterTap.candidates.findIndex((candidate) => candidate.selected)).toBe(1);

    sim.step(pressUse()); // confirm
    sim.step(IDLE);
    expect(sim.machineRollDisplay).toBeNull();
    expect(sim.machinePreview?.state).toBe('fed');
  });

  it('freezes the player for as long as the dialog is open, in every one of its phases', () => {
    const sim = simWithDeadBoss([baseItem('a'), baseItem('b')]);
    sim.tuning.machine.breakChance = 0;
    sim.addBiermarken(10);
    sim.pickUpItem('a');
    sim.pickUpItem('b');
    standAtMachine(sim);
    const frozenAt = playerPosition(sim);

    // Item-select open.
    sim.step(pressUse());
    sim.step(moveRight());
    expect(playerPosition(sim)).toEqual(frozenAt);

    // Locks the item and starts rolling.
    sim.step(pressUse());
    sim.step(moveRight());
    expect(playerPosition(sim)).toEqual(frozenAt);
    for (let tick = 0; tick < machineRollTicks(sim); tick++) {
      sim.step(IDLE);
    }

    // Choosing among results.
    expect(sim.machineRollDisplay).not.toBeNull();
    sim.step(moveRight());
    expect(playerPosition(sim)).toEqual(frozenAt);

    // Confirms and closes — movement works again.
    sim.step(pressUse());
    sim.step(IDLE);
    sim.step(moveRight());
    expect(playerPosition(sim)).not.toEqual(frozenAt);
  });
});
