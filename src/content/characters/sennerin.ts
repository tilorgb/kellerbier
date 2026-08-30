import type { CharacterDefinition } from '../../app/meta/definition.js';

/**
 * D'Sennerin — throws Kuhglocken that come off the walls, and off her.
 *
 * `bouncing` on every shot plus a long Reichweite is a gun that fills a room
 * rather than aiming across it: in a big room she is hitting things she
 * never had line of sight to, and in a small one she is sharing the room
 * with four of her own bells. `ricochetHurtsOwner` is what makes that second
 * sentence true rather than atmospheric — a Kuhglocke that has already come
 * off something can hit her, and only after it has bounced, so firing is
 * never immediately suicidal but holding the trigger down in a corridor is.
 *
 * The Kuhschelle in her hands from the start is the same idea without the
 * danger: something of hers ringing away on its own, slowing whatever is
 * near it.
 */
export const sennerin: CharacterDefinition = {
  id: 'sennerin',
  name: 'D’Sennerin',
  note: 'Wirft Kuhglockn, de vo de Wänd zruckkemma. Aa auf sie.',
  requires: { kind: 'bossDefeated', floor: 2 },
  goal: 'Schlog Der Stier am Dorfplatz',
  traits: {
    id: 'sennerin',
    name: 'D’Sennerin',
    maxHealth: 5,
    startingBiermarken: 0,
    startingBombs: 0,
    startingKeys: 0,
    items: ['kuhschelle'],
    shotTags: ['bouncing'],
    stats: [
      { stat: 'reichweite', op: 'multiply', value: 1.6 },
      { stat: 'wurfkraft', op: 'multiply', value: 1.2 },
      { stat: 'stammwuerze', op: 'multiply', value: 1.15 },
    ],
    rules: ['ricochetHurtsOwner'],
  },
};
