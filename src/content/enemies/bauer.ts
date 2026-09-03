import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Bauer — farmer with a pitchfork (`docs/CONTENT_BIBLE.md`'s Floor 2 roster).
 *
 * Walks and lunges. The lunge is `chargeAtPlayer` behind a `telegraph`, the
 * same shape Zapfhahn's wind-up already teaches on Floor 1 — this is that
 * lesson applied to a body that closes distance first instead of standing
 * still, so the player has to read the telegraph while still moving.
 *
 * #229: `stalk` used to be 0.7, well under `DEFAULT_MOVEMENT_TUNING.maxSpeed`
 * — a farmer whose entire design is "stalk and lunge" who could never
 * actually stalk a retreating player into lunge range. Raised past player
 * speed so backing away buys time rather than resetting the fight for free,
 * deliberately just past it rather than by a wide margin — a first playtest
 * of the initial pass came back "too fast" overall, which is also why the
 * baseline itself came down (`DEFAULT_ENEMY_TUNING.speedScale`) rather than
 * this number being pushed any higher. `lunge`'s own 2.2 (already faster
 * than `stalk`, and unaffected by this note) is untouched, so the two states
 * keep their relative order — a brisk close followed by a real burst.
 */
export const bauer: EnemyDefinition = {
  id: 'bauer',
  name: 'Bauer',
  size: 'normal',
  health: 3,
  contactDamage: 1,
  initial: 'plow',
  states: [
    {
      name: 'plow',
      behaviours: [{ behaviour: 'wander', speed: 0.5, turnEveryTicks: 30 }],
      transitions: [{ to: 'stalk', whenPlayerWithin: 100 }],
    },
    {
      name: 'stalk',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 1.9 }],
      transitions: [
        { to: 'telegraph', whenPlayerWithin: 44 },
        { to: 'plow', whenPlayerBeyond: 140 },
      ],
    },
    {
      name: 'telegraph',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 24 }],
      transitions: [{ to: 'lunge', after: 24 }],
    },
    {
      name: 'lunge',
      behaviours: [{ behaviour: 'chargeAtPlayer', speed: 2.2 }],
      transitions: [
        { to: 'stalk', onBlocked: true },
        { to: 'stalk', after: 20 },
      ],
    },
  ],
};
