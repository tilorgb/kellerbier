import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Kuh — cow (`docs/CONTENT_BIBLE.md`'s Floor 2 roster).
 *
 * "Wandering livestock" is not a separate hazard from this enemy — it is
 * this enemy, before it notices the player: `graze` is a slow, harmless
 * `wander`, exactly what the floor's own hazard bullet describes a room
 * full of these as. Once close, it charges in a straight line
 * (`chargeAtPlayer`, aimed once and never re-aimed, same as Rollfass's
 * roll) and needs a wall to stop it — `onBlocked` is what ends the charge,
 * not a timer — after which it stands stunned for a beat before it can
 * charge again.
 */
export const kuh: EnemyDefinition = {
  id: 'kuh',
  name: 'Kuh',
  size: 'mid',
  health: 5,
  contactDamage: 2,
  // Heavier than a plain 'mid' body: a charge that a player's own bump could
  // shove off its line would stop reading as "needs a wall to stop."
  mass: 9,
  initial: 'graze',
  states: [
    {
      name: 'graze',
      behaviours: [{ behaviour: 'wander', speed: 0.35, turnEveryTicks: 50 }],
      transitions: [{ to: 'telegraph', whenPlayerWithin: 70 }],
    },
    {
      name: 'telegraph',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 20 }],
      transitions: [{ to: 'charge', after: 20 }],
    },
    {
      name: 'charge',
      behaviours: [{ behaviour: 'chargeAtPlayer', speed: 2.6 }],
      transitions: [
        { to: 'stunned', onBlocked: true },
        // A charge across an open field never finds a wall — this is the
        // safety net so it still eventually stops rather than running
        // forever, not the normal way out of the state.
        { to: 'stunned', after: 50 },
      ],
    },
    {
      name: 'stunned',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'graze', after: 45 }],
    },
  ],
};
