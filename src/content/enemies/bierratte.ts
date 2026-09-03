import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Bierratte — fast, erratic, two hit points.
 *
 * Written second, and written to prove a point: nothing in the engine was
 * touched to add it. It is the same thirteen primitives the Kellerassel is built
 * from, arranged differently.
 *
 * Its one idea is leading your shots. It scurries in changing directions while
 * it is far away, which is impossible to hit by aiming at where it is.
 *
 * #229: the first version of this pass replaced `scurry`'s own proximity
 * reaction with a silent `walkTowardPlayer` state faster than the player —
 * closing distance with no warning at all, which played as "gets pulled to
 * you" rather than as a threat you could read and answer. This is a
 * telegraphed assault instead, on the same primitives every other enemy's
 * wind-up uses: `scurry` reacts to the player being close by winding up
 * (the shared `telegraph` ring, same as Bauer's, Kuh's, Zapfhahn's), firing
 * one quick aimed shot faster than the player's own top speed — so a
 * straight retreat is not a free answer to it — then committing to a short
 * `dash` toward wherever that shot was aimed. `settle` is the one-tick fork
 * afterward: still close, and it winds up again; not, and it goes back to
 * being the thing you have to lead your shots on rather than something
 * chasing you down.
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
      transitions: [{ to: 'telegraph', whenPlayerWithin: 45 }],
    },
    {
      name: 'telegraph',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 16 }],
      transitions: [{ to: 'snipe', after: 16 }],
    },
    {
      name: 'snipe',
      // `everyTicks` well past this state's own `after` below: one shot on
      // the tick the state begins (`FiringBehaviourBase`'s own rule), never
      // a second one before `dash` takes over.
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'fireAtPlayer', everyTicks: 999, speed: 2, damage: 1, lifetimeTicks: 40 },
      ],
      transitions: [{ to: 'dash', after: 10 }],
    },
    {
      name: 'dash',
      // "A little dash" — brisk, but not the full charge a telegraphed lunge
      // like Bauer's or Kuh's own commits to. The shot above is what a
      // retreating player actually has to answer; this just closes the gap
      // for the rat's own contact damage if they don't.
      behaviours: [{ behaviour: 'chargeAtPlayer', speed: 1.8 }],
      transitions: [
        { to: 'settle', onBlocked: true },
        { to: 'settle', after: 14 },
      ],
    },
    {
      name: 'settle',
      behaviours: [{ behaviour: 'pause' }],
      // Same distance both ways, deliberately — `PlayerWithin`/`PlayerBeyond`
      // split the real line with no gap between them (`<=`/`>`), so there is
      // no boundary case to flicker on the way `scurry`'s own pair used to
      // need hysteresis for.
      transitions: [
        { to: 'telegraph', whenPlayerWithin: 45 },
        { to: 'scurry', whenPlayerBeyond: 45 },
      ],
    },
  ],
};
