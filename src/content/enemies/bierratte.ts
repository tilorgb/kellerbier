import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Bierratte — fast, erratic, two hit points.
 *
 * Written second, and written to prove a point: nothing in the engine was
 * touched to add it. It is the same thirteen primitives the Kellerassel is built
 * from, arranged differently.
 *
 * Its one idea is leading your shots. It scurries in changing directions while
 * it is far away, which is impossible to hit by aiming at where it is, and
 * commits to a straight run once it is close, which is the moment it can be
 * punished.
 *
 * #229: `rush` used to be 1.5, slower than `DEFAULT_MOVEMENT_TUNING.maxSpeed`
 * (1.8) — a rat that can never actually catch a player who is simply backing
 * away, which made Floor 1's one fast enemy dissolve into "the thing you
 * outwalk." Raised past player speed so committing to a straight run really
 * does mean something is closing on you; health raised from 1 to 2 alongside
 * it so it survives being grazed by a single shot the way "fast and erratic"
 * implies it should, rather than dying to whatever pellet happens to be
 * nearest when it commits.
 */
export const bierratte: EnemyDefinition = {
  id: 'bierratte',
  name: 'Bierratte',
  size: 'mini',
  health: 2,
  contactDamage: 1,
  lootTier: 'weak',
  initial: 'scurry',
  states: [
    {
      name: 'scurry',
      behaviours: [{ behaviour: 'wander', speed: 1.1, turnEveryTicks: 14 }],
      transitions: [{ to: 'rush', whenPlayerWithin: 45 }],
    },
    {
      name: 'rush',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 2 }],
      // Hysteresis on purpose: the same distance for both directions makes a
      // rat on the boundary flicker between states once a tick.
      transitions: [{ to: 'scurry', whenPlayerBeyond: 75 }],
    },
  ],
};
