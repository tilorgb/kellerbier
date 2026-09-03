import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Gartenzwerg — garden gnome (`docs/CONTENT_BIBLE.md`'s Floor 2 roster).
 *
 * "Plays dead until you turn your back": nothing in the engine reads which
 * way the player is facing, so `whenPlayerBeyond` stands in for "turned
 * away" — the gnome stays a harmless-looking statue while the player is
 * right on top of it and only wakes once they have actually moved off,
 * which is the same beat the flavour text describes even without a literal
 * facing check. `becomeInvulnerable` makes the statue real: shots during
 * `playingDead` splash off rather than doing nothing silently.
 *
 * #229: `fireAtPlayer` re-aims at the player on every volley, which makes it
 * an aimed shot rather than a spread — the kind of attack the speed pass asks
 * to beat `DEFAULT_MOVEMENT_TUNING.maxSpeed` rather than stay under it, so
 * retreating in a straight line is not automatically safe. Raised from 1.4
 * to 2.2, before `DEFAULT_ENEMY_TUNING.projectileSpeedScale` (0.9) is
 * applied — fast enough to have to be dodged, not just outwalked, with
 * enough margin left over the player's own (also nudged down) top speed
 * that the same pass's general slowdown doesn't erase the point of raising
 * it.
 */
export const gartenzwerg: EnemyDefinition = {
  id: 'gartenzwerg',
  name: 'Gartenzwerg',
  size: 'normal',
  // Painted plaster, and it shatters.
  deathEffect: 'shard',
  health: 2,
  // Harmless to bump into while it is playing statue — the hat throw is the
  // only thing about it that hurts.
  contactDamage: 0,
  lootTier: 'weak',
  initial: 'playingDead',
  states: [
    {
      name: 'playingDead',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'becomeInvulnerable', ticks: 200 }],
      transitions: [{ to: 'active', whenPlayerBeyond: 90 }],
    },
    {
      name: 'active',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireAtPlayer',
          everyTicks: 55,
          speed: 2.2,
          damage: 1,
          lifetimeTicks: 60,
        },
      ],
      transitions: [
        { to: 'playingDead', whenPlayerWithin: 30 },
        { to: 'playingDead', after: 110 },
      ],
    },
  ],
};
