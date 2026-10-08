import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ENEMY_STRIDE } from '../../src/sim/systems/enemy.js';
import { applyDamageAt } from '../../src/sim/systems/impact.js';
import {
  STATUS_EFFECT_STRIDE,
  STATUS_FREEZE,
  STATUS_FREEZE_COOLDOWN,
  applyFreeze,
  stepStatusEffects,
} from '../../src/sim/systems/status-effects.js';

/**
 * Only small, unimportant mobs can be locked down: a boss or mini-boss is never
 * hit-staggered and is only slowed by a freeze, and a freeze on anything is a
 * window followed by a breather (`freezeCooldownTicks`), not a state a rapid
 * shooter can hold a body in.
 */

function sim(): GameSim {
  const s = new GameSim({ room: new RoomGeometry(0, 0, 320, 180) });
  const doomed: number[] = [];
  s.world.forEach(s.collidableMask, (index) => {
    if (index !== s.playerIndex) {
      doomed.push(index);
    }
  });
  for (const index of doomed) {
    s.world.destroy(s.world.entityAt(index));
  }
  s.world.flush();
  return s;
}

function place(s: GameSim, id: string, x = 200, y = 90): number {
  const entity = s.spawnEnemyKind(s.enemies.indexOf(id), x, y);
  s.world.flush();
  return entityIndex(entity);
}

function freezeTicks(s: GameSim, index: number): number {
  return s.statusEffect.data[index * STATUS_EFFECT_STRIDE + STATUS_FREEZE] ?? 0;
}

describe('freeze has a cooldown', () => {
  it('does not extend a freeze that is running, and refuses a fresh one for a breather after', () => {
    const s = sim();
    const mob = place(s, 'kellerassel');
    const duration = s.tuning.projectileTags.freezeDurationTicks;
    const cooldown = s.tuning.projectileTags.freezeCooldownTicks;
    expect(cooldown).toBeGreaterThan(0);

    expect(applyFreeze(s, mob, duration)).toBe(true);
    expect(freezeTicks(s, mob)).toBe(duration);
    for (let tick = 0; tick < 10; tick++) {
      stepStatusEffects(s);
    }
    // A hit while frozen is not a longer freeze.
    expect(applyFreeze(s, mob, duration)).toBe(false);
    expect(freezeTicks(s, mob)).toBe(duration - 10);

    for (let tick = 0; tick < duration - 10; tick++) {
      stepStatusEffects(s);
    }
    expect(freezeTicks(s, mob)).toBe(0);
    // Thawed, and in its breather.
    expect(s.statusEffect.data[mob * STATUS_EFFECT_STRIDE + STATUS_FREEZE_COOLDOWN]).toBe(cooldown);
    expect(applyFreeze(s, mob, duration)).toBe(false);
    for (let tick = 0; tick < cooldown; tick++) {
      stepStatusEffects(s);
    }
    expect(applyFreeze(s, mob, duration)).toBe(true);
  });

  it('a stream of freezing hits freezes a small mob for less than half of the time', () => {
    const s = sim();
    const mob = place(s, 'kellerassel');
    let frozen = 0;
    const ticks = 1200;
    for (let tick = 0; tick < ticks; tick++) {
      applyFreeze(s, mob, s.tuning.projectileTags.freezeDurationTicks);
      stepStatusEffects(s);
      if (freezeTicks(s, mob) > 0) {
        frozen += 1;
      }
    }
    expect(frozen / ticks).toBeLessThan(0.5);
  });
});

describe('only small mobs can be stunlocked', () => {
  it('a hit staggers a small mob but never a boss or mini-boss', () => {
    const s = sim();
    const small = place(s, 'kellerassel', 100, 90);
    const mini = place(s, 'bieber', 200, 90);
    applyDamageAt(s, small, 1, 100, 90, -1, 0, -1);
    applyDamageAt(s, mini, 1, 200, 90, -1, 0, -1);
    expect(s.hitStun.data[small]).toBeGreaterThan(0);
    expect(s.hitStun.data[mini]).toBe(0);
    expect(s.isStunResistant(small)).toBe(false);
    expect(s.isStunResistant(mini)).toBe(true);
  });

  it('a freeze only slows a boss, where it all but stops a small mob', () => {
    const s = sim();
    const small = place(s, 'kellerassel', 100, 90);
    const mini = place(s, 'bieber', 200, 90);
    applyFreeze(s, small, 30);
    applyFreeze(s, mini, 30);
    for (const index of [small, mini]) {
      s.velocity.data[index * 2] = 1;
      s.velocity.data[index * 2 + 1] = 0;
    }
    stepStatusEffects(s);
    expect(s.velocity.data[small * 2]).toBeCloseTo(s.tuning.projectileTags.freezeSlowFactor);
    expect(s.velocity.data[mini * 2]).toBeCloseTo(s.tuning.projectileTags.slowSpeedFactor);
  });

  it('a mini-boss under fire still gets through his cycle', () => {
    const s = sim();
    const mini = place(s, 'bieber', 200, 90);
    let attacks = 0;
    for (let tick = 0; tick < 900; tick++) {
      // Hit every few ticks, the way a rapid shooter would, and freeze him too.
      if (tick % 4 === 0) {
        applyDamageAt(s, mini, 0.01, 200, 90, -1, 0, -1);
        applyFreeze(s, mini, s.tuning.projectileTags.freezeDurationTicks);
      }
      s.step(createInputFrame());
      const base = mini * ENEMY_STRIDE;
      const name =
        s.enemies.at(s.enemy.data[base] ?? 0).states[s.enemy.data[base + 1] ?? 0]?.name ?? '';
      if (name === 'swish' && s.enemy.data[base + 2] === 1) {
        attacks += 1;
      }
    }
    expect(attacks).toBeGreaterThan(0);
  });
});
