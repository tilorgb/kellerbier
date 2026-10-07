import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Borkenkäfer — a bark-beetle swarm (#410, `docs/CONTENT_BIBLE.md`'s Floor 3
 * roster). The Nationalpark Bayerischer Wald is famous for its bark-beetle
 * damage; the joke is local, and the damage is the point.
 *
 * One swarm is one body with one health bar. It does not care about the
 * player: it goes for wood (`approachWood`) — a tile of the nearest log, stump
 * or barricade, then a floor plank, eaten through into a pit nobody can walk
 * across, then cover again, taking turns. The longer it lives,
 * the worse the room gets, so the threat is the clock rather than the bite.
 * Shots fly over the pits; the softlock guard (`sim/systems/pits.ts`) makes
 * sure no pit ever cuts the room off.
 *
 * Contact still hurts: walking through the swarm to reach it is the mistake
 * it punishes.
 */
export const borkenkaefer: EnemyDefinition = {
  id: 'borkenkaefer',
  name: 'Borkenkäfer',
  size: 'normal',
  // Small dry bugs, a lot of them: the Kellerassel's dust.
  deathEffect: 'dust',
  health: 7,
  contactDamage: 1,
  lootTier: 'normal',
  initial: 'eat',
  states: [
    {
      name: 'eat',
      behaviours: [
        { behaviour: 'approachWood', speed: 0.5, eatTicks: { obstacle: 120, plank: 90 } },
      ],
    },
  ],
};
