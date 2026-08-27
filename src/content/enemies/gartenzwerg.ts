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
 */
export const gartenzwerg: EnemyDefinition = {
  id: 'gartenzwerg',
  name: 'Gartenzwerg',
  size: 'normal',
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
          speed: 1.4,
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
