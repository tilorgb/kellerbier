import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Boar — a wild boar that charges along the four axes only (#409,
 * `docs/CONTENT_BIBLE.md`'s Floor 3 roster). The name is the user's own,
 * in English, and stays that way.
 *
 * It roots about slowly until the player crosses one of its four axis lines
 * in plain sight (`whenPlayerOnAxis`), then paws the ground (`telegraph`) and
 * charges straight down that axis (`chargeAtPlayer`, `snap: 'cardinal'`) the
 * whole way, until it hits something — and whatever that is pays for it
 * (`impact`): the player or *another enemy* takes double damage and is
 * thrown; cover is smashed; a secret wall opens; a closed door is broken
 * open, which lets the player walk out of a room they have not cleared. Then
 * it stands dazed for a moment.
 *
 * The aim locks the moment the wind-up starts (`updateAimLock`), on the
 * point the player was standing — on the axis — so stepping off the axis
 * during the pawing is the dodge, and the charge still runs down the line it
 * pointed at.
 */
export const boar: EnemyDefinition = {
  id: 'boar',
  name: 'Boar',
  size: 'mid',
  // An animal, like the Kuh.
  deathEffect: 'dust',
  // Side-on art: turns to face the way it runs, and the player it winds up at.
  facing: 'mirror',
  health: 9,
  contactDamage: 1,
  lootTier: 'tough',
  initial: 'roam',
  states: [
    {
      name: 'roam',
      behaviours: [{ behaviour: 'wander', speed: 0.35, turnEveryTicks: 70 }],
      transitions: [{ to: 'windup', whenPlayerOnAxis: { tolerance: 8 } }],
    },
    {
      name: 'windup',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 35 }],
      transitions: [{ to: 'charge', after: 35 }],
    },
    {
      name: 'charge',
      behaviours: [
        {
          behaviour: 'chargeAtPlayer',
          speed: 3.2,
          snap: 'cardinal',
          impact: { bodyDamageMultiplier: 2, knockback: 5, breaksBlocks: true, breaksDoors: true },
        },
      ],
      transitions: [
        { to: 'stunned', onBlocked: true },
        // A charge always meets a wall; this is only the floor under it.
        { to: 'stunned', after: 240 },
      ],
    },
    {
      name: 'stunned',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'roam', after: 50 }],
    },
  ],
};
