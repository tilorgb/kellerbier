import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Zecke — a tick (#406, `docs/CONTENT_BIBLE.md`'s Floor 3 roster). The
 * Bavarian Forest is a real tick-borne-disease area; the joke is local.
 *
 * Tiny, slow, and easy to lose on the dark wooden floor. It never hits hard:
 * it crawls at the player and, once it touches them, **latches on**
 * (`latchOnPlayer`) and rides along keeping them poisoned until they shake it
 * off with a few sharp changes of direction (`sim/systems/latch.ts`). It
 * cannot be shot while it is on you — the answer is to shake it — and the
 * tick that lands on the floor afterwards lies there helpless for a second,
 * which is the reward for shaking it rather than drinking the poison away.
 *
 * `contactDamage` is zero on purpose: the poison is the whole of what it
 * does, and a touch that also took half a Maß would punish the player twice
 * for the one mistake.
 */
export const zecke: EnemyDefinition = {
  id: 'zecke',
  name: 'Zecke',
  size: 'mini',
  // A small, dry bug: the Kellerassel's dust, not a mushroom's spores.
  deathEffect: 'dust',
  health: 2,
  contactDamage: 0,
  lootTier: 'weak',
  initial: 'crawl',
  states: [
    {
      name: 'crawl',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.35 }, { behaviour: 'latchOnPlayer' }],
      transitions: [{ to: 'latched', onLatched: true }],
    },
    {
      name: 'latched',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'dropped', onShakenOff: true }],
    },
    {
      name: 'dropped',
      // Vulnerable: back on its collision layer, standing still, in reach.
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'crawl', after: 60 }],
    },
  ],
};
