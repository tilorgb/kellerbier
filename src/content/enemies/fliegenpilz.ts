import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Fliegenpilz — a fly agaric that does not move (#405,
 * `docs/CONTENT_BIBLE.md`'s Floor 3 roster).
 *
 * The floor's poison teacher: the first thing on Floor 3 that puts a cloud on
 * the ground, and the small version of the Waldradler's own clouds. It is
 * built so the lesson is a rhythm rather than a punishment — it only acts
 * while the player is close, it swells and greens before every burst
 * (`telegraphLook: 'bloat'`, with a ring growing out to the cloud's exact
 * radius), and the cooldown between bursts is long enough to step in, shoot
 * it, and step back out before the next one.
 *
 * Entirely data on #401's `emitCloud`. "Keep going only while the player is
 * still near" is transition order in `cooldown`: the `whenPlayerBeyond` check
 * is written first, so a player who has backed off sends it back to `idle`
 * rather than into another wind-up.
 */
export const fliegenpilz: EnemyDefinition = {
  id: 'fliegenpilz',
  remains: 'spores',
  name: 'Fliegenpilz',
  size: 'normal',
  // A mushroom comes apart the way the Schimmelfleck does.
  deathEffect: 'spore',
  telegraphLook: 'bloat',
  health: 5,
  contactDamage: 1,
  // Schimmelfleck's reasoning: a body that never moves must not be shoved
  // around the room by the player walking into it.
  mass: 12,
  // Rooted (in the ground, the stream, on the wall): shots do not push it.
  rooted: true,
  initial: 'idle',
  states: [
    {
      name: 'idle',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'bloat', whenPlayerWithin: 64 }],
    },
    {
      name: 'bloat',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 45 }],
      transitions: [{ to: 'burst', after: 45 }],
    },
    {
      name: 'burst',
      behaviours: [
        { behaviour: 'pause' },
        // 28: three and a half tiles across. At 40 it covered most of the
        // space round the mushroom, and there was nowhere near it to shoot from.
        { behaviour: 'emitCloud', radius: 28, growTicks: 12, lifetimeTicks: 90 },
      ],
      transitions: [{ to: 'cooldown', after: 1 }],
    },
    {
      name: 'cooldown',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [
        { to: 'idle', whenPlayerBeyond: 64 },
        { to: 'bloat', after: 120 },
      ],
    },
  ],
};
