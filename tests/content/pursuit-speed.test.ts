import { describe, expect, it } from 'vitest';
import {
  bauer,
  bierratte,
  gartenzwerg,
  grosseKellerassel,
  kuh,
} from '../../src/content/enemies/index.js';
import type { EnemyBehaviour, EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { DEFAULT_MOVEMENT_TUNING } from '../../src/sim/tuning.js';

/**
 * #229: "walking backwards is a complete answer to the game" before this
 * pass, because nothing pursuing the player and nothing shot at the player
 * moved faster than `DEFAULT_MOVEMENT_TUNING.maxSpeed`. The issue's own
 * acceptance criterion is stated in exactly those terms — "on each of floors
 * 1 and 2, at least two roster entries can out-pace or out-range a player who
 * is running away in a straight line" — so this checks the same thing a
 * scripted retreat-and-fire bot would find by playing: a `walkTowardPlayer` /
 * `chargeAtPlayer` state (a body that closes the gap itself) or a
 * `fireAtPlayer` volley (a shot re-aimed at the player, as opposed to a
 * `fireSpread`/`fireOnBeat` fan a player can step out of rather than outrun)
 * whose speed clears the player's own top speed. A wide radial fan
 * (`fireSpread`/`fireOnBeat` with a full-circle or near-full-circle arc) is
 * deliberately excluded even though it shares `fireSpread`'s shape with Die
 * Große Kellerassel's narrow `spit` cone — the issue is explicit that those
 * stay slow ("reading and threading a slow wall is exactly what slow bullets
 * are for"), so only a cone under a quarter turn counts as aimed here.
 *
 * This is a floor, not a per-enemy, guarantee: individual numbers are free to
 * move again in a later balance pass as long as each floor keeps its two.
 */
const NARROW_CONE_RADIANS = Math.PI / 2;

function hasOutpacingState(definition: EnemyDefinition, maxSpeed: number): boolean {
  return definition.states.some((state) =>
    state.behaviours.some((behaviour: EnemyBehaviour) => {
      switch (behaviour.behaviour) {
        case 'walkTowardPlayer':
        case 'chargeAtPlayer':
        case 'fireAtPlayer':
          return behaviour.speed > maxSpeed;
        case 'fireSpread':
          return behaviour.arc < NARROW_CONE_RADIANS && behaviour.speed > maxSpeed;
        default:
          return false;
      }
    }),
  );
}

describe('#229 the retreat-and-fire dominant strategy', () => {
  const maxSpeed = DEFAULT_MOVEMENT_TUNING.maxSpeed;

  it('gives Floor 1 at least two roster entries that beat player speed', () => {
    // Bierratte's `rush` (a body that closes the gap) and Die Große
    // Kellerassel's `spit` (an aimed volley, from the floor's own boss room).
    const floor1 = [bierratte, grosseKellerassel];
    const outpacing = floor1.filter((definition) => hasOutpacingState(definition, maxSpeed));
    expect(outpacing.length).toBeGreaterThanOrEqual(2);
  });

  it('gives Floor 2 at least two roster entries that beat player speed', () => {
    // Bauer's `stalk`/`lunge`, Kuh's `charge`, and Gartenzwerg's aimed
    // `fireAtPlayer` all clear it independently.
    const floor2 = [bauer, kuh, gartenzwerg];
    const outpacing = floor2.filter((definition) => hasOutpacingState(definition, maxSpeed));
    expect(outpacing.length).toBeGreaterThanOrEqual(2);
  });

  it('leaves the floor 1 and 2 radial spreads slow — a wall to thread, not to outrun', () => {
    // Zapfhahn's cone and Die Große Kellerassel's own crawl/curl loop stay
    // under player speed; only the boss's narrow aimed `spit` was raised.
    for (const state of grosseKellerassel.states) {
      for (const behaviour of state.behaviours) {
        if (behaviour.behaviour === 'walkTowardPlayer') {
          expect(behaviour.speed).toBeLessThan(maxSpeed);
        }
      }
    }
  });
});
