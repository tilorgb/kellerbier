import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Kellerassel — woodlouse. The first thing anybody fights.
 *
 * It crawls at you, and when it is hit it curls into a ball that nothing can
 * hurt. That is the whole enemy, and the one idea it teaches is timing: a
 * player who holds the trigger down empties half a magazine into a shell, and a
 * player who waits half a second kills it in three shots. Every later enemy on
 * the floor is read against this one.
 *
 * The curl cannot renew itself. `becomeInvulnerable` counts from the moment the
 * state began, and only the crawling state has an `onHit` transition — so being
 * shot while curled does nothing at all, and the ball always opens again.
 */
export const kellerassel: EnemyDefinition = {
  id: 'kellerassel',
  name: 'Kellerassel',
  size: 'normal',
  health: 3,
  contactDamage: 1,
  initial: 'crawl',
  states: [
    {
      name: 'crawl',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.55 }],
      transitions: [{ to: 'curl', onHit: true }],
    },
    {
      name: 'curl',
      // Long enough that firing through it is visibly the wrong answer, short
      // enough that backing off and waiting is not a chore.
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'becomeInvulnerable', ticks: 40 }],
      transitions: [{ to: 'crawl', after: 40 }],
    },
  ],
};
