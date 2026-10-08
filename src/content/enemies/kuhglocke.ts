import type { EnemyDefinition } from '../../sim/enemy/definition.js';

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
