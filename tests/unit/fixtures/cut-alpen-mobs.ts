import type { EnemyDefinition } from '../../../src/sim/enemy/definition.js';

/**
 * The four Floor 4 mobs cut from the roster (steinbock, bergwacht, kuhglocke,
 * sennerin), kept as test fixtures: they are the worked examples the generic
 * primitives they brought (`climbsBlocks`, `mark`, `shoal`, `bounce`) are tested
 * through, and those primitives stay in the engine.
 */

/**
 * Steinbock — an ibex (#40, `docs/CONTENT_BIBLE.md`'s Floor 4 roster:
 * "charges and can climb over obstacles").
 *
 * Floor 2's Kuh taught the charge-and-punish loop and Floor 3's Boar held it
 * to the axes; the Steinbock takes the Boar's charge and takes away the one
 * answer a player has learnt for it — cover. Its charge `climbsBlocks`: a
 * boulder in the line is bounded over, not stopped at, so standing behind a
 * rock does not stop the ibex, only a wall does. The wind-up is long enough
 * to read (the floor is about committing to a line on ice, and so is this),
 * and the charge itself is straight at where the player stood when the
 * pawing began (`updateAimLock`), so stepping aside is the dodge.
 *
 * Lower contact damage than the Boar, no door-smashing: the idea is "cover
 * is not safe", one idea only, and the impact carries it. `mass` keeps a
 * player's bump from shoving a charging ibex off its line.
 */
export const steinbock: EnemyDefinition = {
  id: 'steinbock',
  name: 'Steinbock',
  size: 'mid',
  deathEffect: 'dust',
  // Side-on art: faces the way it runs, and the player it winds up at.
  facing: 'mirror',
  health: 8,
  contactDamage: 1,
  mass: 9,
  lootTier: 'tough',
  initial: 'graze',
  states: [
    {
      name: 'graze',
      behaviours: [{ behaviour: 'wander', speed: 0.4, turnEveryTicks: 60 }],
      transitions: [{ to: 'paw', whenPlayerWithin: 110 }],
    },
    {
      name: 'paw',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 40 }],
      transitions: [{ to: 'bound', after: 40 }],
    },
    {
      name: 'bound',
      behaviours: [
        {
          behaviour: 'chargeAtPlayer',
          speed: 3,
          climbsBlocks: true,
          impact: {
            bodyDamageMultiplier: 2,
            knockback: 4,
            breaksBlocks: false,
            breaksDoors: false,
          },
        },
      ],
      transitions: [
        { to: 'stand', onBlocked: true },
        // A charge always meets a wall; this is only the floor under it.
        { to: 'stand', after: 200 },
      ],
    },
    {
      name: 'stand',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'graze', after: 55 }],
    },
  ],
};

/**
 * Bergwacht — mountain rescue (#40, `docs/CONTENT_BIBLE.md`'s Floor 4
 * roster: "fires a flare that illuminates and marks you for others").
 *
 * The one idea is *being seen*. The rescuer keeps their distance — closing
 * when the player is far, backing off when they are near — and now and then
 * raises the pistol (`telegraph`) and fires a slow, bright flare at where the
 * player stood (`fireAtPlayer` with `mark`). A flare barely hurts; what it
 * does is mark the player: for the mark's duration every enemy in the room
 * sees them through cover and fires faster (`ProjectileTag.Marking`,
 * `tuning.projectileTags.playerMarkDurationTicks`). Alone it is a nuisance.
 * Behind a Sennerin and a shoal of Kuhglocken it is what turns a room from a
 * fight into a hunt — which is why the roster prices it like a support body
 * and places it rarely.
 */
export const bergwacht: EnemyDefinition = {
  id: 'bergwacht',
  name: 'Bergwacht',
  size: 'normal',
  health: 4,
  contactDamage: 1,
  lootTier: 'normal',
  initial: 'patrol',
  states: [
    {
      name: 'patrol',
      behaviours: [{ behaviour: 'wander', speed: 0.5, turnEveryTicks: 35 }],
      transitions: [
        { to: 'aim', whenPlayerWithin: 120 },
        { to: 'approach', whenPlayerBeyond: 120 },
      ],
    },
    {
      name: 'approach',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.9 }],
      transitions: [{ to: 'aim', whenPlayerWithin: 110 }],
    },
    {
      name: 'retreat',
      behaviours: [{ behaviour: 'fleeFromPlayer', speed: 1.1 }],
      transitions: [
        { to: 'aim', whenPlayerBeyond: 70 },
        { to: 'aim', after: 70 },
      ],
    },
    {
      name: 'aim',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 45 }],
      transitions: [{ to: 'flare', after: 45 }],
    },
    {
      name: 'flare',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireAtPlayer',
          everyTicks: 999,
          speed: 1.1,
          damage: 1,
          lifetimeTicks: 130,
          radius: 4,
          art: 'flare',
          mark: true,
        },
      ],
      transitions: [
        { to: 'retreat', whenPlayerWithin: 50 },
        { to: 'patrol', after: 90 },
      ],
    },
  ],
};

/**
 * Kuhglocke — a cowbell (#40, `docs/CONTENT_BIBLE.md`'s Floor 4 roster:
 * "floating swarm enemy, moves in a shoal, damages by contact").
 *
 * A bell with no cow under it, hanging in the air, ringing. One is nothing
 * — two health, no shot, slow. A shoal of them is the idea: they move as one
 * (`shoal` — pulled to each other, pulled to the player, kept a bell's width
 * apart), swinging round the room's rocks since they fly, and the damage is
 * contact. Shooting into the shoal thins it, which loosens it; the last bell
 * drifts at you alone. The roster places them in fours.
 *
 * Metal: a bell comes apart as shards and clanks when hit
 * (`content/audio/sfx.ts`).
 */
export const kuhglocke: EnemyDefinition = {
  id: 'kuhglocke',
  name: 'Kuhglocke',
  size: 'mini',
  deathEffect: 'shard',
  flying: true,
  health: 2,
  contactDamage: 1,
  lootTier: 'weak',
  initial: 'drift',
  states: [
    {
      name: 'drift',
      behaviours: [
        { behaviour: 'shoal', speed: 0.75, cohesion: 1, pull: 0.8, spacing: 14, inertia: 0.9 },
      ],
      transitions: [{ to: 'swing', whenPlayerWithin: 36 }],
    },
    {
      // Close: the shoal tightens on the player and speeds up a little — a
      // swing of the bell — then eases off, so it washes over rather than
      // sticks to them.
      name: 'swing',
      behaviours: [
        { behaviour: 'shoal', speed: 1.1, cohesion: 0.4, pull: 1.4, spacing: 12, inertia: 0.8 },
      ],
      transitions: [
        { to: 'drift', whenPlayerBeyond: 60 },
        { to: 'drift', after: 70 },
      ],
    },
  ],
};

/**
 * Sennerin — the dairymaid of the Alm (#40, `docs/CONTENT_BIBLE.md`'s Floor 4
 * roster: "throws cheese wheels that roll and ricochet").
 *
 * Floor 1's Zapfhahn and Floor 2's Bauer taught the aimed shot; the Sennerin
 * teaches that a shot can come *back*. She stands her ground, winds up
 * (`telegraph`) and rolls a wheel of cheese at where the player stood
 * (`fireAtPlayer` with `bounce`): big, slow, and it bounces off the walls and
 * off whatever it hits for `tuning.projectileTags.bounceMaxCount` bounces
 * before it stops. The second thing to dodge from one throw is the wheel
 * coming back off the wall behind you — and on ice, where the floor has
 * taken your braking away, that is the lesson the floor is about. She backs
 * off when crowded, since a wheel rolled at point-blank range is just a
 * contact hit.
 */
export const sennerin: EnemyDefinition = {
  id: 'sennerin',
  name: 'Sennerin',
  size: 'normal',
  health: 4,
  contactDamage: 1,
  lootTier: 'normal',
  initial: 'tend',
  states: [
    {
      name: 'tend',
      behaviours: [{ behaviour: 'wander', speed: 0.45, turnEveryTicks: 40 }],
      transitions: [{ to: 'heft', whenPlayerWithin: 130 }],
    },
    {
      name: 'heft',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 38 }],
      transitions: [{ to: 'roll', after: 38 }],
    },
    {
      name: 'roll',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireAtPlayer',
          everyTicks: 999,
          speed: 1.5,
          damage: 1,
          lifetimeTicks: 220,
          radius: 5,
          art: 'cheese-wheel',
          bounce: true,
        },
      ],
      transitions: [{ to: 'step', after: 20 }],
    },
    {
      // A step back if the player is close, else a breather, then the next wheel.
      name: 'step',
      behaviours: [{ behaviour: 'fleeFromPlayer', speed: 0.9 }],
      transitions: [
        { to: 'heft', whenPlayerBeyond: 60 },
        { to: 'heft', after: 60 },
      ],
    },
  ],
};

export const CUT_ALPEN_MOBS: readonly EnemyDefinition[] = [
  steinbock,
  bergwacht,
  kuhglocke,
  sennerin,
];
