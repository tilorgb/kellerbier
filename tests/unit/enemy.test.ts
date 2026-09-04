import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { World } from '../../src/sim/ecs/world.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { EventKind } from '../../src/sim/events/queue.js';
import {
  DESTRUCTIBLE_PROP_KINDS,
  GameSim,
  MAYPOLE_HEALTH,
  MAYPOLE_MASS,
  MAYPOLE_RADIUS,
  PLAYER_RADIUS,
  type GameSimOptions,
} from '../../src/sim/game/sim.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { ParticleKind } from '../../src/sim/particle/store.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  ENEMY_STRIDE,
  enemyTelegraphProgress,
  enemyTelegraphShape,
  isEnemyInvulnerable,
  lobbedBombFlight,
  stepEnemyDeaths,
  TelegraphShape,
  type EnemyTelegraphShapeInfo,
  type LobbedBombFlight,
} from '../../src/sim/systems/enemy.js';
import { applyDamageAt } from '../../src/sim/systems/impact.js';

const IDLE = createInputFrame();

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

/**
 * A room with the training targets cleared out.
 *
 * Every test here is about one authored body, and a playground with six
 * placeholders in it measures whichever one got in the way first.
 */
function emptySim(options: GameSimOptions = {}): GameSim {
  const sim = new GameSim({ room: bareRoom(), ...options });
  const player = sim.playerIndex;
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (index) => {
    if (index !== player) {
      doomed.push(index);
    }
  });
  for (const index of doomed) {
    sim.world.destroy(sim.world.entityAt(index));
  }
  sim.world.flush();
  return sim;
}

/** Puts one authored enemy in the room and returns its storage slot. */
function place(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function aiming(aimX: number, aimY: number): InputFrame {
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(aimX);
  frame.aimY = quantiseAxis(aimY);
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

function health(sim: GameSim, index: number): number {
  return sim.health.data[index * 2] ?? 0;
}

function distance(sim: GameSim, a: number, b: number): number {
  return Math.hypot(sim.positionX(a) - sim.positionX(b), sim.positionY(a) - sim.positionY(b));
}

/** The name of the state a body is in, which is what content calls it. */
function stateName(sim: GameSim, index: number): string {
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  return compiled.states[sim.enemy.data[base + 1] ?? 0]?.name ?? '';
}

/** Fires at an enemy to the player's right until a shot lands. */
function landShot(sim: GameSim): void {
  for (let tick = 0; tick < 120; tick++) {
    sim.step(aiming(1, 0));
    let landed = 0;
    sim.events.forEach((slot) => {
      if (sim.events.kind[slot] === EventKind.ProjectileHit) {
        landed += 1;
      }
    });
    if (landed > 0) {
      return;
    }
  }
  throw new Error('no shot landed');
}

function liveEnemies(sim: GameSim, id: string): number {
  const definition = sim.enemies.indexOf(id);
  let found = 0;
  for (let index = 0; index < sim.world.highWater; index++) {
    if (sim.world.states[index] !== World.ALIVE) {
      continue;
    }
    if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
      continue;
    }
    if ((sim.enemy.data[index * ENEMY_STRIDE] ?? -1) === definition) {
      found += 1;
    }
  }
  return found;
}

/** The storage slot of the first live body of `id`, or -1 if none. */
function findEnemyIndex(sim: GameSim, id: string): number {
  const definition = sim.enemies.indexOf(id);
  for (let index = 0; index < sim.world.highWater; index++) {
    if (sim.world.states[index] !== World.ALIVE) {
      continue;
    }
    if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
      continue;
    }
    if ((sim.enemy.data[index * ENEMY_STRIDE] ?? -1) === definition) {
      return index;
    }
  }
  return -1;
}

function enemyProjectiles(sim: GameSim): number {
  let count = 0;
  sim.projectiles.forEachLive(() => {
    count += 1;
  });
  return count;
}

describe('authored behaviour', () => {
  it('walks a Kellerassel at the player', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'kellerassel', sim.positionX(player) + 70, sim.positionY(player));

    const before = distance(sim, player, enemy);
    for (let tick = 0; tick < 60; tick++) {
      sim.step(IDLE);
    }
    expect(distance(sim, player, enemy)).toBeLessThan(before - 20);
  });

  it('curls the Kellerassel when it is hit, and nothing gets through the shell', () => {
    const sim = emptySim();
    const enemy = place(
      sim,
      'kellerassel',
      sim.positionX(sim.playerIndex) + 40,
      sim.positionY(sim.playerIndex),
    );

    landShot(sim);
    // The hit is read on the tick after it lands — impact runs after the enemy
    // system — and the local stagger the hit asked for (`GameSim.hitStun`)
    // sits in between, during which this body decides nothing. A handful of
    // ticks covers both.
    for (let tick = 0; tick < 10 && stateName(sim, enemy) !== 'curl'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('curl');
    expect(isEnemyInvulnerable(sim, enemy)).toBe(true);

    const remaining = health(sim, enemy);
    for (let tick = 0; tick < 30; tick++) {
      sim.step(aiming(1, 0));
      if (isEnemyInvulnerable(sim, enemy)) {
        // Shots land on it and do nothing at all, which is the lesson.
        expect(health(sim, enemy)).toBe(remaining);
      }
    }
  });

  it('always opens the shell again, however much is fired into it', () => {
    const sim = emptySim();
    const enemy = place(
      sim,
      'kellerassel',
      sim.positionX(sim.playerIndex) + 40,
      sim.positionY(sim.playerIndex),
    );

    landShot(sim);
    let opened = false;
    for (let tick = 0; tick < 120; tick++) {
      sim.step(aiming(1, 0));
      if (!isEnemyInvulnerable(sim, enemy) && stateName(sim, enemy) === 'crawl') {
        opened = true;
        break;
      }
    }
    // Being shot while curled must not renew the window: the invulnerability is
    // counted from the tick the state began, and only `crawl` listens for hits.
    expect(opened).toBe(true);
  });

  it('warns before the Zapfhahn sprays, and the warning is readable the whole way', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'zapfhahn', sim.positionX(player) + 60, sim.positionY(player));

    let peak = 0;
    let firstShotTick = -1;
    for (let tick = 0; tick < 200 && firstShotTick < 0; tick++) {
      sim.step(IDLE);
      peak = Math.max(peak, enemyTelegraphProgress(sim, enemy));
      if (enemyProjectiles(sim) > 0) {
        firstShotTick = tick;
      }
    }

    expect(firstShotTick).toBeGreaterThan(0);
    // The ring reaches its full size, and it does so before anything is in the
    // air. A telegraph that finishes after the attack lands is worse than none.
    expect(peak).toBeGreaterThan(0.95);
    expect(stateName(sim, enemy)).not.toBe('idle');
  });

  it('stretches the wind-up along with the ring when telegraphs are lengthened', () => {
    const firstShot = (telegraphScale: number): number => {
      const sim = emptySim();
      sim.tuning.enemy.telegraphScale = telegraphScale;
      const player = sim.playerIndex;
      place(sim, 'zapfhahn', sim.positionX(player) + 60, sim.positionY(player));
      for (let tick = 0; tick < 400; tick++) {
        sim.step(IDLE);
        if (enemyProjectiles(sim) > 0) {
          return tick;
        }
      }
      throw new Error('the tap never fired');
    };

    // The accessibility direction: more warning, and the attack waits for it.
    expect(firstShot(2)).toBeGreaterThan(firstShot(1));
  });

  it('leaves spores where a Schimmelfleck died, and they stay dead', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    place(sim, 'schimmelfleck', sim.positionX(player) + 40, sim.positionY(player));
    expect(liveEnemies(sim, 'schimmelspore')).toBe(0);

    for (let tick = 0; tick < 400 && liveEnemies(sim, 'schimmelfleck') > 0; tick++) {
      sim.step(aiming(1, 0));
    }
    expect(liveEnemies(sim, 'schimmelfleck')).toBe(0);
    // Declared on the state it died in, which is the machinery a boss phase
    // needs — and the count is the count the content asked for.
    expect(liveEnemies(sim, 'schimmelspore')).toBe(2);

    for (let tick = 0; tick < 600 && liveEnemies(sim, 'schimmelspore') > 0; tick++) {
      sim.step(aiming(1, 0));
    }
    // Nothing put them there, so nothing brings them back.
    for (let tick = 0; tick < 200; tick++) {
      sim.step(IDLE);
    }
    expect(liveEnemies(sim, 'schimmelspore')).toBe(0);
  });

  it('runs the same way twice from the same seed', () => {
    const trace = (seed: number): string => {
      const sim = new GameSim({ seed, population: 'enemies' });
      const parts: string[] = [];
      for (let tick = 0; tick < 400; tick++) {
        sim.step(IDLE);
      }
      for (let index = 0; index < sim.world.highWater; index++) {
        if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
          continue;
        }
        parts.push(sim.positionX(index).toFixed(4), sim.positionY(index).toFixed(4));
      }
      return parts.join(',');
    };

    expect(trace(7)).toBe(trace(7));
    // And the wandering ones are actually drawing from the seed rather than
    // running the same path whatever it is.
    expect(trace(7)).not.toBe(trace(8));
  });

  it('scales the whole roster with one speed number', () => {
    const travelled = (speedScale: number): number => {
      const sim = emptySim();
      sim.tuning.enemy.speedScale = speedScale;
      const player = sim.playerIndex;
      const enemy = place(sim, 'kellerassel', sim.positionX(player) + 80, sim.positionY(player));
      const before = sim.positionX(enemy);
      for (let tick = 0; tick < 60; tick++) {
        sim.step(IDLE);
      }
      return before - sim.positionX(enemy);
    };

    expect(travelled(2)).toBeGreaterThan(travelled(1) * 1.5);
  });
});

describe('Große Kellerassel boss (#36 follow-up)', () => {
  it('reaches spit even under continuous fire, instead of curling forever', () => {
    // The bug: `onHit` re-curled it from `crawl` every single time, and a
    // player holding the trigger down lands a hit within a tick or two of
    // every window the boss is vulnerable — so `crawl`'s own wind-up timer
    // could never accumulate enough ticks to reach `wind`/`spit` at all.
    const sim = emptySim();
    const player = sim.playerIndex;
    const enemy = place(
      sim,
      'grosse-kellerassel',
      sim.positionX(player) + 40,
      sim.positionY(player),
    );

    let reachedSpit = false;
    let reachedCurl = false;
    for (let tick = 0; tick < 500 && !reachedSpit; tick++) {
      sim.step(aiming(1, 0));
      const state = stateName(sim, enemy);
      reachedCurl ||= state === 'curl';
      reachedSpit = state === 'spit';
    }

    // Curling is still the fight's identity — a hit still curls it — but it
    // no longer traps the boss forever: `spit` gets a turn regardless.
    expect(reachedCurl).toBe(true);
    expect(reachedSpit).toBe(true);
  });

  it('does not re-curl while advancing after a curl — only `crawl` listens for a hit', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const enemy = place(
      sim,
      'grosse-kellerassel',
      sim.positionX(player) + 40,
      sim.positionY(player),
    );

    landShot(sim);
    for (let tick = 0; tick < 10 && stateName(sim, enemy) !== 'curl'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('curl');

    // Ride out the curl into `advance`, still firing continuously.
    for (let tick = 0; tick < 60 && stateName(sim, enemy) === 'curl'; tick++) {
      sim.step(aiming(1, 0));
    }
    expect(stateName(sim, enemy)).toBe('advance');

    // Kept firing all the way through it — `advance` has no `onHit`
    // transition, so it never bounces back to `curl`.
    for (let tick = 0; tick < 150 && stateName(sim, enemy) === 'advance'; tick++) {
      sim.step(aiming(1, 0));
      expect(stateName(sim, enemy)).not.toBe('curl');
    }
  });
});

describe('Der Stier boss (#38)', () => {
  it('charges into a wall and comes out stunned, then charges again', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'der-stier', sim.positionX(player) + 60, sim.positionY(player));

    let reachedCharge = false;
    let reachedStunned = false;
    for (let tick = 0; tick < 300 && !reachedStunned; tick++) {
      sim.step(IDLE);
      const state = stateName(sim, enemy);
      reachedCharge ||= state === 'charge';
      reachedStunned = state === 'stunned';
    }
    expect(reachedCharge).toBe(true);
    expect(reachedStunned).toBe(true);

    // The loop closes: stunned lets go back into approach/telegraph/charge
    // rather than stalling once the first charge is spent.
    let reachedApproachAgain = false;
    for (let tick = 0; tick < 80 && !reachedApproachAgain; tick++) {
      sim.step(IDLE);
      reachedApproachAgain = stateName(sim, enemy) === 'approach';
    }
    expect(reachedApproachAgain).toBe(true);
  });

  it('splits into the dismounted Maibaum-Dieb only on the real killing blow (#199)', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'der-stier', sim.positionX(player) + 200, sim.positionY(player));

    // 60 -> 1: well past the old half-health gate, still no split.
    applyDamageAt(sim, enemy, 59, sim.positionX(enemy), sim.positionY(enemy), 0, 0, -1);
    stepEnemyDeaths(sim);
    sim.world.flush();
    expect(liveEnemies(sim, 'der-stier')).toBe(1);
    expect(liveEnemies(sim, 'der-stier-maibaum-dieb')).toBe(0);

    // The last hit: Der Stier dies, the dieb spawns with his own fresh pool —
    // the same call + death sweep the impact system runs on a landed shot.
    // (No maypole in this bare test room, so #260's `healthWithoutProp`
    // applies — the dieb's pool here is the disarmed one, not the armed
    // `maibaumDieb.health`; only the split itself is under test.)
    applyDamageAt(sim, enemy, 1, sim.positionX(enemy), sim.positionY(enemy), 0, 0, -1);
    stepEnemyDeaths(sim);
    sim.world.flush();
    expect(liveEnemies(sim, 'der-stier')).toBe(0);
    expect(liveEnemies(sim, 'der-stier-maibaum-dieb')).toBe(1);
  });

  it('spawns the dieb weaker when no live maypole remains at the moment Der Stier dies (#260)', () => {
    // Structural, not numeric — the exact pools are content's own numbers
    // (`content/enemies/der-stier.ts`), this only asserts the split reads
    // the room correctly at the instant it fires. One sim with no maypole
    // in the room, one with a live one, both bare otherwise.
    const disarmed = emptySim();
    const disarmedStier = place(
      disarmed,
      'der-stier',
      disarmed.positionX(disarmed.playerIndex) + 200,
      disarmed.positionY(disarmed.playerIndex),
    );
    const disarmedMax = disarmed.health.data[disarmedStier * 2 + 1] ?? 0;
    applyDamageAt(
      disarmed,
      disarmedStier,
      disarmedMax,
      disarmed.positionX(disarmedStier),
      disarmed.positionY(disarmedStier),
      0,
      0,
      -1,
    );
    stepEnemyDeaths(disarmed);
    disarmed.world.flush();
    const disarmedDieb = findEnemyIndex(disarmed, 'der-stier-maibaum-dieb');
    expect(disarmedDieb).toBeGreaterThanOrEqual(0);
    const disarmedHealth = health(disarmed, disarmedDieb);

    const armed = emptySim();
    const stierX = armed.positionX(armed.playerIndex) + 200;
    const stierY = armed.positionY(armed.playerIndex);
    // A live maypole sitting right where Der Stier is about to die.
    armed.spawnTarget(
      stierX,
      stierY,
      MAYPOLE_RADIUS,
      DESTRUCTIBLE_PROP_KINDS.indexOf('maypole'),
      MAYPOLE_HEALTH,
      MAYPOLE_MASS,
    );
    armed.world.flush();
    const armedStier = place(armed, 'der-stier', stierX, stierY);
    const armedMax = armed.health.data[armedStier * 2 + 1] ?? 0;
    applyDamageAt(armed, armedStier, armedMax, stierX, stierY, 0, 0, -1);
    stepEnemyDeaths(armed);
    armed.world.flush();
    const armedDieb = findEnemyIndex(armed, 'der-stier-maibaum-dieb');
    expect(armedDieb).toBeGreaterThanOrEqual(0);
    const armedHealth = health(armed, armedDieb);

    expect(armedHealth).toBeGreaterThan(disarmedHealth);
  });

  it('armed branch: the dieb walks to a standing maypole, grabs it, then swings (#199)', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const px = sim.positionX(player);
    const py = sim.positionY(player);
    // A maypole between the dieb and the player, so `approachProp` heads for it.
    // Prop kind 1 is `maypole` (`DESTRUCTIBLE_PROP_KINDS`).
    sim.spawnTarget(px + 40, py, 6, 1, 7);
    sim.world.flush();
    const dieb = place(sim, 'der-stier-maibaum-dieb', px + 90, py);

    let reachedGrab = false;
    let reachedSwing = false;
    const seen = new Set<string>();
    for (let tick = 0; tick < 400 && !reachedSwing; tick++) {
      sim.step(IDLE);
      const state = stateName(sim, dieb);
      seen.add(state);
      reachedGrab ||= state === 'grab';
      reachedSwing ||= state === 'swing';
    }
    expect(reachedGrab, `states seen: ${[...seen].join(', ')}`).toBe(true);
    expect(reachedSwing).toBe(true);
    expect(sim.maypoleStolen).toBe(true);
  });

  it('the swipe is a swept blade: it hits when it passes the player, not on contact (#199)', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const px = sim.positionX(player);
    const py = sim.positionY(player);
    sim.spawnTarget(px + 30, py, 6, 1, 7);
    sim.world.flush();
    const dieb = place(sim, 'der-stier-maibaum-dieb', px + 55, py);

    let hpBeforeSwing = -1;
    let hurtDuringSwing = false;
    let hurtWhileNotSwinging = false;
    for (let tick = 0; tick < 500; tick++) {
      const before = sim.playerHealth;
      sim.step(IDLE);
      const state = stateName(sim, dieb);
      if (state === 'swing' && hpBeforeSwing < 0) hpBeforeSwing = before;
      const tookDamage = sim.playerHealth < before;
      if (state === 'swing') hurtDuringSwing ||= tookDamage;
      else if (state !== 'grab' && sim.maypoleStolen) hurtWhileNotSwinging ||= tookDamage;
      if (hurtDuringSwing) break;
    }
    // The armed dieb stands right next to the player between swings holding the
    // pole; that must never chip the health bar — only the swing itself does.
    expect(hurtWhileNotSwinging).toBe(false);
    expect(hurtDuringSwing).toBe(true);
  });

  it('the arena maypole does not move when shot or bumped, only takes damage (#199)', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const px = sim.positionX(player) + 40;
    const py = sim.positionY(player);
    // Spawn the way `applyCompiledRoom` does for a boss-room maypole.
    const pole = entityIndex(
      sim.spawnTarget(px, py, MAYPOLE_RADIUS, 1, MAYPOLE_HEALTH, MAYPOLE_MASS),
    );
    sim.world.flush();

    applyDamageAt(sim, pole, 2, sim.positionX(pole), sim.positionY(pole), 1, 0, -1);
    for (let t = 0; t < 30; t++) sim.step(IDLE);

    expect(sim.positionX(pole)).toBeCloseTo(px, 1);
    expect(sim.positionY(pole)).toBeCloseTo(py, 1);
    expect(sim.health.data[pole * 2]).toBe(MAYPOLE_HEALTH - 2);
  });

  it('disarmed branch: no maypole, the dieb dashes like Der Stier (#199)', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const dieb = place(
      sim,
      'der-stier-maibaum-dieb',
      sim.positionX(player) + 60,
      sim.positionY(player),
    );

    let reachedDash = false;
    let reachedSwing = false;
    for (let tick = 0; tick < 400 && !reachedDash; tick++) {
      sim.step(IDLE);
      const state = stateName(sim, dieb);
      reachedDash ||= state === 'dash';
      reachedSwing ||= state === 'swing';
    }
    expect(reachedDash).toBe(true);
    expect(reachedSwing).toBe(false);
    expect(sim.maypoleStolen).toBe(false);
  });
});

/**
 * Primitives the shipped roster does not use yet.
 *
 * Written as content in the test rather than added to the game, which is the
 * claim #14 is making: an enemy is data, and data can come from anywhere.
 */
describe('primitives, authored as data', () => {
  const charger: EnemyDefinition = {
    id: 'stier',
    name: 'Stier',
    size: 'mid',
    health: 6,
    contactDamage: 2,
    initial: 'wind',
    states: [
      {
        name: 'wind',
        behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 12 }],
        transitions: [{ to: 'charge', after: 12 }],
      },
      {
        name: 'charge',
        behaviours: [{ behaviour: 'chargeAtPlayer', speed: 3 }],
        transitions: [{ to: 'winded', onBlocked: true }],
      },
      { name: 'winded', behaviours: [{ behaviour: 'pause' }] },
    ],
  };

  /** A room with a pillar between the two of them, for the charge to hit. */
  function walledRoom(): RoomGeometry {
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addBlock(120, 60, 140, 120);
    return room;
  }

  it('ends a charge against a wall rather than grinding along it', () => {
    const sim = emptySim({ room: walledRoom(), enemies: [charger] });
    const player = sim.playerIndex;
    // The player on one side of the pillar, the bull on the other.
    const transform = sim.transform.data;
    transform[player * 4] = 60;
    transform[player * 4 + 1] = 90;
    transform[player * 4 + 2] = 60;
    transform[player * 4 + 3] = 90;
    const enemy = place(sim, 'stier', 220, 90);

    let charged = false;
    for (let tick = 0; tick < 200; tick++) {
      sim.step(IDLE);
      if (stateName(sim, enemy) === 'charge') {
        charged = true;
      }
      if (stateName(sim, enemy) === 'winded') {
        break;
      }
    }
    expect(charged).toBe(true);
    expect(stateName(sim, enemy)).toBe('winded');
  });

  it('locks a charge on the direction it started in', () => {
    const sim = emptySim({ enemies: [charger] });
    const player = sim.playerIndex;
    const enemy = place(sim, 'stier', sim.positionX(player) + 90, sim.positionY(player));

    while (stateName(sim, enemy) !== 'charge') {
      sim.step(IDLE);
    }
    sim.step(IDLE);
    const headingX = sim.velocity.data[enemy * 2] ?? 0;
    const headingY = sim.velocity.data[enemy * 2 + 1] ?? 0;

    // The player leaves. A charge that follows is a charge that cannot be
    // dodged, which makes the telegraph in front of it a lie.
    const transform = sim.transform.data;
    transform[player * 4 + 1] = 30;
    transform[player * 4 + 3] = 30;
    sim.step(IDLE);

    expect(sim.velocity.data[enemy * 2]).toBeCloseTo(headingX, 5);
    expect(sim.velocity.data[enemy * 2 + 1]).toBeCloseTo(headingY, 5);
  });
});

/**
 * `rollBounce` (#35, Rollfass): a fixed direction along one axis, reversed
 * entirely by content — a pair of states joined by an `onBlocked`
 * transition each way — rather than by anything the primitive itself
 * decides. These prove the bounce and the split are real engine behaviour,
 * independent of `content/enemies/rollfass.ts`'s own numbers.
 */
describe('rollBounce (#35)', () => {
  const barrel: EnemyDefinition = {
    id: 'barrel',
    name: 'Barrel',
    size: 'mid',
    health: 1,
    contactDamage: 1,
    initial: 'east',
    states: [
      {
        name: 'east',
        behaviours: [
          { behaviour: 'rollBounce', speed: 1, axis: 'x', direction: 1 },
          { behaviour: 'splitOnDeath', into: 'splinter', count: 2, spread: 6 },
        ],
        transitions: [{ to: 'west', onBlocked: true }],
      },
      {
        name: 'west',
        behaviours: [
          { behaviour: 'rollBounce', speed: 1, axis: 'x', direction: -1 },
          { behaviour: 'splitOnDeath', into: 'splinter', count: 2, spread: 6 },
        ],
        transitions: [{ to: 'east', onBlocked: true }],
      },
    ],
  };
  const splinter: EnemyDefinition = {
    id: 'splinter',
    name: 'Splinter',
    size: 'mini',
    health: 1,
    contactDamage: 1,
    initial: 'skitter',
    states: [
      { name: 'skitter', behaviours: [{ behaviour: 'wander', speed: 0.5, turnEveryTicks: 20 }] },
    ],
  };

  /** A wall to the east of where the barrel spawns, none to the west. */
  function boxedRoom(): RoomGeometry {
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addBlock(200, 0, 220, 180);
    return room;
  }

  it('never turns toward the player — it only reverses off a wall', () => {
    const sim = emptySim({ room: boxedRoom(), enemies: [barrel, splinter] });
    const player = sim.playerIndex;
    // The player stands to the west; the barrel starts rolling east, away
    // from them, and must keep doing so — a player-seeking primitive would
    // turn around immediately.
    const transform = sim.transform.data;
    transform[player * 4] = 20;
    transform[player * 4 + 2] = 20;
    const enemy = place(sim, 'barrel', 100, 90);

    sim.step(IDLE);
    expect(sim.velocity.data[enemy * 2] ?? 0).toBeGreaterThan(0);
  });

  it('bounces back the other way off a wall, and keeps bouncing', () => {
    const sim = emptySim({ room: boxedRoom(), enemies: [barrel, splinter] });
    // Out of the barrel's way — this test is about the wall, not about the
    // barrel running into the player standing at the room's own centre.
    const player = sim.playerIndex;
    const transform = sim.transform.data;
    transform[player * 4] = 20;
    transform[player * 4 + 1] = 20;
    transform[player * 4 + 2] = 20;
    transform[player * 4 + 3] = 20;
    const enemy = place(sim, 'barrel', 100, 90);

    const seen = new Set<string>();
    for (let tick = 0; tick < 400; tick++) {
      sim.step(IDLE);
      seen.add(stateName(sim, enemy));
    }
    expect(seen.has('east')).toBe(true);
    expect(seen.has('west')).toBe(true);
  });

  it('breaks into splinters when it dies, wherever in the bounce it happened', () => {
    const sim = emptySim({ room: boxedRoom(), enemies: [barrel, splinter] });
    const enemy = place(sim, 'barrel', 100, 90);

    // The same call the impact system itself makes on a landed hit
    // (`sim/systems/impact.ts`), followed by the same death sweep `sim.step`
    // runs afterward — everything `sim.step` would do around this, without
    // running a whole tick's worth of unrelated systems too.
    applyDamageAt(sim, enemy, 5, sim.positionX(enemy), sim.positionY(enemy), 0, 0, -1);
    stepEnemyDeaths(sim);
    sim.world.flush();

    expect(liveEnemies(sim, 'splinter')).toBe(2);
  });
});

/**
 * `lobTarget`/`detonateLobbedBomb` (#156, Böllerschmeißer): the position is
 * captured when the throw begins, not wherever the player has moved to by
 * the time it lands — the whole reason `docs/CONTENT_BIBLE.md`'s "the
 * landing spot is marked" is dodgeable rather than a homing attack.
 */
describe('lobTarget / detonateLobbedBomb (#156)', () => {
  const thrower: EnemyDefinition = {
    id: 'thrower',
    name: 'Thrower',
    size: 'normal',
    health: 5,
    contactDamage: 0,
    initial: 'idle',
    states: [
      {
        name: 'idle',
        behaviours: [{ behaviour: 'pause' }],
        transitions: [{ to: 'wind', after: 1 }],
      },
      {
        name: 'wind',
        // `telegraph` ticks match the `after` transition below exactly, the
        // same convention the real `boellerschmeisser` content uses
        // (`content/enemies/boellerschmeisser.ts`): the throw and the ring's
        // own growth share one duration, which is what `lobbedBombFlight`
        // (#243) relies on to time the bomb's flight off the same countdown.
        behaviours: [
          { behaviour: 'pause' },
          { behaviour: 'telegraph', ticks: 10 },
          { behaviour: 'lobTarget' },
        ],
        transitions: [{ to: 'boom', after: 10 }],
      },
      {
        name: 'boom',
        behaviours: [
          { behaviour: 'pause' },
          { behaviour: 'detonateLobbedBomb', damage: 5, radius: 20 },
        ],
        transitions: [{ to: 'idle', after: 1 }],
      },
    ],
  };

  /** A second, harmless body to stand in the blast radius — nothing more than a health pool. */
  const bystander: EnemyDefinition = {
    id: 'bystander',
    name: 'Bystander',
    size: 'normal',
    health: 5,
    contactDamage: 0,
    initial: 'idle',
    states: [{ name: 'idle', behaviours: [{ behaviour: 'pause' }], transitions: [] }],
  };

  function teleportPlayer(sim: GameSim, x: number, y: number): void {
    const player = sim.playerIndex;
    const transform = sim.transform.data;
    transform[player * 4] = x;
    transform[player * 4 + 1] = y;
    transform[player * 4 + 2] = x;
    transform[player * 4 + 3] = y;
  }

  it('hits the player if they stay where they were when the throw began', () => {
    const sim = emptySim({ enemies: [thrower] });
    teleportPlayer(sim, 300, 90);
    const enemy = place(sim, 'thrower', 100, 90);

    const before = health(sim, sim.playerIndex);
    for (let tick = 0; tick < 12 && stateName(sim, enemy) !== 'boom'; tick++) {
      sim.step(IDLE);
    }
    // The player never moved, so wherever `lobTarget` captured is still
    // where they are when `detonateLobbedBomb` reads it back.
    expect(health(sim, sim.playerIndex)).toBeLessThan(before);
  });

  it('misses a player who left the captured spot before it went off', () => {
    const sim = emptySim({ enemies: [thrower] });
    teleportPlayer(sim, 300, 90);
    const enemy = place(sim, 'thrower', 100, 90);

    // Ride out `idle` into `wind` so `lobTarget` captures (300, 90).
    for (let tick = 0; tick < 2 && stateName(sim, enemy) !== 'wind'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('wind');

    // Now get well clear of the captured spot before the fuse runs out.
    teleportPlayer(sim, 300, 400);
    const before = health(sim, sim.playerIndex);
    for (let tick = 0; tick < 12 && stateName(sim, enemy) !== 'boom'; tick++) {
      sim.step(IDLE);
    }
    expect(health(sim, sim.playerIndex)).toBe(before);
  });

  it('never catches the thrower in its own blast', () => {
    const sim = emptySim({ enemies: [thrower] });
    // Standing exactly where the bomb will land — the thrower is at the
    // same point the player's own position gets captured at.
    teleportPlayer(sim, 100, 90);
    const enemy = place(sim, 'thrower', 100, 90);

    const before = health(sim, enemy);
    for (let tick = 0; tick < 12 && stateName(sim, enemy) !== 'boom'; tick++) {
      sim.step(IDLE);
    }
    expect(health(sim, enemy)).toBe(before);
  });

  /**
   * #260: mobs "kill themselves regularly" — an enemy's own lobbed bomb was
   * reading the same `Enemy | Obstacle | Player` splash mask a player item's
   * splash uses, so every other enemy caught in the blast took damage too.
   * `detonateLobbedBomb` now passes `hitsEnemies: false`
   * (`GameSim.applySplashDamage`'s own doc comment).
   */
  /**
   * #260 discussion: deliberately indiscriminate — a bomb is "more damaging"
   * than an ordinary shot precisely because it doesn't discriminate who is
   * standing in the blast, unlike an `EnemyProjectile` shot, which already
   * never touches `Enemy` at all (`collision/layers.ts`). Only the thrower
   * itself is exempt (the test above).
   */
  it('catches another enemy standing in its blast, same as a player splash would (#260)', () => {
    const sim = emptySim({ enemies: [thrower, bystander] });
    // The bomb lands wherever `lobTarget` captured — the player's position —
    // so the bystander has to stand there too, same as the thrower does in
    // "never catches the thrower in its own blast" above.
    teleportPlayer(sim, 100, 90);
    const enemy = place(sim, 'thrower', 300, 90);
    // Well inside the 20-radius blast.
    const other = place(sim, 'bystander', 105, 92);

    const before = health(sim, other);
    for (let tick = 0; tick < 12 && stateName(sim, enemy) !== 'boom'; tick++) {
      sim.step(IDLE);
    }
    expect(health(sim, other)).toBeLessThan(before);
  });

  /**
   * #243: the damage alone left the blast invisible — a player hit from
   * off to one side saw no source for it. `detonateLobbedBomb` now spawns a
   * burst through `sim/particle/effects.ts`'s `splashBurst` at the captured
   * spot, the same place `applySplashDamage` computes its damage from.
   */
  it('draws a burst where the bomb goes off, not only where it damages', () => {
    const sim = emptySim({ enemies: [thrower] });
    teleportPlayer(sim, 300, 90);
    place(sim, 'thrower', 100, 90);

    for (let tick = 0; tick < 12; tick++) {
      sim.step(IDLE);
      if (hasEmberBurstAt(sim, 300, 90)) {
        return;
      }
    }
    throw new Error('detonateLobbedBomb never drew a burst at the captured spot');
  });

  /**
   * #243: neither the ring on the thrower nor the burst at the landing spot
   * showed the throw itself — a hit read as the bomb spawning directly on
   * the player. `lobbedBombFlight` is the data `render/bomb-flight-view.ts`
   * draws a travelling keg from, over the same wind-up the ring already
   * telegraphs.
   */
  describe('lobbedBombFlight (#243)', () => {
    function freshFlight(): LobbedBombFlight {
      return { startX: 0, startY: 0, endX: 0, endY: 0, progress: 0 };
    }

    it('reports no flight before or after the wind-up', () => {
      const sim = emptySim({ enemies: [thrower] });
      teleportPlayer(sim, 300, 90);
      const enemy = place(sim, 'thrower', 100, 90);

      expect(stateName(sim, enemy)).toBe('idle');
      expect(lobbedBombFlight(sim, enemy, freshFlight())).toBe(false);

      for (let tick = 0; tick < 12 && stateName(sim, enemy) !== 'boom'; tick++) {
        sim.step(IDLE);
      }
      expect(stateName(sim, enemy)).toBe('boom');
      expect(lobbedBombFlight(sim, enemy, freshFlight())).toBe(false);
    });

    it('flies from the thrower to the captured landing spot during the wind-up', () => {
      const sim = emptySim({ enemies: [thrower] });
      teleportPlayer(sim, 300, 90);
      const enemy = place(sim, 'thrower', 100, 90);

      for (let tick = 0; tick < 2 && stateName(sim, enemy) !== 'wind'; tick++) {
        sim.step(IDLE);
      }
      expect(stateName(sim, enemy)).toBe('wind');

      const flight = freshFlight();
      expect(lobbedBombFlight(sim, enemy, flight)).toBe(true);
      expect(flight.startX).toBeCloseTo(100);
      expect(flight.startY).toBeCloseTo(90);
      expect(flight.endX).toBeCloseTo(300);
      expect(flight.endY).toBeCloseTo(90);
      expect(flight.progress).toBeGreaterThan(0);

      const firstProgress = flight.progress;
      sim.step(IDLE);
      expect(lobbedBombFlight(sim, enemy, flight)).toBe(true);
      // Rides the same countdown the ring's own growth reads, so it always
      // moves forward — never resets or reverses mid-throw.
      expect(flight.progress).toBeGreaterThan(firstProgress);
    });
  });
});

/**
 * `enemyTelegraphShape` (#233): what a wind-up warns about, read off the
 * state its own `after` transition leads to rather than authored a second
 * time per enemy — so the roster's own content proves the mapping, and a
 * couple of custom definitions cover the shapes nothing shipped uses yet.
 */
describe('enemyTelegraphShape (#233)', () => {
  function freshShape(): EnemyTelegraphShapeInfo {
    return { shape: TelegraphShape.Ring, progress: 0, x: 0, y: 0, angle: 0, arc: 0, reach: 0 };
  }

  it('is false while a body is not telegraphing at all', () => {
    const sim = emptySim();
    const enemy = place(
      sim,
      'kuh',
      sim.positionX(sim.playerIndex) + 200,
      sim.positionY(sim.playerIndex),
    );
    expect(enemyTelegraphShape(sim, enemy, freshShape())).toBe(false);
  });

  it('reads a charge as Line, aimed at the player, not authored on the enemy', () => {
    // Kuh's `telegraph` state's own `after` leads to `charge`, whose
    // movement is `chargeAtPlayer` — nothing in `content/enemies/kuh.ts`
    // says "draw a line," the shape comes entirely from that lookup.
    const sim = emptySim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'kuh', sim.positionX(player) + 40, sim.positionY(player));
    for (let tick = 0; tick < 30 && stateName(sim, enemy) !== 'telegraph'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('telegraph');
    // One more tick: `enemyTelegraphProgress` (and so this) reads 0 on the
    // exact tick a state is entered.
    sim.step(IDLE);

    const shape = freshShape();
    expect(enemyTelegraphShape(sim, enemy, shape)).toBe(true);
    expect(shape.shape).toBe(TelegraphShape.Line);
    // The player sits due west of the body, so the aim angle is π.
    expect(shape.angle).toBeCloseTo(Math.PI, 1);
  });

  it('reads a radial burst as Ring, the same shape every telegraph used to draw', () => {
    // Zapfhahn's `wind` leads to `spray`, a `fireSpread` — the default case.
    const sim = emptySim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'zapfhahn', sim.positionX(player) + 60, sim.positionY(player));
    for (let tick = 0; tick < 30 && stateName(sim, enemy) !== 'wind'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('wind');
    sim.step(IDLE);

    const shape = freshShape();
    expect(enemyTelegraphShape(sim, enemy, shape)).toBe(true);
    expect(shape.shape).toBe(TelegraphShape.Ring);
  });

  it("reads Böllerschmeißer's lob as Ground, at the spot captured when the throw began — not wherever the player is now — sized to the real blast radius", () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const transform = sim.transform.data;
    // Close enough to trigger `lurk`'s own `whenPlayerWithin: 120`.
    const enemy = place(
      sim,
      'boellerschmeisser',
      sim.positionX(player) + 60,
      sim.positionY(player),
    );

    for (let tick = 0; tick < 10 && stateName(sim, enemy) !== 'wind'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('wind');
    const capturedX = sim.positionX(player);
    const capturedY = sim.positionY(player);
    sim.step(IDLE);

    // The player runs off before the throw lands — the marker must stay
    // where the throw began, the same lesson `chargeAtPlayer`'s own locked
    // aim teaches: a warning that follows the player is not dodgeable.
    transform[player * 4] = capturedX + 500;
    transform[player * 4 + 1] = capturedY + 500;
    transform[player * 4 + 2] = capturedX + 500;
    transform[player * 4 + 3] = capturedY + 500;

    const shape = freshShape();
    expect(enemyTelegraphShape(sim, enemy, shape)).toBe(true);
    expect(shape.shape).toBe(TelegraphShape.Ground);
    expect(shape.x).toBeCloseTo(capturedX, 0);
    expect(shape.y).toBeCloseTo(capturedY, 0);
    // `content/enemies/boellerschmeisser.ts`'s `boom` state detonates at
    // radius 28 — the same number the marker's own final size is read from.
    expect(shape.reach).toBe(28);
  });

  const swinger: EnemyDefinition = {
    id: 'swinger',
    name: 'Swinger',
    size: 'normal',
    health: 4,
    contactDamage: 0,
    initial: 'wind',
    states: [
      {
        name: 'wind',
        behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 10 }],
        transitions: [{ to: 'swing', after: 10 }],
      },
      {
        name: 'swing',
        behaviours: [
          { behaviour: 'pause' },
          {
            behaviour: 'meleeArc',
            arc: Math.PI / 2,
            reach: 30,
            damage: 2,
            knockback: 2,
            sweepTicks: 8,
          },
        ],
        transitions: [{ to: 'wind', after: 20 }],
      },
    ],
  };

  it('reads a melee swing as Arc, with the real arc width and reach, aimed at the player', () => {
    // No shipped enemy is small enough to draw this today (the roster's own
    // `meleeArc` user, the Maibaum-Dieb, is a boss and reads its wind-up off
    // its own body instead) — authored here so the lookup itself is proven
    // independent of that render-layer exclusion (#233's own acceptance
    // criterion: "adding a new enemy with an existing attack kind needs no
    // render change").
    const sim = emptySim({ enemies: [swinger] });
    const player = sim.playerIndex;
    const enemy = place(sim, 'swinger', sim.positionX(player) + 40, sim.positionY(player));
    // One tick so the state's own counter is past zero — `enemyTelegraphProgress`
    // (and so this) reads 0 on the exact tick a state is entered.
    sim.step(IDLE);
    const shape = freshShape();
    expect(enemyTelegraphShape(sim, enemy, shape)).toBe(true);
    expect(shape.shape).toBe(TelegraphShape.Arc);
    expect(shape.arc).toBeCloseTo(Math.PI / 2);
    expect(shape.reach).toBe(30);
    expect(shape.angle).toBeCloseTo(Math.PI, 1);
  });

  const noAfter: EnemyDefinition = {
    id: 'no-after',
    name: 'NoAfter',
    size: 'normal',
    health: 4,
    contactDamage: 0,
    initial: 'wind',
    states: [
      {
        name: 'wind',
        behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 10 }],
        transitions: [{ to: 'wind', onHit: true }],
      },
    ],
  };

  it('falls back to Ring when a telegraphing state has no After transition to read', () => {
    const sim = emptySim({ enemies: [noAfter] });
    const player = sim.playerIndex;
    const enemy = place(sim, 'no-after', sim.positionX(player) + 40, sim.positionY(player));
    sim.step(IDLE);
    const shape = freshShape();
    expect(enemyTelegraphShape(sim, enemy, shape)).toBe(true);
    expect(shape.shape).toBe(TelegraphShape.Ring);
  });
});

/** Whether a live `Ember` particle sits at `(x, y)`, rounded to the nearest whole unit. */
function hasEmberBurstAt(sim: GameSim, x: number, y: number): boolean {
  let found = false;
  sim.particles.forEachLive((index) => {
    if (
      sim.particles.kind[index] === ParticleKind.Ember &&
      Math.round(sim.particles.x[index] ?? 0) === x &&
      Math.round(sim.particles.y[index] ?? 0) === y
    ) {
      found = true;
    }
  });
  return found;
}

/**
 * `splitOnDeath`'s `atHealthBelow` (#36): Die Große Kellerassel's phase
 * change, written as data the same way the rest of this file's primitives
 * are, independent of `content/enemies/grosse-kellerassel.ts`'s own numbers.
 */
describe('splitOnDeath at a health threshold (#36)', () => {
  const shatterer: EnemyDefinition = {
    id: 'shatterer',
    name: 'Shatterer',
    size: 'mid',
    health: 10,
    contactDamage: 0,
    initial: 'idle',
    states: [
      {
        name: 'idle',
        behaviours: [
          { behaviour: 'pause' },
          { behaviour: 'splitOnDeath', into: 'shard', count: 3, spread: 6, atHealthBelow: 0.5 },
        ],
      },
    ],
  };
  const shard: EnemyDefinition = {
    id: 'shard',
    name: 'Shard',
    size: 'mini',
    health: 1,
    contactDamage: 0,
    initial: 'skitter',
    states: [
      { name: 'skitter', behaviours: [{ behaviour: 'wander', speed: 0.5, turnEveryTicks: 20 }] },
    ],
  };

  it('splits the instant health crosses the threshold, without waiting for zero', () => {
    const sim = emptySim({ enemies: [shatterer, shard] });
    const player = sim.playerIndex;
    const enemy = place(sim, 'shatterer', sim.positionX(player) + 200, sim.positionY(player));

    // 10 -> 6: still above the 5-health threshold.
    applyDamageAt(sim, enemy, 4, sim.positionX(enemy), sim.positionY(enemy), 0, 0, -1);
    for (let tick = 0; tick < 20; tick++) {
      sim.step(IDLE);
    }
    expect(liveEnemies(sim, 'shatterer')).toBe(1);
    expect(liveEnemies(sim, 'shard')).toBe(0);

    // 6 -> 4: at or below it now, and nothing shot it for the rest.
    applyDamageAt(sim, enemy, 2, sim.positionX(enemy), sim.positionY(enemy), 0, 0, -1);
    for (let tick = 0; tick < 20; tick++) {
      sim.step(IDLE);
    }
    expect(liveEnemies(sim, 'shatterer')).toBe(0);
    expect(liveEnemies(sim, 'shard')).toBe(3);
  });

  it('never fires while health is still above the threshold', () => {
    const sim = emptySim({ enemies: [shatterer, shard] });
    const player = sim.playerIndex;
    place(sim, 'shatterer', sim.positionX(player) + 200, sim.positionY(player));

    for (let tick = 0; tick < 120; tick++) {
      sim.step(IDLE);
    }
    expect(liveEnemies(sim, 'shatterer')).toBe(1);
    expect(liveEnemies(sim, 'shard')).toBe(0);
  });
});

describe('enemies against the player', () => {
  it('never ends a tick inside the player', () => {
    const sim = new GameSim({ seed: 1, population: 'enemies' });
    const player = sim.playerIndex;
    const playerRadius = sim.body.data[player * 2] ?? 0;

    let worst = 0;
    for (let tick = 0; tick < 1200; tick++) {
      // Circling, which is what a player does, and what used to drag a light
      // body a fifth of the way inside them.
      const angle = (tick / 60) * Math.PI * 2;
      const frame = createInputFrame();
      frame.moveX = quantiseAxis(Math.cos(angle));
      frame.moveY = quantiseAxis(Math.sin(angle));
      sim.step(frame);
      // Death (#15) is a real state now: the run stops, main.ts stops calling
      // step, and the game moves to the death sequence. Simulating hundreds of
      // ticks past that point is not a scenario the real game produces, and
      // separation is not tuned to hold indefinitely once nothing is left
      // clearing the pile of enemies that gathers on a body nobody is steering
      // out of the way anymore.
      if (sim.playerDead) {
        break;
      }

      for (let index = 0; index < sim.world.highWater; index++) {
        if (sim.world.states[index] !== World.ALIVE) {
          continue;
        }
        if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
          continue;
        }
        const reach = playerRadius + (sim.body.data[index * 2] ?? 0);
        worst = Math.max(worst, reach - distance(sim, player, index));
      }
    }
    // Touching is fine. A body that settles inside the player is not, and it is
    // what a separation applied to one of the pair and deferred on the other
    // produces the moment the other one walks.
    //
    // The budget is 1.1, not the tighter number this used to hold to:
    // `population: 'enemies'` scatters a dozen dev-convenience beers
    // (`spawnEnemyRoom`) the circling path below walks over, and Promille's
    // own movement drift (only above the Beduselt threshold) had been
    // incidentally smoothing this exact circle — slowing how sharply the
    // player's steering can turn, which is what let single-pass separation
    // fully resolve every tick. Slower Promille pacing means this room's
    // beers no longer reliably reach that threshold, so the drift-free,
    // full-precision case — a sober player circling as tight as input allows
    // — is what this test measured for a while, at a few tenths of a pixel.
    //
    // #23 widened it again: touching a hazard used to trigger a whole-simulation
    // freeze (`requestHitstop`, from `applyContact`), which incidentally gave
    // separation a few free ticks of settling time — with the player's own
    // steering paused too — every time contact damage landed on this circling
    // path. That freeze is gone (player-as-victim gets i-frames, knockback,
    // flash and shake instead — see `GameSim.hitStun`'s doc comment), so the
    // player's steering never pauses, and the real worst case with nothing
    // pausing it is close to a pixel rather than a few tenths of one. Still a
    // fraction of either body's radius, not an enemy settling inside the player.
    expect(worst).toBeLessThan(1.1);
  });

  it('never removes the player from the world, whatever kills them', () => {
    const sim = new GameSim({ seed: 1, population: 'enemies' });
    const player = sim.playerIndex;

    for (let tick = 0; tick < 2000; tick++) {
      sim.step(IDLE);
    }
    // Their health can reach zero and the run can end (#15), but their entity
    // slot has to survive it. A freed slot is handed to the next body that
    // spawns, and the camera follows whatever lands in it.
    expect(sim.playerIndex).toBe(player);
    expect(sim.body.data[player * 2]).toBe(PLAYER_RADIUS);
    expect(health(sim, player)).toBeGreaterThanOrEqual(0);
    expect(sim.world.states[player]).toBe(World.ALIVE);
  });
});

describe('action/state audio events (#234)', () => {
  it('reports an AttackWindup event the tick a telegraphed state is entered, naming the enemy', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'zapfhahn', sim.positionX(player) + 40, sim.positionY(player));

    // Well within `whenPlayerWithin: 110`, so `idle` transitions to `wind`
    // (`{ behaviour: 'telegraph', ticks: 30 }`) on the very first tick.
    sim.step(IDLE);
    expect(stateName(sim, enemy)).toBe('wind');

    const windups: number[] = [];
    sim.events.forEach((slot) => {
      if (sim.events.kind[slot] === EventKind.AttackWindup) {
        windups.push(sim.events.subject[slot] ?? -1);
      }
    });
    expect(windups).toEqual([enemy]);

    // Not fired again on every tick spent telegraphing — only on entry.
    let windupsAfterEntry = 0;
    for (let tick = 0; tick < 25; tick++) {
      sim.step(IDLE);
      sim.events.forEach((slot) => {
        if (sim.events.kind[slot] === EventKind.AttackWindup) {
          windupsAfterEntry += 1;
        }
      });
    }
    expect(stateName(sim, enemy)).toBe('wind');
    expect(windupsAfterEntry).toBe(0);
  });

  it("reports a ShotFired event per shot the tick an enemy's `fireSpread` volley leaves, naming the shooter", () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'zapfhahn', sim.positionX(player) + 40, sim.positionY(player));

    for (let tick = 0; tick < 60 && stateName(sim, enemy) !== 'spray'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('spray');

    // `spray`'s `fireSpread` fans three shots the instant the state begins —
    // one `ShotFired` per ray, all naming the same shooter.
    const subjects: number[] = [];
    sim.events.forEach((slot) => {
      if (sim.events.kind[slot] === EventKind.ShotFired) {
        subjects.push(sim.events.subject[slot] ?? -1);
      }
    });
    expect(subjects).toEqual([enemy, enemy, enemy]);
  });

  it("reports an EnemySplit event the tick a `splitOnDeath` body's death lands", () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'rollfass', sim.positionX(player) + 40, sim.positionY(player));
    const definition = sim.enemies.at(sim.enemies.indexOf('rollfass'));
    sim.tuning.shooting.shotDamage = definition.health;

    expect(liveEnemies(sim, 'fasssplitter')).toBe(0);
    landShot(sim);
    expect(sim.world.isAlive(sim.world.entityAt(enemy))).toBe(false);

    const splits: number[] = [];
    sim.events.forEach((slot) => {
      if (sim.events.kind[slot] === EventKind.EnemySplit) {
        splits.push(sim.events.subject[slot] ?? -1);
      }
    });
    expect(splits).toEqual([enemy]);
    // Rollfass's own `splitOnDeath`: `{ into: 'fasssplitter', count: 3 }`.
    expect(liveEnemies(sim, 'fasssplitter')).toBe(3);
  });
});
