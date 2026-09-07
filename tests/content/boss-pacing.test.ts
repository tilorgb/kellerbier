import { describe, expect, it } from 'vitest';
import { derStier, grosseKellerassel, maibaumDieb } from '../../src/content/enemies/index.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { World } from '../../src/sim/ecs/world.js';
import { EventKind } from '../../src/sim/events/queue.js';
import { GameSim, PLAYER_HEALTH, type GameSimOptions } from '../../src/sim/game/sim.js';
import {
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
  type InputFrame,
} from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ENEMY_STRIDE } from '../../src/sim/systems/enemy.js';

/**
 * #232 — "both bosses die faster than their movesets take to play." A boss's
 * `health` and `contactDamage` are picked by feel (see the doc comments on
 * `content/enemies/grosse-kellerassel.ts` and `der-stier.ts`), not derived,
 * but the issue's own acceptance criterion is that the pick can be checked:
 * "each boss's authored state cycle completes at least four times in a
 * typical mid-run fight, measured rather than estimated." This file is that
 * measurement — a real `GameSim`, a boss alone in a room, a player who does
 * nothing but aim at it and hold the trigger, run until the boss is dead (or,
 * for Die Große Kellerassel, until it splits) and count how many times the
 * authored loop's own attack state was actually entered.
 *
 * Two DPS points, both taken from the issue's own table: `shotDamage: 1` at
 * the default `fireDelayTicks` of 20 is the base 3 DPS a run starts at,
 * `shotDamage: 2` is "with one Bierkrug" (+1 dmg), 6 DPS. Higher DPS clears a
 * fixed health pool faster, so 6 DPS is the harder bar to clear here — a boss
 * tuned so its loop still runs four times against a player who has already
 * found a damage item is tuned so it also runs (rather more) times against
 * one who hasn't.
 */

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

/** A room with the training targets cleared out — see `tests/unit/enemy.test.ts`. */
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

function place(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

/** Fires toward whatever `target` is at right now — a boss does not stand still. */
function aimAt(sim: GameSim, from: number, target: number): InputFrame {
  const dx = sim.positionX(target) - sim.positionX(from);
  const dy = sim.positionY(target) - sim.positionY(from);
  const distance = Math.hypot(dx, dy) || 1;
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(dx / distance);
  frame.aimY = quantiseAxis(dy / distance);
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

function stateName(sim: GameSim, index: number): string {
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  return compiled.states[sim.enemy.data[base + 1] ?? 0]?.name ?? '';
}

function isAlive(sim: GameSim, index: number): boolean {
  return sim.world.states[index] === World.ALIVE;
}

interface FightResult {
  readonly ticksToOutcome: number;
  readonly cycles: number;
  readonly outcomeReached: boolean;
}

/**
 * Runs `bossId` alone against a player who only aims and fires, at
 * `shotDamage` per shot, and counts how many times `attackState` is entered
 * before either the boss dies or (for a split boss) `splitHealthFraction` of
 * its max health is crossed. `attackState` is the state each authored loop
 * spends its "turn" in — `spit` for Die Große Kellerassel, `charge` for Der
 * Stier — so a count of N means the player was shown that attack N times.
 */
function measureFight(
  bossId: string,
  attackState: string,
  shotDamage: number,
  options: { readonly splitHealthFraction?: number; readonly maxTicks?: number } = {},
): FightResult {
  const sim = emptySim();
  sim.tuning.shooting.shotDamage = shotDamage;
  const player = sim.playerIndex;
  const boss = place(sim, bossId, sim.positionX(player) + 70, sim.positionY(player));
  const maxHealth = sim.health.data[boss * 2 + 1] ?? 1;
  const splitAt =
    options.splitHealthFraction !== undefined ? options.splitHealthFraction * maxHealth : 0;
  const maxTicks = options.maxTicks ?? 6000;

  let cycles = 0;
  let previousState = stateName(sim, boss);
  let outcomeReached = false;
  let ticksToOutcome = maxTicks;

  for (let tick = 0; tick < maxTicks; tick++) {
    sim.step(aimAt(sim, player, boss));

    if (!isAlive(sim, boss)) {
      outcomeReached = true;
      ticksToOutcome = tick + 1;
      break;
    }
    const currentHealth = sim.health.data[boss * 2] ?? 0;
    if (splitAt > 0 && currentHealth <= splitAt) {
      outcomeReached = true;
      ticksToOutcome = tick + 1;
      break;
    }

    const currentState = stateName(sim, boss);
    if (currentState === attackState && previousState !== attackState) {
      cycles += 1;
    }
    previousState = currentState;
  }

  return { ticksToOutcome, cycles, outcomeReached };
}

describe('boss pacing (#232)', () => {
  it('Die Große Kellerassel plays its crawl/curl/spit loop at least four times before splitting', () => {
    for (const shotDamage of [1, 2]) {
      const result = measureFight('grosse-kellerassel', 'spit', shotDamage, {
        splitHealthFraction: 0.5,
      });
      expect(
        result.outcomeReached,
        `shotDamage=${String(shotDamage)} never reached the split`,
      ).toBe(true);
      expect(
        result.cycles,
        `shotDamage=${String(shotDamage)}: only ${String(result.cycles)} spit(s) before the split`,
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it('Der Stier plays its approach/telegraph/charge/stunned loop at least four times before dying', () => {
    for (const shotDamage of [1, 2]) {
      const result = measureFight('der-stier', 'charge', shotDamage);
      expect(result.outcomeReached, `shotDamage=${String(shotDamage)} never killed Der Stier`).toBe(
        true,
      );
      expect(
        result.cycles,
        `shotDamage=${String(shotDamage)}: only ${String(result.cycles)} charge(s) before death`,
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it('two boss contacts never remove more than half the player max health', () => {
    for (const contactDamage of [
      grosseKellerassel.contactDamage,
      derStier.contactDamage,
      maibaumDieb.contactDamage,
    ]) {
      expect(contactDamage * 2).toBeLessThanOrEqual(PLAYER_HEALTH / 2);
    }
  });
});

/**
 * #276 — the two Floor 1 mini-bosses, held to the same "tuned against a real
 * sim, not picked as a number" standard, but with a mini-boss's own bar: no
 * phase two, so it is meant to be shorter than a boss, and the "at least four
 * cycles" figure is a boss rule. The hard requirement the issue names is that
 * *neither outlasts Die Große Kellerassel* — a mini-boss the player fights
 * longer than the floor's actual boss is the failure mode.
 *
 * The Orgel's foam knocks a hit body back, and #232's harness player never
 * repositions — left alone it drifts out of its own shot's range and the
 * fight stalls. So this pins the player at a fixed spot in range each tick:
 * the measurement is "with shots landing, how long, how many cycles," which
 * is what a boss's own `measureFight` gets for free from a boss that walks
 * into the player rather than shoving them away.
 */
function measurePinnedFight(
  bossId: string,
  attackState: string,
  shotDamage: number,
  splitFraction = 0,
): { ticks: number; cycles: number; died: boolean; waves: number } {
  const sim = emptySim();
  sim.tuning.shooting.shotDamage = shotDamage;
  const player = sim.playerIndex;
  const px = sim.positionX(player);
  const py = sim.positionY(player);
  const boss = place(sim, bossId, px + 64, py);
  const maxHealth = sim.health.data[boss * 2 + 1] ?? 1;
  const splitAt = splitFraction > 0 ? splitFraction * maxHealth : 0;

  let cycles = 0;
  let waves = 0;
  let previous = stateName(sim, boss);
  for (let tick = 0; tick < 6000; tick++) {
    sim.step(aimAt(sim, player, boss));
    // Undo the knockback the foam applied — a repositioning player's job.
    sim.transform.data[player * 2] = px;
    sim.transform.data[player * 2 + 1] = py;
    sim.velocity.data[player * 2] = 0;
    sim.velocity.data[player * 2 + 1] = 0;

    sim.events.forEach((slot) => {
      if (sim.events.kind[slot] === EventKind.EnemySummon) {
        waves += 1;
      }
    });

    if (!isAlive(sim, boss)) {
      return { ticks: tick + 1, cycles, died: true, waves };
    }
    if (splitAt > 0 && (sim.health.data[boss * 2] ?? 0) <= splitAt) {
      return { ticks: tick + 1, cycles, died: false, waves };
    }
    const current = stateName(sim, boss);
    if (current === attackState && previous !== attackState) {
      cycles += 1;
    }
    previous = current;
  }
  return { ticks: 6000, cycles, died: false, waves };
}

describe('mini-boss pacing (#276)', () => {
  it('neither mini-boss is fought longer than Die Große Kellerassel', () => {
    for (const shotDamage of [1, 2]) {
      const bossTicks = measurePinnedFight('grosse-kellerassel', 'spit', shotDamage, 0.5).ticks;
      for (const id of ['der-rattenkoenig', 'die-zapfhahn-orgel']) {
        const mini = measurePinnedFight(id, 'rest', shotDamage);
        expect(mini.died, `shotDamage=${String(shotDamage)}: ${id} never died`).toBe(true);
        expect(
          mini.ticks,
          `shotDamage=${String(shotDamage)}: ${id} lasts ${String(mini.ticks)} ticks vs the boss's ${String(bossTicks)}`,
        ).toBeLessThan(bossTicks);
      }
    }
  });

  it('Die Zapfhahn-Orgel plays its wind/spray rhythm several times over, twice at least at 6 DPS', () => {
    for (const [shotDamage, floor] of [
      [1, 4],
      [2, 2],
    ] as const) {
      const result = measurePinnedFight('die-zapfhahn-orgel', 'wind', shotDamage);
      expect(result.died, `shotDamage=${String(shotDamage)} never killed the Orgel`).toBe(true);
      expect(
        result.cycles,
        `shotDamage=${String(shotDamage)}: only ${String(result.cycles)} wind/spray cycle(s)`,
      ).toBeGreaterThanOrEqual(floor);
    }
  });

  it('Der Rattenkönig shows its idea — it spawns Bierratten in waves — before a focused player ends it', () => {
    for (const shotDamage of [1, 2]) {
      const result = measurePinnedFight('der-rattenkoenig', 'screech', shotDamage);
      expect(result.died, `shotDamage=${String(shotDamage)} never killed the king`).toBe(true);
      expect(
        result.waves,
        `shotDamage=${String(shotDamage)}: only ${String(result.waves)} summon wave(s) before the king died`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('a Bierratte summoned into the room is never an elite', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    place(sim, 'der-rattenkoenig', sim.positionX(player) + 70, sim.positionY(player));
    // Stand still and never fire — let the king spawn a couple of waves.
    for (let tick = 0; tick < 400; tick++) {
      sim.step(createInputFrame());
    }
    let rats = 0;
    sim.world.forEach(sim.enemyMask, (index) => {
      const base = index * ENEMY_STRIDE;
      const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
      if (compiled.id === 'bierratte') {
        rats += 1;
        expect((sim.enemy.data[base + 3] ?? 0) & 0b100).toBe(0); // ENEMY_FLAG_ELITE
      }
    });
    expect(rats).toBeGreaterThan(0);
  });
});
