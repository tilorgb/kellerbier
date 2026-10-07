import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Zecke — a tick (#406, `docs/CONTENT_BIBLE.md`'s Floor 3 roster). The
 * Bavarian Forest is a real tick-borne-disease area; the joke is local.
 *
 * Tiny — the one `micro`-sized body — and easy to lose on the dark forest
 * floor. It never hits hard: it hops at the player in tiny skittish hops,
 * two toward them and one back, and, once it
 * touches them, **latches on** (`latchOnPlayer`) and rides on Alois's hat,
 * keeping him poisoned until he shakes it off with a few sharp changes of
 * direction (`sim/systems/latch.ts`). It
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
  // The one micro (#406): small enough to sit on Alois's hat once it latches.
  size: 'micro',
  // A small, dry bug: the Kellerassel's dust, not a mushroom's spores.
  deathEffect: 'dust',
  // Drawn lying on the floor, head turned the way it hops.
  facing: 'crawl',
  health: 2,
  contactDamage: 0,
  lootTier: 'weak',
  initial: 'crawl',
  states: [
    {
      name: 'crawl',
      behaviours: [
        // Tiny hops, two in and one back: a net ~0.2 units a tick at the
        // global speed scale, slower than the 0.35 crawl it replaced — it
        // is meant to take its time reaching you, and the hop back is a
        // shot window. Every rest is rolled (a tick to double) and every
        // hop wobbles up to 18° (a tenth of a half-turn) off the line, so a
        // room of them hops about like bugs rather than marching in step.
        // It latches the moment it touches the player, mid-hop or not.
        {
          behaviour: 'hopTowardPlayer',
          hopDistance: 8,
          hopTicks: 5,
          restTicks: 7,
          restJitter: 1,
          aimJitterDegrees: 18,
          backEvery: 3,
        },
        { behaviour: 'latchOnPlayer' },
      ],
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
